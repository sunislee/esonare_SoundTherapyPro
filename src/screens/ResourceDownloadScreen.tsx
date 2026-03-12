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
  
  // 【暴力修复 1】严防死守 100%：除非 18 个文件全部下载完成并通过物理校验，否则严禁显示"资源准备完成"
  const [realProgress, setRealProgress] = useState(0);
  const [isDownloadCompleted, setIsDownloadCompleted] = useState(false);
  const [isUiCompleted, setIsUiCompleted] = useState(false);
  const [allFilesVerified, setAllFilesVerified] = useState(false); // 【新增】物理校验通过标记

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
          console.error('[ResourceDownloadScreen] ❌ 物理校验失败，禁止显示"资源准备完成"');
          console.error(`缺失文件：${result.missingFiles.length}个`);
          console.error(`损坏文件：${result.corruptedFiles.length}个`);
          // 重置 UI 完成状态，继续下载
          setIsUiCompleted(false);
          setIsDownloadCompleted(false);
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
      // 资源不完整，绝对不允许进入！
      console.error('[ResourceDownloadScreen] ❌ 资源不完整，禁止进入应用！');
      console.error(`[ResourceDownloadScreen] 缺失文件：${fullIntegrity.missingFiles.length}个 - ${fullIntegrity.missingFiles.join(', ')}`);
      console.error(`[ResourceDownloadScreen] 损坏文件：${fullIntegrity.corruptedFiles.length}个 - ${fullIntegrity.corruptedFiles.join(', ')}`);
      
      // 强制停留在下载页面
      Alert.alert(
        t('download.incompleteTitle'),
        t('download.incompleteMessage', { count: fullIntegrity.missingFiles.length + fullIntegrity.corruptedFiles.length }),
        [{ text: t('common.continue') }]
      );
      return; // 不执行 navigation.replace
    }
    
    console.log('[ResourceDownloadScreen] ✅ 完整物理校验通过，所有资源真实存在');
    console.log(`[ResourceDownloadScreen] 已下载 ${fullIntegrity.details.length} 个文件`);
    
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
        
        // 【关键修复 1】请求存储权限，确保下载文件可以写入
        console.log('[ResourceDownloadScreen] 请求存储权限...');
        const storageGranted = await PermissionService.requestStoragePermission();
        if (!storageGranted) {
          console.warn('[ResourceDownloadScreen] 存储权限被拒绝，但仍然尝试下载');
        } else {
          console.log('[ResourceDownloadScreen] 存储权限已授予');
        }
        
        // 【关键修复 2】使用 OfflineService 检查资源是否已经准备就绪
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
          {allFilesVerified ? getSafeText('player.landing.complete', '资源准备完成') : getSafeText('player.landing.loading', '正在进入心灵空间...')}
        </Text>
        
        {/* 【关键优化】显示下载状态提示 */}
        {!isUiCompleted && (
          <Text style={styles.statusHintText}>
            {getSafeText('download.optimizing', 'Optimizing audio assets with 8 threads...')}
          </Text>
        )}
        
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
