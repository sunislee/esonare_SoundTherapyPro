import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated, Easing, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { DownloadService, DownloadProgress } from '../services/DownloadService';
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
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });
  const breathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 【网络监听】监听网络状态变化
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      if (offline) {
        console.log('[ResourceDownloadScreen] 检测到离线状态');
        setError('No Network');
      } else if (error === 'No Network') {
        // 网络恢复，自动重试
        console.log('[ResourceDownloadScreen] 网络恢复，自动重试下载');
        setError(null);
        startDownload();
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

    const startDownload = async () => {
      try {
        setError(null);
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

        setTimeout(async () => {
          await enterMainApp();
        }, 800);

      } catch (err: any) {
        console.error('Download error:', err);
        if (err.message === 'No Network') {
          setError('No Network');
        } else {
          setError('Download Failed');
        }
      }
    };

    const enterMainApp = async () => {
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
    };

    startDownload();
    return () => {
      loop.stop();
      unsubscribe();
    };
  }, [navigation]);

  // 【重试函数】手动点击重试按钮
  const handleRetry = () => {
    console.log('[ResourceDownloadScreen] 用户点击重试按钮');
    setError(null);
    setDownloadInfo({ progress: 0, receivedBytes: 0, totalBytes: 0 });
    // 重新触发下载
    const startDownload = async () => {
      try {
        await DownloadService.checkAndDownload((info) => {
          setDownloadInfo(info);
        });
        setTimeout(async () => {
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
        }, 800);
      } catch (err: any) {
        console.error('Retry download error:', err);
        if (err.message === 'No Network') {
          setError('No Network');
        } else {
          setError('Download Failed');
        }
      }
    };
    startDownload();
  };

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

        {/* 【错误状态显示】 */}
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
