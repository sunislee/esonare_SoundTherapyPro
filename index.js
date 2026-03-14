import { AppRegistry, Text, View, ActivityIndicator, StatusBar, useColorScheme } from 'react-native';
import React, { useState, useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { MainNavigator } from './src/navigation/MainNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { name as appName } from './app.json';
import { AudioProvider } from './src/context/AudioContext';
import TrackPlayer from 'react-native-track-player';
import PlaybackService from './src/services/PlaybackService';
import { initLanguage } from './src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigationState } from '@react-navigation/native';

// 显式导入 i18n 模块，确保被打包
import './src/i18n';

// 关键检查
AsyncStorage.getItem('USER_NAME').then(v => console.log('CRITICAL_CHECK:', v));

// 自定义主题，强制背景色为黑色，防止白屏闪烁
const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#000000',
  },
};

// 【关键修复】加载组件
const LoadingScreen = () => (
  <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }}>
    <SafeAreaProvider>
      <ActivityIndicator size="large" color="#6C5DD3" />
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

// 状态栏适配组件
const StatusBarAdapter = () => {
  const isPlayerScreen = useNavigationState((state) => {
    if (!state) return false;
    const currentRoute = state.routes[state.index];
    return currentRoute.name === 'ImmersivePlayer' || currentRoute.name === 'BreathDetail';
  });

  // 所有页面强制白色状态栏
  const barStyle = 'light-content';
  
  console.log('[StatusBarAdapter] barStyle:', barStyle);

  return (
    <StatusBar
      barStyle={barStyle}
      backgroundColor="transparent"
      translucent={true}
    />
  );
};

// App 组件 - 强制同步初始化
function App() {
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('[App] 开始初始化...');
        // 【关键】使用 Promise.all 同步等待所有初始化完成
        await Promise.all([
          initLanguage(),
          AsyncStorage.getItem('USER_NAME'),
        ]);
        console.log('[App] ✅ 初始化完成');
        setIsAppReady(true);
      } catch (error) {
        console.error('[App] 初始化失败:', error);
        // 即使失败也允许继续
        setIsAppReady(true);
      }
    };
    init();
  }, []);

  // 【关键】加载完成前不渲染任何内容
  if (!isAppReady) {
    if (__DEV__) console.log('Current Route Decision: Waiting for initialization...');
    console.log('[App] 等待初始化...');
    return <LoadingScreen />;
  }

  try {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AudioProvider>
            <NavigationContainer theme={MyTheme}>
              <StatusBarAdapter />
              <MainNavigator />
            </NavigationContainer>
          </AudioProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  } catch (error) {
    console.error('[App] Component render error:', error);
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }}>
        <SafeAreaProvider>
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>Application Error</Text>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
}

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
