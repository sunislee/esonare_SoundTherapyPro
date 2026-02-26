import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, StatusBar, ActivityIndicator, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { DownloadService } from '../services/DownloadService';
import AudioService from '../services/AudioService';
import EngineControl from '../constants/EngineControl';
import { initLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';
import { GLOBAL_TOTAL_SIZE, ASSET_LIST, AUDIO_MANIFEST, getLocalPath as getLocalPathHelper } from '../constants/audioAssets';

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
      const MIN_DISPLAY_TIME = 2500;

      try {
        // 1. 优先初始化多语言设置
        await initLanguage();
        
        // 初始化完成后触发一次强制刷新
        setTick(t => t + 1);

        // 2. 【强制】物理文件校验：只检查本地文件，不联网
        let localTotalSize = 0;
        let existingFileCount = 0;
        
        for (const asset of ASSET_LIST) {
          const audioAsset = AUDIO_MANIFEST.find(a => a.id === asset.id);
          if (!audioAsset) continue;
          
          const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
          const fileExists = await RNFS.exists(localPath);
          
          if (fileExists) {
            try {
              const fileStat = await RNFS.stat(localPath);
              const size = Number(fileStat.size);
              localTotalSize += size;
              existingFileCount++;
            } catch (e) {
              console.log(`[LandingScreen] 文件读取失败: ${asset.id}, ${e}`);
            }
          }
        }
        
        console.log(`[LandingScreen] 物理校验: ${existingFileCount}/${ASSET_LIST.length} 文件, ${localTotalSize} bytes / ${GLOBAL_TOTAL_SIZE} bytes`);
        
        // 【强制】判断准则：if (本地总大小 < GLOBAL_TOTAL_SIZE)，则判为未完成，去下载页
        const isReady = localTotalSize >= GLOBAL_TOTAL_SIZE;
        
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        setTimeout(async () => {
          if (!isReady) {
            navigation.replace('Download');
          } else if (!userName && hasSkipped !== 'true') {
            navigation.replace('NameEntry');
          } else {
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