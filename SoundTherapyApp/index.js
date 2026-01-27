import { AppRegistry, LogBox } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { name as appName } from './app.json';
import { PlaybackService } from './src/services/PlaybackService';
import EngineControl from './src/constants/EngineControl';

// 初始化音频引擎拦截
EngineControl.disallow();

LogBox.ignoreLogs([
  'Attempting to run JS driven animation', 
  'Possible Unhandled Promise Rejection'
]);

TrackPlayer.registerPlaybackService(() => PlaybackService);
AppRegistry.registerComponent(appName, () => App);
