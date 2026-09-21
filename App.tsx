import React, { Component, type ErrorInfo, useState, useEffect } from 'react';
import { StatusBar, useColorScheme, ActivityIndicator, View, Text, Platform, DeviceEventEmitter, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { type AppStateStatus } from 'react-native';

// 【v1.4.2 Release 防御】全局 ErrorBoundary — 捕获所有组件渲染/挂载期同步错误
// Hermes Runtime Sync Error 不会经过 ExceptionsManagerModule.reportException，
// 而是直接 kill 进程。ErrorBoundary 是唯一能拦截这种错误的 React 机制。
interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<{ children: React.ReactNode }, GlobalErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalErrorBoundary] Caught React error:', error);
    console.error('[GlobalErrorBoundary] Component stack:', errorInfo.componentStack);
    // 【vc147 / P0-1】被边界吞掉的渲染期错误必须进原生上报通道，否则线上只剩 console 日志，
    // 无法验证监听器相关崩溃是否真的修好。此处只调用既有封装 CrashReportUtil，不新写上报逻辑。
    try {
      CrashReportUtil.logException(
        `[GlobalErrorBoundary] ${error?.name}: ${error?.message}\n${errorInfo?.componentStack?.slice(0, 1000) ?? ''}`,
      );
    } catch (reportError) {
      // 上报自身绝不能再抛出，否则边界会把用户留在空白界面上
      console.warn('[GlobalErrorBoundary] 异常上报失败:', reportError);
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ 应用异常</Text>
          <Text style={styles.errorMessage}>页面加载出错，点击重试继续</Text>
          <TouchableOpacity onPress={() => {
            this.setState({ hasError: false, error: null });
          }} style={styles.retryButton}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: { flex: 1, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  errorTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  errorMessage: { fontSize: 16, color: '#666', paddingHorizontal: 32, textAlign: 'center', marginBottom: 24 },
  retryButton: { backgroundColor: '#6C5DD3', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainNavigator } from './src/navigation/MainNavigator';
import { AudioProvider } from './src/context/AudioContext';
import AudioService from './src/services/AudioService';
import { initLanguage } from './src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { NativeModules } from 'react-native';
import { DownloadService } from './src/services/DownloadService';
import { DownloaderServiceInstance } from './src/services/DownloaderService';
import { preloadBackgroundAvailability } from './src/constants/scenes';
// 【🔥 Toast 修复】引入 react-native-toast-message 容器组件和配置
import Toast from 'react-native-toast-message';
import toastConfig from './src/config/toastConfig';
import ToastUtil from './src/utils/ToastUtil';
import { hasValidImageMagicBytes, readMagicHexPrefix } from './src/utils/imageMagic';
// 【PR-2 WiFi 提示】移动数据下载闸门 + 全局提示 Modal
import NetworkGateService from './src/services/NetworkGateService';
import WifiDownloadPrompt from './src/components/WifiDownloadPrompt';
// 【vc147 / P0-1】既有原生上报封装（NativeModules.CrashReport），不引入任何新依赖
import { CrashReportUtil } from './src/utils/CrashReportUtil';
// 【构建指纹 · 永久规则】启动即打印 [BUILD] sha=.. built=..，设备侧据此确证跑的是本次代码。
import { BUILD_STAMP } from './src/config/buildInfo';

console.log(BUILD_STAMP);

// 【🔥 v1.4.7 修复】自动下载场景背景图片（使用 RNFS.downloadFile，与 DownloadService 一致）
// 之前用 fetch + btoa + appendFile 处理二进制图片会损坏文件
async function autoDownloadSceneBackgrounds() {
  try {
    console.log('[App] 🖼️ [autoDownload] 检查并下载场景背景图片...');

    const RNFS = await import('@dr.pogodin/react-native-fs');
    const bgDir = `${RNFS.DocumentDirectoryPath}/audio_resources`;
    await RNFS.mkdir(bgDir);

    // 【magic 门烧配额防护 · item5 + 死锁修复】同一 URL 连续 2 次 magic 失败 → 跨启动持久化标记并跳过，
    // 避免「下坏文件→删→下次冷启再下」无限打爆 ghproxy 配额。
    // 【死锁修复】旧实现 >=2 后永久拉黑、唯一复位是成功下载但再不请求 → 瞬时限流把好 URL 永久黑洞化。
    //   现记 {n, ts}：满 2 次仅在冷却窗口(6h)内跳过；到期允许一次探测重试，CDN 恢复即可自愈。
    const MAGIC_GUARD_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 小时
    const failFile = `${bgDir}/.bg_magic_fail.json`;
    type FailRec = { n: number; ts: number };
    let magicFail: Record<string, FailRec> = {};
    try {
      if (await RNFS.exists(failFile)) {
        const raw = JSON.parse(await RNFS.readFile(failFile));
        // 向后兼容旧格式：纯数字 → 视为已过冷却(ts=0)，本次即允许探测，自愈历史黑洞化 URL。
        for (const k of Object.keys(raw)) {
          magicFail[k] = typeof raw[k] === 'number' ? { n: raw[k], ts: 0 } : raw[k];
        }
      }
    } catch { magicFail = {}; }
    const persistMagicFail = async () => {
      try { await RNFS.writeFile(failFile, JSON.stringify(magicFail), 'utf8'); } catch {}
    };
    const bumpMagicFail = async (u: string): Promise<number> => {
      const prev = magicFail[u]?.n || 0;
      magicFail[u] = { n: prev + 1, ts: Date.now() };
      await persistMagicFail();
      return magicFail[u].n;
    };
    const resetMagicFail = async (u: string) => {
      if (magicFail[u]) { delete magicFail[u]; await persistMagicFail(); }
    };
    // 是否应跳过该 URL：满 2 次且仍在冷却内才跳；到期则清记录放行一次探测。
    const shouldSkipMagicFail = (u: string): boolean => {
      const rec = magicFail[u];
      if (rec && rec.n >= 2) {
        if (Date.now() - (rec.ts || 0) < MAGIC_GUARD_COOLDOWN_MS) return true;
        delete magicFail[u]; // 冷却到期 → 允许本次探测重试（死锁自愈）
      }
      return false;
    };

    // 2) 下载西方教会背景图（4张独立图片，使用 ghproxy.net 加速源）
    // 【v1.4.7 修复】ghproxy.net 有缓存 bug，不同 URL 可能返回同一缓存文件，必须加 ?v=N 参数绕过
    const westernBgMap: Record<string, string> = {
      'western_church_candlelight.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/western_church_candlelight.webp?v=1`,
      'western_church_corridor.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/western_church_corridor.webp?v=2`,
      'western_church_light_rays.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/western_church_light_rays.webp?v=3`,
      'western_church_sunlight_monastery.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/western_church_sunlight_monastery.webp?v=4`,
    };

    // 3) 下载东方禅意背景图（3张，下载到 zen/ 子目录，使用 ghproxy.net 加速源）
    const zenSubDir = `${bgDir}/zen`;
    await RNFS.mkdir(zenSubDir);
    const zenBgMap: Record<string, string> = {
      'zen/bg_temple_lantern_gate.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/zen/bg_temple_lantern_gate.webp?v=1`,
      'zen/bg_temple_zen_lantern.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/zen/bg_temple_zen_lantern.webp?v=2`,
      'zen/buddha_morning.webp': `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/zen/buddha_morning.webp?v=3`,
    };

    const allFiles = { ...westernBgMap, ...zenBgMap };
    let downloadedCount = 0;

    for (const [filename, url] of Object.entries(allFiles)) {
      const localPath = `${bgDir}/${filename}`;
      const tempPath = `${localPath}.tmp`;
      try {
        // 【item5 终态跳过】该 URL 已连续 ≥2 次 magic 失败 → 本轮及后续冷启一律不再请求，停止烧配额。
        // 【item5 跳过 + 死锁自愈】满 2 次且仍在冷却内才跳；到期放行一次探测。
        if (shouldSkipMagicFail(url)) {
          console.warn(`[MAGIC-GUARD] ⛔ 冷却内跳过(连续${magicFail[url]?.n}次魔数失败): ${filename} | url=${url}`);
          continue;
        }

        // 检查是否已存在且有效（>1KB）
        const exists = await RNFS.exists(localPath);
        if (exists) {
          const stat = await RNFS.stat(localPath);
          // 【v1.4.8】size>1KB 且 magic bytes 合法才算有效；否则删除并落入下方重下分支
          if ((stat.size ?? 0) > 1024 && (await hasValidImageMagicBytes(localPath))) {
            console.log(`[App] 🖼️ [autoDownload] ✅ 已存在: ${filename} (${stat.size} bytes)`);
            await resetMagicFail(url);
            downloadedCount++;
            continue;
          } else {
            // 【取证 + item5】删除坏缓存前打印 url + 实际收到的前16字节；并计一次 magic 失败。
            const headHex = await readMagicHexPrefix(localPath, 16);
            const fc = await bumpMagicFail(url);
            console.warn(`[MAGIC-GATE] 🗑️ 缓存无效删除: ${filename} | url=${url} | size=${stat.size}B | head16=[${headHex}] | magicFail=${fc}`);
            if (fc >= 2) { console.warn(`[MAGIC-GUARD] ⛔ 连续${fc}次魔数失败 → 标记，6h 内跳过(到期自动探测): ${filename}`); continue; }
            await RNFS.unlink(localPath);
          }
        }

        // 使用 RNFS.downloadFile（与 DownloadService 一致，可靠处理二进制文件）
        console.log(`[App] 🖼️ [autoDownload] ⬇️ 下载中: ${filename}`);
        const result = await RNFS.downloadFile({
          fromUrl: url,
          toFile: tempPath,
          connectionTimeout: 10000,
          readTimeout: 15000,
        }).promise;

        if (result.statusCode === 200 || result.statusCode === 201) {
          const stat = await RNFS.stat(tempPath);
          // 【v1.4.8】size>1KB 且 magic bytes 合法才落盘；否则拒绝移动，坏字节绝不落地
          if (stat.size > 1024 && (await hasValidImageMagicBytes(tempPath))) {
            await RNFS.moveFile(tempPath, localPath);
            console.log(`[App] 🖼️ [autoDownload] ✅ 完成: ${filename} (${stat.size} bytes)`);
            await resetMagicFail(url);
            downloadedCount++;
          } else {
            // 【取证 + item5】新下坏字节：打印 url + 前16字节，计一次 magic 失败。
            const headHex = await readMagicHexPrefix(tempPath, 16);
            const fc = await bumpMagicFail(url);
            console.warn(`[MAGIC-GATE] 🚫 拒绝落盘(太小/魔数错): ${filename} | url=${url} | HTTP=${result.statusCode} | size=${stat.size}B | head16=[${headHex}] | magicFail=${fc}`);
            if (fc >= 2) console.warn(`[MAGIC-GUARD] ⛔ 连续${fc}次魔数失败 → 标记，6h 内跳过(到期自动探测): ${filename}`);
            try { await RNFS.unlink(tempPath); } catch {}
          }
        } else {
          console.warn(`[App] 🖼️ [autoDownload] ⚠️ HTTP ${result.statusCode}: ${filename} | url=${url}`);
          try { await RNFS.unlink(tempPath); } catch {}
        }
      } catch (err: any) {
        console.warn(`[App] 🖼️ [autoDownload] ⚠️ 下载失败: ${filename}`, err?.message || String(err));
        try { await RNFS.unlink(tempPath); } catch {}
      }
    }

    console.log(`[App] 🖼️ [autoDownload] 完成: ${downloadedCount}/${Object.keys(allFiles).length} 个背景图片就绪`);

    // 4) 刷新缓存状态 + 通知 UI 刷新缩略图
    await preloadBackgroundAvailability();
    DeviceEventEmitter.emit('backgroundImagesReady');
    console.log('[App] 🖼️ [autoDownload] ✅ 背景图预加载完成，UI 将自动刷新缩略图');
  } catch (err: any) {
    console.error('[App] ️ [autoDownload] ❌ 后台下载失败:', err?.message || String(err));
  }
}

// 【v1.4.1 关键修复】获取当前应用版本号
const APP_VERSION_CODE = NativeModules?.PackageInfo?.versionCode || 141;
const STORAGE_KEY_LAST_VERSION = '@soundtherapy_last_version';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 【🔥 Toast 修复】应用启动时初始化 ToastUtil，让 isInitialized=true
    ToastUtil.init();

    // 【PR-2 WiFi 提示】初始化网络状态检测（NetInfo 初始 fetch + 变化监听）
    NetworkGateService.init();

    const initApp = async () => {
      const startTime = Date.now();
      try {
        console.log('[App] ====== 开始初始化应用 ======');
        
        // 第一步：初始化语言
        console.log('[App] [1/3] 初始化语言...');
        await initLanguage();
        console.log('[App] [1/3] ✅ 语言初始化完成');
        
        // 【v1.4.1 关键修复】检查版本升级，强制重置 TrackPlayer
        console.log('[App] [2/3] 检查版本升级...');
        const lastVersion = await AsyncStorage.getItem(STORAGE_KEY_LAST_VERSION);
        const currentVersion = APP_VERSION_CODE;
        
        if (!lastVersion || parseInt(lastVersion) < currentVersion) {
          console.log(`[App] 🔄 检测到版本升级：${lastVersion || '首次安装'} -> ${currentVersion}`);
          
          // 【关键修复】强制重置 TrackPlayer，清理旧版本状态
          try {
            console.log('[App] 🧹 强制重置 TrackPlayer...');
            await TrackPlayer.reset();
            console.log('[App] ✅ TrackPlayer 已重置');
          } catch (resetError: any) {
            console.warn('[App] ⚠️ TrackPlayer 重置失败（可能未初始化）:', resetError?.message);
          }
          
          // 保存当前版本号
          await AsyncStorage.setItem(STORAGE_KEY_LAST_VERSION, currentVersion.toString());
          console.log('[App] ✅ 已保存新版本号');
        } else {
          console.log('[App] ✅ 版本一致，跳过重置');
        }
        
        // 第三步：初始化 AudioService
        console.log('[App] [3/3] 初始化 AudioService...');
        const audioService = AudioService.getInstance();
        
        // 【防御性检查】确保 TrackPlayer 已就绪
        try {
          await audioService.setupPlayer();
          console.log('[App] [3/3] ✅ AudioService 初始化完成');
          
        // 【🔥 v1.4.2 新增】后台自动下载场景背景图片，确保缩略图正确显示
        console.log('[App] 🖼️ [autoDownload] 启动后台背景图片下载...');
        autoDownloadSceneBackgrounds(); // async, does not block UI
        } catch (audioError: any) {
          console.error('[App] ❌ AudioService 初始化失败:', audioError?.message);
          // 尝试重新 setup
          console.log('[App] 🔄 尝试重新初始化 AudioService...');
          await new Promise(resolve => setTimeout(resolve, 500));
          await audioService.setupPlayer();
          console.log('[App] ✅ AudioService 重试成功');
        }
        
        const initTime = Date.now() - startTime;
        console.log(`[App] ⏱️ 应用初始化总耗时：${initTime}ms`);
        console.log('[App] ====== 应用初始化完成 ======');
        
        // 设置 isAudioReady 为 true，显示主界面（后台图片下载不阻塞 UI）
        setIsAudioReady(true);
      } catch (error: any) {
        console.error('[App] ❌ 初始化失败:', error);
        console.error('[App] ❌ 错误信息:', error?.message);
        console.error('[App] ❌ 错误堆栈:', error?.stack);
        setError(error?.message || 'Unknown error');
        setIsAudioReady(true);
      }
    };

    initApp();
  }, []);

  // 【P1-3 后台下载续命】App 从后台切回前台时重新触发下载：
  // 已下载资源被 FILE_CHECK 跳过，只补缺失文件 —— 天然支持后台中断后的续传
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        DownloaderServiceInstance.startDownload().catch((e: any) =>
          console.error('[App] 后台恢复触发下载失败:', e)
        );
      }
    });
    return () => sub.remove();
  }, []);

  if (!isAudioReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <ActivityIndicator size="large" color="#6C5DD3" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <Text style={{ color: 'red' }}>初始化失败：{error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <GlobalErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <AudioProvider>
              <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
              <MainNavigator />
              {/* 【🔥 Toast 容器】全局 Toast 弹出层 */}
              <Toast config={toastConfig} />
              {/* 【PR-2 WiFi 提示】移动数据下载全局提示 Modal */}
              <WifiDownloadPrompt />
            </AudioProvider>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GlobalErrorBoundary>
  );
}

export default App;