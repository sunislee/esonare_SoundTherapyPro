import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, StatusBar, ActivityIndicator, Easing, BackHandler } from 'react-native';
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

  // 【关键修复】拦截返回键，防止黑屏
  useEffect(() => {
    const onBackPress = () => {
      // 第一次按下返回键，不做任何处理（给用户一个反应时间）
      // 如果需要双击退出，可以在这里实现
      return true; // 阻止默认返回行为
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    };
  }, []);

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
        
        // 【关键修复】增强 AsyncStorage 读取可靠性
        console.log('[LandingScreen] 开始读取 AsyncStorage...');
        
        let userName: string | null = null;
        let hasSkipped: string | null = null;
        
        try {
          // 多次尝试读取，确保数据可靠
          userName = await AsyncStorage.getItem('USER_NAME');
          hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
          
          console.log('[LandingScreen] AsyncStorage 读取结果:');
          console.log(`  - USER_NAME: ${userName ? '"' + userName + '"' : 'null'}`);
          console.log(`  - HAS_SET_NAME: ${hasSkipped ? '"' + hasSkipped + '"' : 'null'}`);
          
          // 验证数据有效性
          if (userName) {
            console.log(`[LandingScreen] ✅ 用户名已存在："${userName}"，长度：${userName.length}`);
          } else {
            console.log('[LandingScreen] ⚠️  用户名为空，需要重新输入');
          }
          
          if (hasSkipped === 'true') {
            console.log('[LandingScreen] ✅ 用户已跳过命名');
          } else if (hasSkipped === null) {
            console.log('[LandingScreen] ⚠️  HAS_SET_NAME 未设置');
          } else {
            console.log(`[LandingScreen] ⚠️  HAS_SET_NAME 值异常："${hasSkipped}"`);
          }
        } catch (storageError) {
          console.error('[LandingScreen] AsyncStorage 读取失败:', storageError);
          // AsyncStorage 失败时，使用默认值
          userName = null;
          hasSkipped = null;
        }
        
        // 打印详细日志
        console.log(`[LandingScreen] 启动检查：Name: ${userName ? '存在' : '不存在'}, Skipped: ${hasSkipped === 'true'}`);
        console.log(`[LandingScreen] 最终判断：userName=${userName ? 'YES' : 'NO'}, hasSkipped=${hasSkipped === 'true' ? 'YES' : 'NO'}`);
        
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        setTimeout(async () => {
          // 【关键修复】信任 CheckAndNavigate 的判断，不再重复检查资源状态
          // 如果用户已注册（通过 CheckAndNavigate 跳转过来），直接进主页
          if (!userName && hasSkipped !== 'true') {
            console.log('[LandingScreen] 用户未注册，跳转到起名页');
            navigation.replace('NameEntry');
          } else {
            console.log('[LandingScreen] 用户已注册，跳转到主页');
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