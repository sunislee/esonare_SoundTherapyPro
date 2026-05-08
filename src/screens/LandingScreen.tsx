import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';

export const LandingScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const breathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 入场动画
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // 呼吸动画
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();

    const enterApp = async () => {
      try {
        await initLanguage();
        
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        const hasUserInfo = !!(userName && userName.trim().length > 0) || (hasSkipped === 'true');
        
        console.log('[LandingScreen] 用户信息检查:', { userName, hasSkipped, hasUserInfo });
        
        setTimeout(() => {
          if (hasUserInfo) {
            console.log('[LandingScreen] ✅ 已有用户信息，进入主应用');
            navigation.replace('MainTabs');
          } else {
            console.log('[LandingScreen] ❌ 未设置用户名，跳转到起名页');
            navigation.replace('NameEntry');
          }
        }, 1200);
        
      } catch (e) {
        console.error('[LandingScreen] 异常:', e);
        setTimeout(() => {
          navigation.replace('NameEntry');
        }, 1200);
      }
    };
    
    enterApp();

    return () => loop.stop();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Animated.View style={{ 
          transform: [{ scale: breathAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
          opacity: breathAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          marginBottom: 20
        }}>
          <Text style={styles.icon}>🧘‍♂️</Text>
        </Animated.View>
        <Text style={styles.brandName}>ESONARE</Text>
        <Text style={styles.tagline}>{t('player.landing.loading')}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080912',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  icon: {
    fontSize: 100,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 8,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
  },
});

export default LandingScreen;