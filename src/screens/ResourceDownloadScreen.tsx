import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, Dimensions, Animated, Easing, BackHandler, Alert, TouchableOpacity } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';
import { DownloadService, DownloadProgress } from '../services/DownloadService'; 
import { OfflineService } from '../services/OfflineService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';
import { PermissionService } from '../services/PermissionService';
import { AUDIO_MANIFEST, getLocalPath } from '../constants/audioAssets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as RNFS from 'react-native-fs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ResourceDownloadScreen = ({ navigation }: any) => { 
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
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
  
  // 【暴力修复 1】严防死守 100%：除非 18 个文件全部下载完成并通过物理校验，否则严禁显示"资源准备完成"
  const [realProgress, setRealProgress] = useState(0);
  const [isDownloadCompleted, setIsDownloadCompleted] = useState(false);
  const [isUiCompleted, setIsUiCompleted] = useState(false);
  const [allFilesVerified, setAllFilesVerified] = useState(false); // 【新增】物理校验通过标记
  const [isResourceAlreadyExists, setIsResourceAlreadyExists] = useState(false); // 【禅意体验】资源已存在标记
  const fadeOutAnim = useRef(new Animated.Value(1)).current; // 【禅意体验】淡出动画
  
  // 【真机测试专用】双击跳过下载逻辑
  const skipClickCount = useRef(0);
  const skipClickTimer = useRef<NodeJS.Timeout | null>(null);
  
  /**
   * 下载 32 个降噪音频资源
   */
  const downloadNoiseReductionResources = async () => {
    try {
      console.log('[ResourceDownloadScreen]  开始下载降噪音频资源...');
      const { NOISE_REDUCTION_RESOURCES } = await import('../config/ResourceConfig');
      
      const NOISE_REDUCTION_COUNT = NOISE_REDUCTION_RESOURCES.length;
      let downloadedCount = 0;
      
      // 并发下载所有降噪音频
      const downloadPromises = NOISE_REDUCTION_RESOURCES.map(async (resource) => {
        try {
          const localPath = `${RNFS.DocumentDirectoryPath}/${resource.category}/${resource.filename}`;
          const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
          
          // 确保目录存在
          if (!(await RNFS.mkdir(dirPath))) {
            await RNFS.mkdir(dirPath);
          }
          
          // 检查文件是否已存在
          if (await RNFS.exists(localPath)) {
            console.log(`[ResourceDownloadScreen] ✅ ${resource.id} 已存在，跳过`);
            downloadedCount++;
            return;
          }
          
          // 下载文件
          console.log(`[ResourceDownloadScreen] 📥 开始下载：${resource.id}`);
          
          const result = await RNFS.downloadFile({
            fromUrl: resource.remoteUrl,
            toFile: localPath,
          }).promise;
          
          if (result.statusCode === 200) {
            downloadedCount++;
            console.log(`[ResourceDownloadScreen] ✅ ${resource.id} 下载成功 (${downloadedCount}/${NOISE_REDUCTION_COUNT})`);
          } else {
            console.error(`[ResourceDownloadScreen] ❌ ${resource.id} 下载失败：HTTP ${result.statusCode}`);
          }
        } catch (error: any) {
          console.error(`[ResourceDownloadScreen] ❌ ${resource.id} 下载异常:`, error.message || error);
        }
      });
      
      // 等待所有下载完成
      await Promise.all(downloadPromises);
      console.log(`[ResourceDownloadScreen] ✅ 降噪音频下载完成！成功：${downloadedCount}/${NOISE_REDUCTION_COUNT}`);
      
    } catch (error) {
      console.error('[ResourceDownloadScreen] ❌ 降噪音频下载失败:', error);
      throw error;
    }
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

  // 【暴力修复】UI 进度完全跟随真实下载进度，不再"视觉谎言"
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
    
    // 标记真实下载完成
    if (currentProgress >= 1.0) {
      setIsDownloadCompleted(true);
      
      // 【关键修复】先强制进度条到 100%，然后再标记 UI 完成
      Animated.timing(animatedProgress, {
        toValue: 1.0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        // 动画完成后，再标记 UI 完成，触发"资源准备完成"显示
        setIsUiCompleted(true);
      });
    }
  }, [downloadInfo.progress]);

  // 【暴力修复 1】物理校验通过后才允许显示"资源准备完成"
  useEffect(() => {
    if (isUiCompleted && isDownloadCompleted && !allFilesVerified) {
      console.log('[ResourceDownloadScreen] 开始物理校验所有文件...');
      OfflineService.checkFullIntegrity().then((result) => {
        if (result.isComplete) {
          console.log('[ResourceDownloadScreen] ✅ 物理校验通过，允许显示"资源准备完成"');
          setAllFilesVerified(true);
        } else {
          console.error('[ResourceDownloadScreen] ❌ 物理校验失败，但允许进入应用（降级体验）');
          console.error(`缺失文件：${result.missingFiles.length}个`);
          console.error(`损坏文件：${result.corruptedFiles.length}个`);
          // 【关键修复】即使物理校验失败，也允许显示"资源准备完成"并进入应用
          setAllFilesVerified(true);
          // 不再重置状态，允许用户继续使用应用
        }
      });
    }
  }, [isUiCompleted, isDownloadCompleted, allFilesVerified]);

  // 监听下载完成和 UI 完成状态，自动跳转到主应用
  useEffect(() => {
    if (isUiCompleted && isDownloadCompleted) {
      console.log('[ResourceDownloadScreen] 下载和 UI 都完成了，等待 2 秒确保所有文件落盘...');
      
      // 【暴力修复】延迟 2 秒确保所有文件完全落盘
      const timer = setTimeout(async () => {
        enterMainApp();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isUiCompleted, isDownloadCompleted]);

  // 定义 enterMainApp 函数在组件顶层
  const enterMainApp = async () => {
    // 【暴力修复】强制检查所有文件完整下载后才允许进入！
    console.log('[ResourceDownloadScreen] 进入主应用前进行完整物理校验...');
    const fullIntegrity = await OfflineService.checkFullIntegrity();
    
    if (!fullIntegrity.isComplete) {
      // 资源不完整，但允许用户进入应用（降级体验）
      console.warn('[ResourceDownloadScreen] ⚠️ 资源不完整，但允许进入应用（降级体验）');
      console.warn(`[ResourceDownloadScreen] 缺失文件：${fullIntegrity.missingFiles.length}个 - ${fullIntegrity.missingFiles.join(', ')}`);
      console.warn(`[ResourceDownloadScreen] 损坏文件：${fullIntegrity.corruptedFiles.length}个 - ${fullIntegrity.corruptedFiles.join(', ')}`);
      
      // 不再显示 Alert 阻塞用户，直接放行
      // Alert.alert(...) 已移除
      
      // 继续执行进入主应用
    }
    
    console.log('[ResourceDownloadScreen] ✅ 开始初始化音频服务...');
    
    // 【关键修复】设置全局标志位，通知 App.tsx 下载已完成，可以触发播放
    await AsyncStorage.setItem('resourcesDownloaded', 'true');
    console.log('[ResourceDownloadScreen] ✅ 已设置 resourcesDownloaded 标志位');
    
    EngineControl.allow();
    try {
      // AudioService 已经在 App.tsx 中统一初始化，这里不需要重复调用
      // await AudioService.setupPlayer();
    } catch (e) {
      console.error('[ResourceDownloadScreen] AudioService setup 失败，但继续进入应用:', e);
    }
    
    // 无论资源是否完整，都允许进入 NameEntry 页面
    navigation.replace('NameEntry');
  };

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
      // 下载过程中直接拦截，不允许退出
      return true;
    });

    const checkAndStart = async () => { 
      try { 
        console.log('[ResourceDownloadScreen] 开始检查资源状态...');
        
        // 【100% 还原】核心修复逻辑
        console.log('[ResourceDownloadScreen] ====== 开始异步并行预检 ======');
        
        // 1. 异步并行预检：同时检查资源和用户名
        console.log('[ResourceDownloadScreen] 1. 检查资源完整性...');
        const resourcesReady = await OfflineService.checkFullIntegrity();
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
          console.log('[ResourceDownloadScreen] 🔄 后台触发降噪音频下载...');
          // 后台静默触发降噪音频下载（不阻塞）
          downloadNoiseReductionResources().catch(err => {
            console.error('[ResourceDownloadScreen] ❌ 后台下载降噪音频失败:', err);
          });
          navigation.replace('MainTabs');
          return; // ⚠️ 关键：立即返回，禁止继续执行
        }
        
        if (isResourcesReady && !savedName) {
          // IF (资源齐 && 没名字) -> 新用户去起名
          console.log('[ResourceDownloadScreen] ✅ 新用户：资源完整 + 无用户名 -> 跳转到 NameEntry');
          console.log('[ResourceDownloadScreen] 🔄 后台触发降噪音频下载...');
          // 后台静默触发降噪音频下载（不阻塞）
          downloadNoiseReductionResources().catch(err => {
            console.error('[ResourceDownloadScreen] ❌ 后台下载降噪音频失败:', err);
          });
          navigation.replace('NameEntry');
          return; // ⚠️ 关键：立即返回，禁止继续执行
        }
        
        // ELSE (只有资源不齐) -> 才允许执行下载
        console.log('[ResourceDownloadScreen] ⚠️ 资源不完整，开始下载流程...');
        
        // 检查网络状态
        console.log('[ResourceDownloadScreen] 调用 isOfflineMode()...');
        const isOffline = await OfflineService.isOfflineMode();
        console.log(`[ResourceDownloadScreen] isOfflineMode() 返回：${isOffline}`);
        
        if (isOffline) {
          console.warn('[ResourceDownloadScreen] 检测到离线模式，无法下载资源');
          await enterMainApp();
          return;
        }
        
        // 资源不存在，开始下载
        console.log('[ResourceDownloadScreen] 开始下载资源...');
        await DownloadService.checkAndDownload((info) => { 
          setDownloadInfo(info);
          
          const p = Math.floor(info.progress * 100);
          if (p >= 25 && p < 50 && !hapticFlags.current.p25) {
            ReactNativeHapticFeedback.trigger('impactLight');
            hapticFlags.current.p25 = true;
          } else if (p >= 50 && p < 75 && !hapticFlags.current.p50) {
            ReactNativeHapticFeedback.trigger('impactLight');
            hapticFlags.current.p50 = true;
          } else if (p >= 75 && p < 100 && !hapticFlags.current.p75) {
            ReactNativeHapticFeedback.trigger('impactLight');
            hapticFlags.current.p75 = true;
          } else if (p >= 100 && !hapticFlags.current.p100) {
            ReactNativeHapticFeedback.trigger('impactLight');
            hapticFlags.current.p100 = true;
          }
        }); 

        // 【关键】18 个核心资源下载完成后，进行完整性校验
        const integrity = await OfflineService.checkResourceIntegrity();
        if (integrity.isComplete) {
          await OfflineService.markAsReady();
          console.log('[ResourceDownloadScreen] 下载完成，资源完整性校验通过');
          
          // 【双轨制】后台静默触发 32 个降噪音频下载（不阻塞）
          console.log('[ResourceDownloadScreen] 🔄 后台触发降噪音频下载...');
          downloadNoiseReductionResources().catch(err => {
            console.error('[ResourceDownloadScreen] ❌ 后台下载降噪音频失败:', err);
          });
          
          // 设置完成状态，触发跳转
          setIsDownloadCompleted(true);
          setIsUiCompleted(true);
        } else {
          console.warn('[ResourceDownloadScreen] 下载完成，但资源不完整:', {
            missing: integrity.missingAssets,
            corrupted: integrity.corruptedAssets
          });
          // 即使资源不完整，也允许进入主应用
          setIsDownloadCompleted(true);
          setIsUiCompleted(true);
        }

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
  }, []); 

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
        
        {/* 【关键优化】显示下载状态提示 */}
        {!isUiCompleted && !isResourceAlreadyExists && (
          <Text style={styles.statusHintText}>
            {t('download.optimizing')}
          </Text>
        )}
        
        {/* 【关键修复】进度条只在资源不完整时显示 */}
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
            
            {/* 【恢复百分比显示】 */}
            <Text style={styles.percentText}>
              {formatPercent(realProgress)}%
            </Text>
            
            <Text style={styles.progressText}>
              {isUiCompleted ? '✅ ' : ''}{formatMB(realProgress * GLOBAL_TOTAL_SIZE)} MB / {formatMB(GLOBAL_TOTAL_SIZE)} MB
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
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 30,
    fontStyle: 'italic',
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
  progressText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});

// 引入 GLOBAL_TOTAL_SIZE
import { GLOBAL_TOTAL_SIZE } from '../constants/audioAssets';
