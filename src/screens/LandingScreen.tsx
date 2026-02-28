import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, StatusBar, ActivityIndicator, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineService } from '../services/OfflineService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';
import { initLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';

export const LandingScreen = ({ navigation }: any) => {
  const { t, i18n } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const breathAnim = useRef(new Animated.Value(0)).current;

  // 强制重新渲染，确保 i18n 初始化后能正确获取文本
  const [, setTick] = React.useState(0);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

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

    const checkAndBoot = async () => {
      const startTime = Date.now();
      // 调整为 1.5 秒的视觉停留时间
      const MIN_DISPLAY_TIME = 1500;

      try {
        // 1. 优先初始化多语言设置
        await initLanguage();
        
        // 初始化完成后触发一次强制刷新
        setTick(t => t + 1);

        // 2. 使用 OfflineService 进行统一的资源就绪检查
        const integrity = await OfflineService.checkResourceIntegrity();
        const resourceReady = await OfflineService.isResourceReady();
        
        console.log(`[LandingScreen] 资源完整性检查: ${integrity.existingFileCount}/${integrity.totalFileCount} 文件`);
        console.log(`[LandingScreen] 总大小: ${integrity.totalSize} bytes / ${integrity.expectedSize} bytes`);
        console.log(`[LandingScreen] 缺失: ${integrity.missingAssets.length}, 损坏: ${integrity.corruptedAssets.length}`);
        console.log(`[LandingScreen] 资源就绪状态: ${resourceReady}`);
        
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        
        // 打印详细日志
        console.log(`[LandingScreen] 启动检查: Name: ${userName ? '存在' : '不存在'}, Skipped: ${hasSkipped === 'true'}`);
        console.log(`[LandingScreen] AsyncStorage: USER_NAME=${userName}, HAS_SET_NAME=${hasSkipped}`);
        
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        setTimeout(async () => {
          // 资源就绪判断：使用 OfflineService 的统一判断
          if (!resourceReady) {
            console.log('[LandingScreen] 资源未就绪，跳转到下载页');
            navigation.replace('Download');
          } else if (!userName && hasSkipped !== 'true') {
            console.log('[LandingScreen] 资源就绪但未设置名字，跳转到起名页');
            navigation.replace('NameEntry');
          } else {
            console.log('[LandingScreen] 资源和名字都就绪，跳转到主页');
            // 引擎权限必须在 setupPlayer 之前开启
            EngineControl.allow();
            
            try { 
              await AudioService.setupPlayer(); 
            } catch (e) {
              console.error('[Landing] AudioService init failed:', e);
            }
            
            if (AudioService.isPlaying()) {
              const scene = AudioService.getCurrentScene();
              if (scene) {
                navigation.replace('ImmersivePlayer', { sceneId: scene.id });
                return;
              }
            }
            
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
        <Text style={styles.loadingText}>{t('player.landing.loading')}</Text>
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