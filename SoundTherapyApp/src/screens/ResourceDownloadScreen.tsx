import React, { useEffect, useState, useRef } from 'react'; 
import { View, Text, StyleSheet, StatusBar, Dimensions } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { DownloadService, DownloadProgress } from '../services/DownloadService'; 
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ResourceDownloadScreen = ({ navigation }: any) => { 
  const [downloadInfo, setDownloadInfo] = useState<DownloadProgress>({
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0
  });
  
  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });

  useEffect(() => {
    const startDownload = async () => { 
      try { 
        await DownloadService.checkAndDownload((info) => { 
          setDownloadInfo(info);
          
          // 触发震动反馈
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
        
        // 下载完成后延迟跳转
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
  }, []); 

  const formatMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2);
  };
 
  const progressPercent = Math.round(downloadInfo.progress * 100);

  return ( 
    <View style={styles.container}> 
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.content}>
        <Text style={styles.title}>资源下载中</Text>
        <Text style={styles.subtitle}>正在为您准备沉浸式音频资源...</Text>

        {/* 进度条容器 */}
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
                      <Text style={styles.progressBytes}>正在计算资源大小...</Text>
                    )}
                  </View>
                </View>

                <Text style={styles.tip}>初次使用请保持网络畅通，正在为您同步高品质音频</Text>
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