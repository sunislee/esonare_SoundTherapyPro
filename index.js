import { AppRegistry } from 'react-native';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { MainNavigator } from './src/navigation/MainNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { name as appName } from './app.json';
import { AudioProvider } from './src/context/AudioContext';
import TrackPlayer from 'react-native-track-player';
import PlaybackService from './src/services/PlaybackService';
import EngineControl from './src/constants/EngineControl';

// 导入国际化配置
import './src/i18n';

// EngineControl.allow(); // 移除此处的手动允许，由 LandingScreen 控制

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AudioProvider>
          <NavigationContainer>
            <MainNavigator />
          </NavigationContainer>
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

AppRegistry.registerComponent("SoundTherapyPro", () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
