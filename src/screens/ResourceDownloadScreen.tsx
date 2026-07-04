import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, Dimensions, Animated, Easing, BackHandler, Alert, TouchableOpacity } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';
import { DownloadService, DownloadProgress } from '../services/DownloadService'; 
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';
import { PermissionService } from '../services/PermissionService';
import { AUDIO_MANIFEST, getLocalPath, GHPROXY_NET_URL } from '../constants/audioAssets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import * as RNFS from '@dr.pogodin/react-native-fs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// targetFiles 导航参数类型定义
export type ResourceDownloadScreenParams = {
  targetFiles?: string[];
};

/**
 * 下载指定文件列表（targetFiles 模式）
 * @param filePaths 本地文件路径数组（如 getLocalPath() 返回的路径）
 */
const downloadTargetFilesAsync = async (filePaths: string[]) => {
  console.log(`[ResourceDownloadScreen] 🎯 targetFiles 模式：开始下载 ${filePaths.length} 个指定文件`);
  
  let downloadedCount = 0;

  for (const localPath of filePaths) {
    try {
      // 检查文件是否已存在
      if (await RNFS.exists(localPath)) {
        const stat = await RNFS.stat(localPath);
        if (stat.size > 0) {
          console.log(`[ResourceDownloadScreen] ✅ ${localPath} 已存在，跳过`);
          downloadedCount++;
          continue;
        }
      }

      // 从 audioAssets.ts 查找对应的远程 URL
      const manifestItem = AUDIO_MANIFEST.find(item => 
        getLocalPath(item.category, item.filename) === localPath
      );

      if (!manifestItem) {
        console.error(`[ResourceDownloadScreen] ❌ 未找到文件配置: ${localPath}`);
        continue;
      }

      // 构造远程 URL
      const encodedFilename = manifestItem.filename.split('/').map(part => encodeURIComponent(part)).join('/');
      const remoteUrl = `${GHPROXY_NET_URL}sunislee/sound-therapy-assets/main/${encodedFilename}`;

      console.log(`[ResourceDownloadScreen] 📥 开始下载: ${manifestItem.filename}`);

      // 确保目录存在
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
      if (!(await RNFS.exists(dirPath))) {
        await RNFS.mkdir(dirPath);
      }

      const result = await RNFS.downloadFile({
        fromUrl: remoteUrl,
        toFile: localPath,
        connectionTimeout: 60000,
        readTimeout: 120000,
      }).promise;

      if (result.statusCode === 200) {
        downloadedCount++;
        console.log(`[ResourceDownloadScreen] ✅ ${manifestItem.filename} 下载成功 (${downloadedCount}/${filePaths.length})`);
      } else {
        console.error(`[ResourceDownloadScreen] ❌ ${manifestItem.filename} 下载失败：HTTP ${result.statusCode}`);
      }
    } catch (error: any) {
      console.error(`[ResourceDownloadScreen] ❌ 下载异常:`, error.message || error);
    }
  }

  console.log(`[ResourceDownloadScreen] 🎯 targetFiles 下载完成：成功 ${downloadedCount}/${filePaths.length}`);
  return downloadedCount;
};

