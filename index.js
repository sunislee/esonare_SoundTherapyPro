/**
 * @format
 */

// 1. 【核心：最高优先级 Mock】必须在所有业务组件导入前执行
import { AppRegistry, NativeModules, Platform } from 'react-native';

if (Platform.OS === 'android') {
  const modulesToMock = ['ExponentAV', 'ExpoKeepAwake', 'ExpoAudio'];
  modulesToMock.forEach(moduleName => {
    // 使用 defineProperty 确保 Mock 对象在原生模块加载前就位且不可轻易篡改
    if (!NativeModules[moduleName]) {
      Object.defineProperty(NativeModules, moduleName, {
        value: {},
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  });
}

// 2. 【关键修复】i18n 初始化 - 必须在所有业务组件之前
import './src/i18n'; // 确保 i18next 在应用启动时初始化

// 3. 导入业务组件与插件
import App from './App';
import { name as appName } from './app.json';
import TrackPlayer from 'react-native-track-player';
import PlaybackService from './src/services/PlaybackService';

// 3. 【后台服务注册】必须在 AppRegistry 之前
// RN 0.81 环境下，注册服务是原生层与 JS 层握手的关键
TrackPlayer.registerPlaybackService(() => PlaybackService);

// 4. 注册主组件
AppRegistry.registerComponent(appName, () => App);