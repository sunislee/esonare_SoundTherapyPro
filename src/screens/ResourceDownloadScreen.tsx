import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated, Easing } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
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
  
  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });
  const breathAnim = useRef(new Animated.Value(0)).current;

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

    const startDownload = async () => { 
      try { 
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

      } catch (err) { 
        console.error('Download error:', err);
        await enterMainApp();
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