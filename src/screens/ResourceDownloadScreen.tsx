import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated, Easing, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { DownloadService, DownloadProgress } from '../services/DownloadService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';
import { GLOBAL_TOTAL_SIZE } from '../constants/audioAssets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ResourceDownloadScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [downloadInfo, setDownloadInfo] = useState<DownloadProgress>({
    progress: 0,
    receivedBytes: 0,
    totalBytes: GLOBAL_TOTAL_SIZE
  });
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });
  const breathAnim = useRef(new Animated.Value(0)).current;
  
  // 【防抖】网络恢复定时器
  const networkRecoveryTimer = useRef<NodeJS.Timeout | null>(null);

  // 【硬性约束】检查是否满 54MB
  const isDownloadComplete = useCallback((received: number): boolean => {
    return received >= GLOBAL_TOTAL_SIZE;
  }, []);

  // 【核心】进入主应用 - 只有满 54MB 才能调用
  const enterMainApp = useCallback(async () => {
    if (hasNavigated) return;
    
    // 【硬性约束】再次检查是否满 54MB
    if (!isDownloadComplete(downloadInfo.receivedBytes)) {
      console.error('[ResourceDownloadScreen] 跳转被拦截：文件未满 54MB！');
      setError('Download Incomplete');
      return;
    }

    console.log('[ResourceDownloadScreen] 文件已满 54MB，允许跳转');
    setHasNavigated(true);
    setIsComplete(true);

    EngineControl.allow();
    try {
      await AudioService.setupPlayer();
    } catch (e) {}

    const userName = await AsyncStorage.getItem('USER_NAME');
    const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');

    if (!userName && hasSkipped !== 'true') {
      navigation.replace('NameEntry');
    } else {
      navigation.replace('MainTabs');
    }
  }, [downloadInfo.receivedBytes, hasNavigated, isDownloadComplete, navigation]);

  // 【核心】开始下载
  const startDownload = useCallback(async () => {
    // 如果已经跳转，不再启动下载
    if (hasNavigated) return;

    // 检查网络
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected === false) {
      console.log('[ResourceDownloadScreen] 无网络，显示离线提示');
      setIsOffline(true);
      setError('No Network');
      return;
    }

    try {
      setError(null);
      setIsOffline(false);
      
      console.log('[ResourceDownloadScreen] 启动下载流程...');

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

        // 【硬性约束】只有满 54MB 才允许跳转
        if (isDownloadComplete(info.receivedBytes)) {
          console.log('[ResourceDownloadScreen] 下载完成，准备跳转');
          setTimeout(() => {
            enterMainApp();
          }, 500);
        }
      });

    } catch (err: any) {
      console.error('[ResourceDownloadScreen] 下载错误:', err);
      
      // 【严禁错误逃逸】任何错误都只能设置错误状态，禁止跳转
      if (err.message === 'No Network' || err.message?.includes('Network')) {
        setError('No Network');
        setIsOffline(true);
      } else {
        setError('Download Failed');
      }
      
      // 绝对不调用 enterMainApp()！
    }
  }, [enterMainApp, hasNavigated, isDownloadComplete]);

  // 【重试函数】手动点击重试按钮
  const handleRetry = useCallback(() => {
    console.log('[ResourceDownloadScreen] 用户点击重试按钮');
    
    // 【暴力重置】先重置 Service 状态
    DownloadService.reset();
    
    // 重置本地状态
    setError(null);
    hapticFlags.current = { p25: false, p50: false, p75: false, p100: false };
    
    // 重新启动下载
    startDownload();
  }, [startDownload]);

  useEffect(() => {
    // 【网络监听】监听网络状态变化
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      
      // 清除之前的恢复定时器
      if (networkRecoveryTimer.current) {
        clearTimeout(networkRecoveryTimer.current);
        networkRecoveryTimer.current = null;
      }

      if (offline) {
        console.log('[ResourceDownloadScreen] 检测到离线状态，停止下载');
        setIsOffline(true);
        setError('No Network');
        // 中断下载但不重置，保留进度
        DownloadService.reset();
      } else {
        console.log('[ResourceDownloadScreen] 网络已恢复');
        setIsOffline(false);
        
        // 【防抖】等待 1 秒确认网络稳定后再重试
        if (error === 'No Network' && !hasNavigated && !isComplete) {
          console.log('[ResourceDownloadScreen] 网络恢复，1秒后自动重试...');
          networkRecoveryTimer.current = setTimeout(() => {
            console.log('[ResourceDownloadScreen] 执行自动重试');
            // 【暴力重置】清理僵尸任务，重新开启 8 个全新线程
            DownloadService.reset();
            handleRetry();
          }, 1000);
        }
      }
    });

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

    // 启动下载
    startDownload();

    return () => {
      loop.stop();
      unsubscribe();
      // 清除恢复定时器
      if (networkRecoveryTimer.current) {
        clearTimeout(networkRecoveryTimer.current);
      }
    };
  }, [error, handleRetry, hasNavigated, isComplete, startDownload]);

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

  const progressPercent = Math.min(100, Math.round((downloadInfo.receivedBytes / GLOBAL_TOTAL_SIZE) * 100));

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

        {/* 【错误状态显示】断网或下载失败时显示 */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>📡</Text>
            <Text style={styles.errorTitle}>
              {error === 'No Network' ? '无网络连接' : '下载失败'}
            </Text>
            <Text style={styles.errorText}>
              {error === 'No Network'
                ? '请检查网络设置后重试'
                : '下载过程中发生错误，请重试'}
            </Text>
            {/* 【重试按钮】 */}
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.title}>{t('download.title')}</Text>
            <Text style={styles.subtitle}>{t('download.subtitle')}</Text>

            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPercent}%` }
                  ]}
                />
              </View>
              <View style={styles.progressTextRow}>
                <Text style={styles.progressPercent}>{progressPercent}%</Text>
                <Text style={styles.progressBytes}>
                  {formatMB(downloadInfo.receivedBytes)}MB / {formatMB(GLOBAL_TOTAL_SIZE)}MB
                </Text>
              </View>
            </View>

            <Text style={styles.tip}>{t('download.tip')}</Text>
          </>
        )}
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
  },
  // 【错误状态样式】
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
  },
  // 【重试按钮样式】
  retryButton: {
    backgroundColor: '#6C5DD3',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ResourceDownloadScreen;
