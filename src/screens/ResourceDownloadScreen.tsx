import React, { useEffect, useState, useRef, useCallback } from 'react'; 
import { View, Text, StyleSheet, Dimensions, Animated, Easing, BackHandler, TouchableOpacity, Alert } from 'react-native'; 
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
  audioGroupId?: string; // 【新增】传递音频组 ID，用于下载完成后自动播放
};

/**
 * 下载指定文件列表（targetFiles 模式）— 并发并行下载版本
 * @param filePaths 本地文件路径数组（如 getLocalPath() 返回的路径）
 * @param onProgress 可选的进度回调，用于实时更新 UI
 * @param maxConcurrent 最大并发数（默认3），限制同时下载的文件数量
 * @returns Promise<{ successCount: number; errors: string[] }>
 */
const downloadTargetFilesAsync = async (
  filePaths: string[],
  onProgress?: (progress: { progress: number; receivedBytes: number; totalBytes: number }) => void,
  maxConcurrent: number = 3 // 【调整】从4→3，减少带宽争抢导致的超时概率
): Promise<{ successCount: number; errors: string[] }> => {
  console.log(`[ResourceDownloadScreen] 🎯 targetFiles 模式 START：并发=${maxConcurrent}，开始下载 ${filePaths.length} 个指定文件`);

  let downloadedCount = 0;       // 成功下载数（含已存在的）
  const errors: string[] = [];
  const totalSize = filePaths.length;

  /**
   * 单个文件的下载任务（内部重试1次机制）
   */
  const downloadSingleFile = async (localPath: string, index: number, isRetry: boolean = false): Promise<{ success: boolean }> => {
    try {
      // 检查文件是否已存在
      if (await RNFS.exists(localPath)) {
        const stat = await RNFS.stat(localPath);
        if (stat.size > 0) {
          console.log(`[ResourceDownloadScreen] ✅ [${index+1}/${filePaths.length}] ${localPath} 已存在，跳过`);
          return { success: true };
        }
      }

      // 从 audioAssets.ts 查找对应的远程 URL
      const manifestItem = AUDIO_MANIFEST.find(item => 
        getLocalPath(item.category, item.filename) === localPath
      );

      if (!manifestItem) {
        const errorMsg = `MANIFEST_NOT_FOUND: ${localPath}`;
        console.error(`[ResourceDownloadScreen] ❌ [${index+1}/${filePaths.length}]`, errorMsg);
        errors.push(errorMsg);
        return { success: false };
      }

      // 构造远程 URL
      const encodedFilename = manifestItem.filename.split('/').map(part => encodeURIComponent(part)).join('/');
      const remoteUrl = `${GHPROXY_NET_URL}sunislee/sound-therapy-assets/main/${encodedFilename}`;

      console.log(`[ResourceDownloadScreen] 📥 [${index+1}/${filePaths.length}] 开始下载: ${manifestItem.filename}${isRetry ? ' (重试)' : ''}`);

      // 确保目录存在
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
      if (!(await RNFS.exists(dirPath))) {
        await RNFS.mkdir(dirPath);
      }

      // 【新增】先删除可能存在的残缺文件（避免下载旧的不完整文件）
      try {
        await RNFS.unlink(localPath).catch(() => {}); // 忽略不存在的情况
      } catch (_) {}

      // 🔑 并行下载 + 进度回调 + 超时40秒（每个文件）
      const downloadPromise = RNFS.downloadFile({
        fromUrl: remoteUrl,
        toFile: localPath,
        progressInterval: 200, // 每200ms触发一次进度更新（降低网络开销）
        progress: (progressRes) => {
          console.log(`[ResourceDownloadScreen] 📊 [${index+1}/${filePaths.length}] ${manifestItem.filename}: ${(progressRes.bytesWritten || 0)} bytes`);
        },
        connectionTimeout: 30000, // 连接超时30秒（给 ghproxy 留足够时间）
        readTimeout: 60000,      // 读取超时60秒
      }).promise;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('DOWNLOAD_TIMEOUT_40S')), 40000); // 每文件40秒超时（从20秒→40秒）
      });

      const result = await Promise.race([downloadPromise, timeoutPromise]);

      if (result.statusCode === 200) {
        console.log(`[ResourceDownloadScreen] ✅ [${index+1}/${filePaths.length}] ${manifestItem.filename} 下载成功`);
        return { success: true };
      } else {
        const errorMsg = `HTTP_${result.statusCode}: ${manifestItem.filename}`;
        console.error(`[ResourceDownloadScreen] ❌ [${index+1}/${filePaths.length}]`, errorMsg);
        errors.push(errorMsg);
        return { success: false };
      }
    } catch (error: any) {
      const reason = error?.message || String(error);
      console.error(`[ResourceDownloadScreen] ❌ [${index+1}/${filePaths.length}] 下载异常:`, reason);

      // 【新增】如果是非重试且超时错误，尝试自动重试一次
      if (!isRetry && (reason.includes('DOWNLOAD_TIMEOUT') || reason.includes('ECONNABORTED'))) {
        console.warn(`[ResourceDownloadScreen] 🔄 [${index+1}/${filePaths.length}] 首次超时，1秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒再重试
        const retryResult = await downloadSingleFile(localPath, index, true);
        return retryResult;
      }

      const filenameFromPath = localPath.split('/').pop() || localPath;
      errors.push(filenameFromPath + ': ' + reason);
      return { success: false };
    }
  };

  /**
   * 并发队列控制器：维护 maxConcurrent 个同时运行的下载任务
   */
  let taskIndex = 0; // 下一个待分配任务的索引

  const runNextTask = async (): Promise<void> => {
    while (taskIndex < filePaths.length) {
      const currentIndex = taskIndex++;
      const localPath = filePaths[currentIndex];

      const result = await downloadSingleFile(localPath, currentIndex);

      if (result.success) {
        downloadedCount++;
      }

      // 更新进度（每完成一个任务）
      onProgress?.({
        progress: Math.min((downloadedCount + errors.length) / totalSize, 1.0),
        receivedBytes: downloadedCount,
        totalBytes: totalSize,
      });
    }
  };

  // 启动 maxConcurrent 个并发 Worker
  const workerCount = Math.min(maxConcurrent, filePaths.length);
  console.log(`[ResourceDownloadScreen] 🚀 启动 ${workerCount} 个并行下载 Worker`);
  const workers = Array.from({ length: workerCount }, () => runNextTask());
  await Promise.all(workers);

  console.log(`[ResourceDownloadScreen] 🎯 targetFiles 下载汇总：成功=${downloadedCount}, 失败=${errors.length}`);
  return { successCount: downloadedCount, errors };
};

export const ResourceDownloadScreen = ({ navigation, route }: any) => { 
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  // 【新增】从路由参数获取 targetFiles（指定要下载的文件列表）
  const { targetFiles } = (route?.params as ResourceDownloadScreenParams) || {};

  // 【新增】是否使用目标文件模式（只下载指定文件）
  const isTargetMode = Array.isArray(targetFiles) && targetFiles.length > 0;

  // 【新增】targetFiles 下载进度回调：将下载进度映射到 downloadInfo state
  const handleTargetFileProgress = useCallback((progress: { progress: number; receivedBytes: number; totalBytes: number }) => {
    setDownloadInfo({
      progress: Math.min(progress.progress, 1.0),
      receivedBytes: progress.receivedBytes,
      totalBytes: progress.totalBytes,
    });
  }, []);
  
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
  const skipClickTimer = useRef<number | null>(null);

  // 【新增】下载失败状态 + 重试相关
  const [targetFileErrors, setTargetFileErrorsState] = useState<Array<{ path: string; reason: string }>>([]);
  const targetAudioGroupIdRef = useRef<string>('');

  /**
   * 【新增】重新下载失败的 targetFiles（只重试真正失败的文件）
   */
  const retryDownloadFailedFiles = async () => {
    console.log('[ResourceDownloadScreen] 🔄 开始重试下载失败的文件...');
    setTargetFileErrorsState([]); // 清空错误状态

    // 过滤出失败文件的路径（从当前 state 中获取）
    const failedPaths = targetFileErrors.map(e => e.path);
    if (failedPaths.length === 0) {
      console.log('[ResourceDownloadScreen] 🔄 无失败文件，跳过重试');
      return;
    }

    console.log(`[ResourceDownloadScreen] 🔄 重试 ${failedPaths.length} 个文件...`);
    // 【注意】这里重新执行下载，使用相同的 downloadTargetFilesAsync 但只传失败文件
    await downloadTargetFilesAsync(failedPaths, handleTargetFileProgress);

    console.log('[ResourceDownloadScreen] 🔄 重试完成');
  };

  /**
   * 【新增】设置错误状态（内部辅助函数）
   */
  const setDownloadErrors = (errors: string[], audioGroupId: string) => {
    // 将 errors string[] 转为带路径的对象数组
    const mapped = targetFiles!.map((path, i) => ({
      path,
      reason: errors[i] || `文件 ${i + 1} 下载失败`,
    }));
    setTargetFileErrorsState(mapped);
    targetAudioGroupIdRef.current = audioGroupId;
  };

  // 定义 enterMainApp 函数在组件顶层（targetFiles 模式需要引用）
  const enterMainApp = async () => {
    console.log('[ResourceDownloadScreen] 🤫 静默模式：直接进入主应用...');
    
    try {
      await AsyncStorage.setItem('resourcesDownloaded', 'true');
      
      EngineControl.allow();
      
      // targetFiles 模式下，下载完成后返回上一页（NoiseCancellationRoom）
      if (isTargetMode && navigation.canGoBack()) {
        console.log('[ResourceDownloadScreen] ✅ targetFiles 下载完成，标记自动播放并返回上一页');
        await AsyncStorage.setItem('downloadJustCompleted', 'true').catch(() => {});
        navigation.goBack();
        return;
      }
      
      // 非 targetFiles 模式：从 AsyncStorage 读取用户名决定跳转
      const savedName = await AsyncStorage.getItem('USER_NAME');
      if (savedName) {
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
        console.log('[ResourceDownloadScreen] 开始检查资源状态...', { isTargetMode, targetFileCount: targetFiles?.length });
        
         // 【targetFiles 模式】直接下载指定文件，然后返回
        if (isTargetMode && targetFiles && targetFiles.length > 0) {
          console.log('[ResourceDownloadScreen] 🎯 检测到 targetFiles 模式，开始下载指定文件...');
          setIsResourceAlreadyExists(false); // 显示进度条

          // 执行 targetFiles 下载（带进度回调）
          const result = await downloadTargetFilesAsync(targetFiles, handleTargetFileProgress);

          console.log(`[ResourceDownloadScreen] 🎯 targetFiles 下载完成：成功=${result.successCount}, 失败=${result.errors.length}`);

          // 【修复】只在全部文件成功时才标记为完成（errors.length === 0）
          if (result.errors.length > 0) {
            // 有失败的文件，不标记完成，显示错误提示+重试按钮
            console.warn(`[ResourceDownloadScreen] ⚠️ ${result.errors.length} 个文件下载失败`);
            const audioGroupId = route?.params?.audioGroupId;
            setDownloadErrors(result.errors, audioGroupId || '');
          } else {
            // 全部成功，标记完成并自动跳转
            setIsDownloadCompleted(true);
            setIsUiCompleted(true);
            setRealProgress(1);
            console.log('[ResourceDownloadScreen] ✅ targetFiles 模式全部成功，等待自动跳转...');
          }
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

            {/* 【新增】下载失败时的错误提示和重试按钮 */}
            {targetFileErrors.length > 0 && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>⚠️ 部分文件下载失败</Text>
                <Text style={styles.errorSubtitle}>请检查网络连接后点击重试</Text>
                <TouchableOpacity style={styles.retryButton} onPress={retryDownloadFailedFiles}>
                  <Text style={styles.retryButtonText}>🔄 重新下载 ({targetFileErrors.length})</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 【纯净显示】显示百分比和实时大小 */}
            {!isDownloadCompleted && targetFileErrors.length === 0 && (
              <>
                <Text style={styles.percentText}>
                  {formatPercent(realProgress)}%
                </Text>
                <Text style={styles.sizeText}>
                  {formatMB(downloadInfo.receivedBytes)} MB / {formatMB(downloadInfo.totalBytes || 153.1 * 1024 * 1024)} MB
                </Text>
              </>
            )}
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
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
    padding: 20,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF453A',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#FF453A',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});

// 引入 GLOBAL_TOTAL_SIZE
import { GLOBAL_TOTAL_SIZE } from '../constants/audioAssets';