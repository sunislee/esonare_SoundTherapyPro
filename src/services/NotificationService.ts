import TrackPlayer, { 
  Capability, 
  AppKilledPlaybackBehavior, 
  State, 
  RepeatMode 
} from 'react-native-track-player';
import { Scene } from '../constants/scenes';

export class NotificationService {
  private static isInitialized = false;

  static async setup() {
    if (this.isInitialized) return;
    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          alwaysShowNotificationCustom: true,
          handleAudioFocus: false 
        },
        capabilities: [Capability.Play, Capability.Pause],
        compactCapabilities: [Capability.Play, Capability.Pause],
      });
      
      await TrackPlayer.add({
        id: 'esonare_silent_core',
        url: 'https://github.com/anars/blank-audio/raw/master/10-seconds-of-silence.mp3', 
        title: '心声冥想',
        artist: '正在为您营造宁静空间',
        // 👈 核心：给它一个确定的 1 小时时长，让系统显示进度条
        duration: 3600, 
        isLiveStream: false, // 👈 确保这个是 false，否则进度条会乱
        artwork: require('../assets/logo.png'), 
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      this.isInitialized = true;
    } catch (e) {
      console.error('[NotificationService] Setup failed:', e);
    }
  }

  static async updateNotification(scene: Scene, state: State) {
    if (!this.isInitialized) await this.setup();

    try {
      await TrackPlayer.updateMetadataForTrack(0, {
        title: scene.name,
        artist: '正在深度疗愈中...',
        duration: 3600, // 保持时长一致
        artwork: require('../assets/logo.png'), 
      });

      const tpState = await TrackPlayer.getState();
      if (state === State.Playing && tpState !== State.Playing) {
        await TrackPlayer.play();
      } else if (state === State.Paused && tpState !== State.Paused) {
        await TrackPlayer.pause();
      }
    } catch (e) {
      console.error('[NotificationService] Update error:', e);
    }
  }

  static async updatePlaybackState(isPlaying: boolean) {
    if (!this.isInitialized) return;
    try {
      const tpState = await TrackPlayer.getState();
      if (isPlaying && tpState !== State.Playing) await TrackPlayer.play();
      else if (!isPlaying && tpState !== State.Paused) await TrackPlayer.pause();
    } catch (e) {}
  }
}