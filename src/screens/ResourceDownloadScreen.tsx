import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated, Easing } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';
import { DownloadService, DownloadProgress } from '../services/DownloadService'; 
import { OfflineService } from '../services/OfflineService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ResourceDownloadScreen = ({ navigation }: any) => { 
  const { t } = useTranslation();
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
    }
  }, [downloadInfo.progress, isSmoothSliding]);

  // 定义 enterMainApp 函数在组件顶层
  const enterMainApp = async () => {
    EngineControl.allow();
    try {
      await AudioService.setupPlayer();
    } catch (e) {}
    
    // 直接跳转到 NameEntry，不再跳转到 MainTabs
    navigation.replace('NameEntry');
  };

  // 监听 UI 完成和真实下载完成的状态，处理跳转
  useEffect(() => {
    if (isUiCompleted && isDownloadCompleted) {
      // 强制停留：500ms 后跳转
      const timer = setTimeout(() => {
        enterMainApp();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isUiCompleted, isDownloadCompleted]);

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

    const checkAndStart = async () => { 
      try { 
        // 使用 OfflineService 检查资源是否已经准备就绪
        const isReady = await OfflineService.isResourceReady();
        if (isReady) {
          // 如果资源已存在，立即跳转到 NameEntry
          console.log('[ResourceDownloadScreen] 资源已就绪，跳过下载');
          navigation.replace('NameEntry');
          return;
        }
        
        // 检查网络状态
        const isOffline = await OfflineService.isOfflineMode();
        if (isOffline) {
          console.warn('[ResourceDownloadScreen] 检测到离线模式，无法下载资源');
          // 离线模式下显示提示，但仍然尝试进入主应用
          // 用户可以在有网络时重新下载
          await enterMainApp();
          return;
        }
        
        // 资源不存在，开始下载
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
        } else {
          console.warn('[ResourceDownloadScreen] 下载完成，但资源不完整:', {
            missing: integrity.missingAssets,
            corrupted: integrity.corruptedAssets
          });
        }

      } catch (err) { 
        console.error('Download error:', err);
        await enterMainApp();
      } 
    };

    checkAndStart(); 
    return () => loop.stop();
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
    return (bytes / (1024 * 1024)).toFixed(2);
  };
 
  const progressPercent = Math.round(downloadInfo.progress * 100);

  // 计算动画进度的百分比
  const animatedProgressPercent = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return ( 
    <View style={styles.container}> 
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.content}>
        <Animated.View style={{
          transform: [{ scale: iconScale }],
          opacity: iconOpacity,
          marginBottom: 30
        }}>
          <Text style={{ fontSize: 100 }}>🧘‍♂️</Text>
        </Animated.View>
        <Text style={styles.title}>{t('download.title')}</Text>
        <Text style={styles.subtitle}>{t('download.subtitle')}</Text>


                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <Animated.View 
                      style={[
                        styles.progressBarFill, 
                        { width: animatedProgressPercent }
                      ]} 
                    />
                  </View>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressPercent}>{progressPercent}%</Text>
                    {downloadInfo.totalBytes > 0 ? (
                      <Text style={styles.progressBytes}>
                        {formatMB(downloadInfo.receivedBytes)}MB / {formatMB(downloadInfo.totalBytes)}MB
                      </Text>
                    ) : (
                      <Text style={styles.progressBytes}>{t('download.calculating')}</Text>
                    )}
                  </View>
                </View>
  
                <Text style={styles.tip}>{t('download.tip')}</Text>
              </View>
    </View> 
  ); 
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F172A', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  content: {
    width: '80%',
    alignItems: 'center',
  },
  loadingIcon: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 40,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 20,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6C5DD3',
    borderRadius: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  progressPercent: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBytes: {
    color: '#64748B',
    fontSize: 12,
  },
  tip: {
    color: '#475569',
    fontSize: 12,
    marginTop: 20,
  }
});

export default ResourceDownloadScreen;