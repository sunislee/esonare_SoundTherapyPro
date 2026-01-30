import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, StatusBar, ActivityIndicator, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadService } from '../services/DownloadService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';

export const LandingScreen = ({ navigation }: any) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const breathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // 启动呼吸动画
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

    // --- [分流路由逻辑] ---
    const checkAndBoot = async () => {
      const startTime = Date.now();
      const MIN_DISPLAY_TIME = 2500; // 保证呼吸感展示

      try {
        // 1. 检查资源是否就绪
        const isReady = await DownloadService.isResourceReady();
        
        // 2. 检查用户信息
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        setTimeout(async () => {
          if (!isReady) {
            // A. 资源不完整 -> 去下载页
            navigation.replace('Download');
          } else if (!userName && hasSkipped !== 'true') {
            // B. 资源好了但没名字 -> 去填名页
            navigation.replace('NameEntry');
          } else {
            // C. 全部就绪 -> 进入主页
            EngineControl.allow();
            try { await AudioService.setupPlayer(); } catch (e) {}
            navigation.replace('MainTabs');
          }
        }, remainingTime);

      } catch (e) {
        console.error('Landing Error:', e);
        navigation.replace('Download');
      }
    };
    checkAndBoot();

    return () => {
      loop.stop();
    };
  }, [navigation, fadeAnim]);

  const iconScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const iconOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Animated.View style={{ 
          transform: [{ scale: iconScale }],
          opacity: iconOpacity,
          marginBottom: 20
        }}>
          <Text style={{ fontSize: 100 }}>🧘‍♂️</Text>
        </Animated.View>
        <Text style={styles.brandName}>ESONARE</Text>
        <Text style={styles.loadingText}>正在进入心灵空间...</Text>
      </Animated.View>
    </View>
  );
};

export default LandingScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center' },
  brandName: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', letterSpacing: 8 },
  loadingText: { color: '#94A3B8', fontSize: 16, marginTop: 20, letterSpacing: 2 },
});