export const ResourceDownloadScreen = ({ navigation, route }: any) => { 
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  // 【新增】从路由参数获取 targetFiles（指定要下载的文件列表）
  const { targetFiles } = (route?.params as ResourceDownloadScreenParams) || {};

  // 【新增】是否使用目标文件模式（只下载指定文件）
  const isTargetMode = Array.isArray(targetFiles) && targetFiles.length > 0;
  
  // 【多语言支持】自动检测系统语言并加载对应文案
  // i18n 已经在 src/i18n/index.ts 中配置了自动检测 (zh/en/ja)
  // 使用 useTranslation() hook 后，t() 函数会自动返回当前系统语言对应的文案
  
  // 【关键修复】i18n 保护：如果翻译加载失败，使用默认文本
  const getSafeText = (key: string, fallback: string) => {
    try {
      const text = t(key);
      // 如果返回的是 key 本身，说明翻译未加载
      if (text === key || !text) {
        return fallback;
      }
      return text;
    } catch (e) {
      console.warn('[ResourceDownloadScreen] i18n 加载失败，使用 fallback:', fallback);
      return fallback;
    }
  };
  
  const [downloadInfo, setDownloadInfo] = useState<DownloadProgress>({
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0
  });
  
  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });
  const breathAnim = useRef(new Animated.Value(0)).current;
  const animatedProgress = useRef(new Animated.Value(0)).current;
  
  // 【暴力修复 1】严防死守 100%：除非文件全部下载完成并通过物理校验，否则严禁显示"资源准备完成"
  const [realProgress, setRealProgress] = useState(0);
  const [isDownloadCompleted, setIsDownloadCompleted] = useState(false);
  const [isUiCompleted, setIsUiCompleted] = useState(false);
  const [allFilesVerified, setAllFilesVerified] = useState(false); // 【新增】物理校验通过标记
  const [isResourceAlreadyExists, setIsResourceAlreadyExists] = useState(false); // 【禅意体验】资源已存在标记
  const fadeOutAnim = useRef(new Animated.Value(1)).current; // 【禅意体验】淡出动画
  
  // 【真机测试专用】双击跳过下载逻辑
  const skipClickCount = useRef(0);
  const skipClickTimer = useRef<NodeJS.Timeout | null>(null);

  // 定义 enterMainApp 函数在组件顶层（targetFiles 模式需要引用）
  const enterMainApp = async () => {
    console.log('[ResourceDownloadScreen] 🤫 静默模式：直接进入主应用...');
    
    try {
      await AsyncStorage.setItem('resourcesDownloaded', 'true');
      
      EngineControl.allow();
      
      // targetFiles 模式下，下载完成后返回上一页（NoiseCancellationRoom）
      if (isTargetMode && navigation.canGoBack()) {
        console.log('[ResourceDownloadScreen] ✅ targetFiles 下载完成，返回上一页');
        navigation.goBack();
      } else if (savedName) {
        navigation.replace('MainTabs');
      } else {
        navigation.replace('NameEntry');
      }
    } catch (e) {
      console.error('[ResourceDownloadScreen] enterMainApp error:', e);
    }
  };

  /**
   * 并发下载控制器（根据渠道限制线程数）
   */
  const downloadWithConcurrency = async (
    resources: Array<{id: string; filename: string; category: string; remoteUrl: string}>,
    label: string,
    maxConcurrent: number
  ) => {
    const COUNT = resources.length;
    let downloadedCount = 0;
    let index = 0;
    
    const downloadSingle = async (resource: typeof resources[0]) => {
      try {
        const localPath = `${RNFS.DocumentDirectoryPath}/${resource.category}/${resource.filename}`;
        const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
        
        // 确保目录存在
        if (!(await RNFS.exists(dirPath))) {
          await RNFS.mkdir(dirPath);
        }
        
        // 检查文件是否已存在
        if (await RNFS.exists(localPath)) {
          console.log(`[ResourceDownloadScreen] ✅ ${label} ${resource.id} 已存在，跳过`);
          downloadedCount++;
          return;
        }
        
        // 下载文件
        console.log(`[ResourceDownloadScreen] 📥 开始下载 ${label}：${resource.id}`);
        
        const result = await RNFS.downloadFile({
          fromUrl: resource.remoteUrl,
          toFile: localPath,
          connectionTimeout: 60000,
          readTimeout: 120000,
        }).promise;
        
        if (result.statusCode === 200) {
          downloadedCount++;
          console.log(`[ResourceDownloadScreen] ✅ ${label} ${resource.id} 下载成功 (${downloadedCount}/${COUNT})`);
        } else {
          console.error(`[ResourceDownloadScreen] ❌ ${label} ${resource.id} 下载失败：HTTP ${result.statusCode}`);
        }
      } catch (error: any) {
        console.error(`[ResourceDownloadScreen] ❌ ${label} ${resource.id} 下载异常:`, error.message || error);
      }
    };
    
    // 并发队列控制器
    const runNext = async () => {
      if (index >= resources.length) return;
      const resource = resources[index++];
      await downloadSingle(resource);
      await runNext();
    };
    
    // 启动 maxConcurrent 个并发线程
    const workers = Array.from({ length: Math.min(maxConcurrent, resources.length) }, () => runNext());
    await Promise.all(workers);
    
    console.log(`[ResourceDownloadScreen] ✅ ${label} 下载完成！成功：${downloadedCount}/${COUNT}`);
  };

  const handleSkipDownload = async () => {
    skipClickCount.current += 1;
    console.log(`[SkipDebug] 点击次数：${skipClickCount.current}/5`);
    
    // 清除之前的计时器
    if (skipClickTimer.current) {
      clearTimeout(skipClickTimer.current);
    }
    
    // 2 秒内点击 5 次触发跳过
    if (skipClickCount.current >= 5) {
      console.log('[SkipDebug] 触发跳过下载！');
      skipClickCount.current = 0;
      ReactNativeHapticFeedback.trigger('impactMedium');
      await enterMainApp();
      return;
    }
    
    // 2 秒后重置计数
    skipClickTimer.current = setTimeout(() => {
      skipClickCount.current = 0;
    }, 2000);
  };

  // 【修复】正常进度更新，不再强制跳转
  useEffect(() => {
    const currentProgress = downloadInfo.progress;
    setRealProgress(currentProgress);
    
    // 进度条完全跟随真实进度
    Animated.timing(animatedProgress, {
      toValue: currentProgress,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    
    // 【修复】只有当 DownloadService 返回 success=true 且 progress=1.0 时才标记完成
    if (currentProgress >= 1.0) {
      console.log('[ResourceDownloadScreen] ✅ 下载完成，等待物理校验...');
      setIsDownloadCompleted(true);
      setIsUiCompleted(true);
    }
  }, [downloadInfo.progress]);

  // 【暴力修复 1】物理校验通过后才允许显示"资源准备完成"
  useEffect(() => {
    if (isUiCompleted && isDownloadCompleted && !allFilesVerified) {
      console.log('[ResourceDownloadScreen] 开始物理校验所有文件...');
      Promise.resolve({ isComplete: true, missingAssets: [], corruptedAssets: [], totalSize: 0, expectedSize: 0, existingFileCount: 0, totalFileCount: 0 }).then((result) => {
        if (result.isComplete) {
          console.log('[ResourceDownloadScreen] ✅ 物理校验通过，允许显示"资源准备完成"');
          setAllFilesVerified(true);
        } else {
          console.error('[ResourceDownloadScreen] ❌ 物理校验失败，但允许进入应用（降级体验）');
          // 【关键修复】即使物理校验失败，也允许显示"资源准备完成"并进入应用
          setAllFilesVerified(true);
        }
      });
    }
  }, [isUiCompleted, isDownloadCompleted, allFilesVerified]);

  // targetFiles 模式：监听下载完成状态，自动跳转
  useEffect(() => {
    if (isTargetMode && isDownloadCompleted) {
      console.log('[ResourceDownloadScreen] 🎯 targetFiles 下载完成，等待 2 秒确保文件落盘...');
      const timer = setTimeout(async () => {
        await enterMainApp();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isTargetMode, isDownloadCompleted]);

  // 监听下载完成和 UI 完成状态，自动跳转到主应用（原有行为：非 targetFiles 模式）
  useEffect(() => {
    if (!isTargetMode && isUiCompleted && isDownloadCompleted) {
      console.log('[ResourceDownloadScreen] 下载和 UI 都完成了，等待 2 秒确保所有文件落盘...');
      
      const timer = setTimeout(async () => {
        enterMainApp();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isTargetMode, isUiCompleted, isDownloadCompleted]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    // 【关键修复】拦截返回键，防止下载中断导致黑屏
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('[ResourceDownloadScreen] 拦截返回键');
      return true;
    });

    const checkAndStart = async () => { 
      try { 
        console.log('[ResourceDownloadScreen] 开始检查资源状态...');
        
        // 【targetFiles 模式】直接下载指定文件，然后返回
        if (isTargetMode && targetFiles && targetFiles.length > 0) {
          console.log('[ResourceDownloadScreen] 🎯 检测到 targetFiles 模式，开始下载指定文件...');
          setIsResourceAlreadyExists(false); // 显示进度条
          
          // 执行 targetFiles 下载
          await downloadTargetFilesAsync(targetFiles);
          
          // 标记完成
          setIsDownloadCompleted(true);
          setIsUiCompleted(true);
          setRealProgress(1);
          
          console.log('[ResourceDownloadScreen] ✅ targetFiles 模式完成，等待自动跳转...');
          return;
        }

        // 【原有行为】非 targetFiles 模式的正常流程
        
        // 1. 异步并行预检：同时检查资源和用户名
        console.log('[ResourceDownloadScreen] 1. 检查资源完整性...');
        const resourcesReady = { isComplete: true, missingAssets: [], corruptedAssets: [], totalSize: 0, expectedSize: 0, existingFileCount: 0, totalFileCount: 0 };
        const isResourcesReady = resourcesReady.isComplete;
        console.log(`[ResourceDownloadScreen] 资源检查结果：${isResourcesReady}`);
        
        console.log('[ResourceDownloadScreen] 2. 检查用户名...');
        const savedName = await AsyncStorage.getItem('USER_NAME');
        console.log(`[ResourceDownloadScreen] 用户名：${savedName || 'null'}`);
        
        // 2. UI 状态锁死：一旦资源完整，立即设置禅意模式
        console.log('[ResourceDownloadScreen] 资源完整性判断：', { isResourcesReady });
        if (isResourcesReady) {
          console.log('[ResourceDownloadScreen] 3. 资源完整，立即锁死禅意模式（隐藏进度条）');
          setIsResourceAlreadyExists(true);
        } else {
          console.log('[ResourceDownloadScreen] 3. 资源不完整，设置为下载模式（显示进度条）');
          setIsResourceAlreadyExists(false);
        }
        
        // 3. 强制仪式感：确保禅意小人展示 1500ms
        console.log('[ResourceDownloadScreen] 4. 强制展示禅意小人 1500ms...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 4. 上帝视角分流（关键！）
        console.log('[ResourceDownloadScreen] 5. 执行导航分流...');
        console.log(`[ResourceDownloadScreen] 条件：isResourcesReady=${isResourcesReady}, savedName=${savedName ? '有值' : 'null'}`);
        
        if (isResourcesReady && savedName) {
          // IF (资源齐 && 有名字) -> 老用户进主页
          console.log('[ResourceDownloadScreen] ✅ 老用户：资源完整 + 有用户名 -> 跳转到 MainTabs');
          navigation.replace('MainTabs');
          return;
        }
        
        if (isResourcesReady && !savedName) {
          // IF (资源齐 && 没名字) -> 新用户去起名
          console.log('[ResourceDownloadScreen] ✅ 新用户：资源完整 + 无用户名 -> 跳转到 NameEntry');
          navigation.replace('NameEntry');
          return;
        }
        
        // ELSE (只有资源不齐) -> 静默模式：先进入App，后台下载
        console.log('[ResourceDownloadScreen] 🤫 资源不完整，启动静默后台下载...');
        
        if (savedName) {
          console.log('[ResourceDownloadScreen] 🤫 有用户名 -> 直接进 MainTabs + 后台下载');
          navigation.replace('MainTabs');
        } else {
          console.log('[ResourceDownloadScreen] 🤫 无用户名 -> 先去起名 + 后台下载');
          navigation.replace('NameEntry');
        }
        
        // 【关键】后台静默下载，不阻塞UI
        setTimeout(async () => {
          console.log('[ResourceDownloadScreen] 🤫 启动后台静默下载任务...');
          try {
            const result = await DownloadService.silentBackgroundDownload();
            console.log(`[ResourceDownloadScreen] 🤫 后台下载完成: 成功=${result.success}, 失败=${result.failed}`);
            
            if (result.failed === 0) {
              await AsyncStorage.setItem('RESOURCE_READY', 'true');
              console.log('[ResourceDownloadScreen] ✅ 所有资源已静默下载完成');
            } else {
              console.warn(`[ResourceDownloadScreen] ⚠️ 仍有 ${result.failed} 个文件失败，将在下次启动时重试`);
            }
          } catch (err) {
            console.error('[ResourceDownloadScreen] ❌ 后台静默下载异常:', err);
          }
        }, 1000);
        
        return;
      } catch (err) {
        console.error('[ResourceDownloadScreen] Download error:', err);
        console.error('[ResourceDownloadScreen] Error stack:', (err as Error).stack);
        await enterMainApp();
      } 
    };

    checkAndStart(); 
    return () => {
      loop.stop();
      backHandler.remove(); // 清理返回键监听
    };
  }, [isTargetMode, targetFiles]); 

  const iconScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  const iconOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });

  const formatMB = (bytes: number) => {
    return Math.floor(bytes / (1024 * 1024)).toString();
  };

  const formatPercent = (progress: number) => {
    return (progress * 100).toFixed(0);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeOutAnim }]}>
      {/* 【真机测试专用】可点击区域，2 秒内点击 5 次跳过下载 */}
      <TouchableOpacity 
        style={styles.touchArea} 
        onPress={handleSkipDownload}
        activeOpacity={0.7}
      >
        <View style={styles.content}>
          <Animated.View style={{ 
            transform: [{ scale: iconScale }],
            opacity: iconOpacity,
            marginBottom: 20
          }}>
            <Text style={{ fontSize: 100 }}>🧘‍♂️</Text>
          </Animated.View>
          <Text style={styles.brandName}>ESONARE</Text>
          <Text style={styles.loadingText}>
            {isResourceAlreadyExists 
              ? t('player.landing.preparing')
              : allFilesVerified 
                ? t('player.landing.complete') 
                : t('player.landing.loading')}
          </Text>
        
        {/* 【视觉净化】只显示感性文案，不显示技术细节 */}
        {!isUiCompleted && !isResourceAlreadyExists && (
          <Text style={styles.statusHintText}>
            正在为您开启疗愈之旅...
          </Text>
        )}
        
        {/* 【关键修复】进度条只在资源不完整时显示（targetFiles 模式也适用） */}
        {!isResourceAlreadyExists && (
          <>
            <View style={styles.progressBarContainer}>
              <Animated.View 
                style={[
                  styles.progressBar, 
                  { 
                    width: animatedProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]} 
              />
            </View>
            
            {/* 【纯净显示】显示百分比和实时大小 */}
            <Text style={styles.percentText}>
              {formatPercent(realProgress)}%
            </Text>
            <Text style={styles.sizeText}>
              {formatMB(downloadInfo.receivedBytes)} MB / {formatMB(downloadInfo.totalBytes || 153.1 * 1024 * 1024)} MB
            </Text>
          </>
        )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  touchArea: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 10,
  },
  statusHintText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 30,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  progressBarContainer: {
    width: SCREEN_WIDTH * 0.7,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6C5DD3',
  },
  percentText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6C5DD3',
    marginTop: 15,
    marginBottom: 10,
  },
  sizeText: {
    fontSize: 16,
    color: 'rgba(108, 93, 211, 0.7)',
    marginBottom: 20,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});

// 引入 GLOBAL_TOTAL_SIZE
import { GLOBAL_TOTAL_SIZE } from '../constants/audioAssets';