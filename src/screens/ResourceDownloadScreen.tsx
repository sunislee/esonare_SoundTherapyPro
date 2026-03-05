import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated, Easing, BackHandler, Alert } from 'react-native'; 
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
  
  // 逻辑脱钩：真实进度与 UI 进度分离
  const [realProgress, setRealProgress] = useState(0);
  const [isSmoothSliding, setIsSmoothSliding] = useState(false);
  const [isDownloadCompleted, setIsDownloadCompleted] = useState(false);
  const [isUiCompleted, setIsUiCompleted] = useState(false);

  // 逻辑脱钩：真实进度与 UI 进度分离
  useEffect(() => {
    const currentProgress = downloadInfo.progress;
    setRealProgress(currentProgress);
    
    // 80% 后的'视觉谎言'：UI 进度条不再实时跟随真实数据
    if (currentProgress >= 0.8 && !isSmoothSliding) {
      setIsSmoothSliding(true);
      
      // 使用 stopAnimation 回调获取当前动画值
      animatedProgress.stopAnimation((currentValue) => {
        const startProgress = Math.max(currentValue, 0.8);
        const remainingProgress = 1.0 - startProgress;
        const duration = (remainingProgress / 0.05) * 1000; // 每秒 5% 的速度
        
        // 开始匀速滑行动画
        Animated.timing(animatedProgress, {
          toValue: 1.0,
          duration: duration,
          easing: Easing.linear, // 匀速滑行
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished) {
            setIsUiCompleted(true);
          }
        });
      });
      
      return;
    }
    
    if (currentProgress < 0.8 && !isSmoothSliding) {
      // 80% 之前，UI 进度实时跟随真实进度
      Animated.timing(animatedProgress, {
        toValue: currentProgress,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }
    
    // 标记真实下载完成
    if (currentProgress >= 1.0) {
      setIsDownloadCompleted(true);
      // 强制设置 UI 完成状态，触发跳转
      setIsUiCompleted(true);
    }
  }, [downloadInfo.progress, isSmoothSliding]);

  // 【关键修复】监听 isUiCompleted，一旦完成立即跳转
  useEffect(() => {
    if (isUiCompleted && isDownloadCompleted) {
      console.log('[ResourceDownloadScreen] ✅ 下载完成，准备跳转...');
      // 延迟 500ms 确保用户看到完成状态
      const timer = setTimeout(() => {
        enterMainApp();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isUiCompleted, isDownloadCompleted]);

  // 定义 enterMainApp 函数在组件顶层
  const enterMainApp = async () => {
    // 【物理校验】检查资源状态，但即使未完全就绪也允许进入
    console.log('[ResourceDownloadScreen] 进入主应用前进行物理校验...');
    const isReallyReady = await OfflineService.isResourceReady();
    if (!isReallyReady) {
      console.warn('[ResourceDownloadScreen] ⚠️  资源未完全就绪，但允许进入应用');
    } else {
      console.log('[ResourceDownloadScreen] ✅ 物理校验通过，资源真实存在');
    }
    
    EngineControl.allow();
    try {
      await AudioService.setupPlayer();
    } catch (e) {}
    
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
        
        // 【关键修复 1】第一步：物理检查文件是否存在
        console.log('[ResourceDownloadScreen] 物理检查文件是否存在...');
        const firstAsset = AUDIO_MANIFEST[0];
        const firstPath = getLocalPath(firstAsset.category, firstAsset.filename);
        const fileExists = await RNFS.exists(firstPath);
        
        if (fileExists) {
          console.log('[ResourceDownloadScreen] ✅ 文件已存在，跳过下载');
          // 文件存在，直接跳转
          await enterMainApp();
          return;
        }
        
        console.log('[ResourceDownloadScreen] 文件不存在，需要下载');
        
        // 【关键修复 2】请求存储权限，确保下载文件可以写入
        console.log('[ResourceDownloadScreen] 请求存储权限...');
        const storageGranted = await PermissionService.requestStoragePermission();
        if (!storageGranted) {
          console.warn('[ResourceDownloadScreen] 存储权限被拒绝，但仍然尝试下载');
        } else {
          console.log('[ResourceDownloadScreen] 存储权限已授予');
        }
        
        // 【关键修复 3】使用 OfflineService 检查资源是否已经准备就绪
        console.log('[ResourceDownloadScreen] 调用 isResourceReady()...');
        const isReady = await OfflineService.isResourceReady();
        console.log(`[ResourceDownloadScreen] isResourceReady() 返回：${isReady}`);
        
        if (isReady) {
          // 如果资源已存在，立即跳转到 NameEntry
          console.log('[ResourceDownloadScreen] 资源已就绪，跳过下载');
          navigation.replace('NameEntry');
          return;
        }
        
        // 检查网络状态
        console.log('[ResourceDownloadScreen] 调用 isOfflineMode()...');
        const isOffline = await OfflineService.isOfflineMode();
        console.log(`[ResourceDownloadScreen] isOfflineMode() 返回：${isOffline}`);
        
        if (isOffline) {
          console.warn('[ResourceDownloadScreen] 检测到离线模式，无法下载资源');
          // 离线模式下显示提示，但仍然尝试进入主应用
          // 用户可以在有网络时重新下载
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

        // 下载完成后，进行完整性校验
        const integrity = await OfflineService.checkResourceIntegrity();
        if (integrity.isComplete) {
          await OfflineService.markAsReady();
          console.log('[ResourceDownloadScreen] 下载完成，资源完整性校验通过');
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
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
          {isUiCompleted ? getSafeText('player.landing.complete', '资源准备完成') : getSafeText('player.landing.loading', '正在进入心灵空间...')}
        </Text>
        
        {/* 进度条 */}
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
    marginBottom: 40,
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
