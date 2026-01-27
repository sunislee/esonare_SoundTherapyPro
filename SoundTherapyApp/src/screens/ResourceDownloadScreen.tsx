import React, { useEffect, useState, useRef } from 'react'; 
import { View, ActivityIndicator, Text, StyleSheet, StatusBar } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { DownloadService, DownloadProgress } from '../services/DownloadService'; 
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';

export const ResourceDownloadScreen = ({ navigation }: any) => { 
  const [downloadInfo, setDownloadInfo] = useState<DownloadProgress>({
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0
  });
  
  const hapticFlags = useRef({ p25: false, p50: false, p75: false, p100: false });

  useEffect(() => { 
    const startApp = async () => { 
      // 1. 记录开始时间
      const startTime = Date.now();
      const MIN_DISPLAY_TIME = 2000; 

      // 2. 检查版本就绪状态
      const isReady = await DownloadService.isResourceReady(); 
      
      if (isReady) { 
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        setTimeout(async () => {
          await enterMainApp();
        }, remainingTime);
        
        return; 
      } 
 
      // 3. 新用户下载流程
      try { 
        await DownloadService.checkAndDownload((info) => { 
          setDownloadInfo(info);
          
          // 触发震动反馈：严格控制只在跨越阈值时触发一次
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
        
        // 确保下载完成后强制显示 100% 一小会儿再跳转，增加平滑感
        setTimeout(async () => {
          await enterMainApp();
        }, 500);

      } catch (err) { 
        await enterMainApp();
      } 
    }; 
 
    const enterMainApp = async () => {
      EngineControl.allow();
      try {
        await AudioService.setupPlayer();
      } catch (e) {}
      
      // 检查身份决定去向
      const userName = await AsyncStorage.getItem('USER_NAME');
      const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');

      if (!userName && hasSkipped !== 'true') {
        navigation.replace('NameEntry');
      } else {
        navigation.replace('MainTabs');
      }
    };

    startApp(); 
  }, []); 

  const formatMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };
 
  return ( 
    <View style={styles.container}> 
      <StatusBar barStyle="light-content" />
      <ActivityIndicator size="large" color="#6C5DD3" /> 
      <Text style={styles.text}>
        {downloadInfo.progress > 0 
          ? `资源配置中 (${Math.round(downloadInfo.progress * 100)}%)` 
          : '正在进入心灵空间...'}
      </Text> 
      {downloadInfo.progress > 0 && (
        <Text style={styles.byteText}>
          已下载: {formatMB(downloadInfo.receivedBytes)}MB / 共 {formatMB(downloadInfo.totalBytes)}MB
        </Text>
      )}
    </View> 
  ); 
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#FFFFFF', marginTop: 20, fontSize: 16, fontWeight: '600' },
  byteText: { color: '#94A3B8', marginTop: 8, fontSize: 12 }
});

export default ResourceDownloadScreen;