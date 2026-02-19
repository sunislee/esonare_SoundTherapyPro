import { AppRegistry, Text } from 'react-native';
import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { MainNavigator } from './src/navigation/MainNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { name as appName } from './app.json';
import { AudioProvider } from './src/context/AudioContext';
import TrackPlayer from 'react-native-track-player';
import PlaybackService from './src/services/PlaybackService';
import EngineControl from './src/constants/EngineControl';

// 导入国际化配置 - 增加错误保护
try {
  import('./src/i18n').then(module => {
    // 确保语言初始化完成
    if (module.initLanguage) {
      module.initLanguage().catch(error => {
        console.error('[App] Language initialization failed:', error);
      });
    }
  }).catch(error => {
    console.error('[App] Failed to load i18n module:', error);
  });
} catch (error) {
  console.error('[App] Critical error during i18n import:', error);
}

// 自定义主题，强制背景色为黑色，防止白屏闪烁
const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#000000',
  },
};

// EngineControl.allow(); // 移除此处的手动允许，由 LandingScreen 控制

// App 组件 - 增加错误边界保护
function App() {
  try {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AudioProvider>
            <NavigationContainer theme={MyTheme}>
              <MainNavigator />
            </NavigationContainer>
          </AudioProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  } catch (error) {
    console.error('[App] Component render error:', error);
    // 紧急回退：显示基础错误界面
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <SafeAreaProvider>
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>Application Error</Text>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }
}

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
