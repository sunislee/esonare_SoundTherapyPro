import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, Animated, StatusBar, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
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

  // 【离线状态】网络状态监听
  const [isOffline, setIsOffline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  // 【锁死跳转】一旦开始导航，禁止任何后续逻辑
  const [isNavigating, setIsNavigating] = useState(false);
  
  // 【防抖】网络状态稳定计时器
  const networkStableTimer = useRef<NodeJS.Timeout | null>(null);
  const lastNetworkState = useRef<boolean | null>(null);

  // 强制重新渲染，确保 i18n 初始化后能正确获取文本
  const [, setTick] = React.useState(0);

  // 【核心函数】检查资源并导航 - 使用 useCallback 确保稳定性
  const checkResourceAndNavigation = useCallback(async () => {
    // 【锁死】如果已经在导航中，直接返回
    if (isNavigating) {
      console.log('[LandingScreen] 跳转已锁定，忽略重复调用');
      return;
    }

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

      // 【离线拦截】如果没网且资源不足，显示离线提示，禁止跳转
      const netInfo = await NetInfo.fetch();
      const currentlyOffline = netInfo.isConnected === false;

      if (currentlyOffline && !isReady) {
        console.log('[LandingScreen] 离线状态且资源不足，显示离线提示');
        setIsOffline(true);
        setIsChecking(false);
        return; // 禁止自动跳转，停留在当前页面显示离线提示
      }

      const userName = await AsyncStorage.getItem('USER_NAME');
      const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');

      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

      setTimeout(async () => {
        // 【锁死】再次检查，防止竞态
        if (isNavigating) {
          console.log('[LandingScreen] 跳转已执行，忽略');
          return;
        }
        
        // 【锁死】标记为正在导航
        setIsNavigating(true);

        if (!isReady) {
          console.log('[LandingScreen] 资源不足，跳转下载页');
          navigation.replace('Download');
        } else if (!userName && hasSkipped !== 'true') {
          console.log('[LandingScreen] 跳转用户名页');
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
              console.log('[LandingScreen] 跳转沉浸播放器');
              navigation.replace('ImmersivePlayer', { sceneId: scene.id });
              return;
            }
          }

          console.log('[LandingScreen] 跳转主页');
          navigation.replace('MainTabs');
        }
      }, remainingTime);

    } catch (e) {
      console.error('Landing Error:', e);
      if (!isNavigating) {
        setIsNavigating(true);
        navigation.replace('Download');
      }
    }
  }, [navigation, isNavigating]);

  useEffect(() => {
    // 【网络监听】监听网络状态变化 - 带防抖
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true;
      const wasOffline = lastNetworkState.current === false;
      
      // 更新当前网络状态
      lastNetworkState.current = state.isConnected;
      
      // 清除之前的定时器
      if (networkStableTimer.current) {
        clearTimeout(networkStableTimer.current);
        networkStableTimer.current = null;
      }

      if (!isConnected) {
        console.log('[Network Check] 离线状态，拦截下载！');
        setIsOffline(true);
      } else if (wasOffline && isConnected) {
        // 【防抖】网络从离线恢复，等待 1.5 秒确认稳定后才执行
        console.log('[Network Check] 网络恢复，等待 1.5 秒防抖...');
        networkStableTimer.current = setTimeout(() => {
          // 【锁死】检查是否已经在导航中
          if (isNavigating) {
            console.log('[Network Check] 已跳转，忽略网络恢复');
            return;
          }
          
          console.log('[Network Check] 网络稳定，执行跳转');
          setIsOffline(false);
          checkResourceAndNavigation();
        }, 1500);
      }
    });

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

    // 首次启动检查
    checkResourceAndNavigation();

    return () => {
      loop.stop();
      unsubscribe();
      // 清除防抖定时器
      if (networkStableTimer.current) {
        clearTimeout(networkStableTimer.current);
      }
    };
  }, [checkResourceAndNavigation, fadeAnim, isNavigating]);

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

        {/* 【离线提示】当离线且资源不足时显示 */}
        {isOffline ? (
          <View style={styles.offlineContainer}>
            <Text style={styles.offlineIcon}>📡</Text>
            <Text style={styles.offlineTitle}>无网络连接</Text>
            <Text style={styles.offlineText}>请检查网络设置后重试</Text>
          </View>
        ) : (
          <Text style={styles.loadingText}>{t('player.landing.loading')}</Text>
        )}
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
  // 【离线提示样式】
  offlineContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  offlineIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  offlineTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  offlineText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
});
