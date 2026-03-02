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
    if (this.isInitialized) {
      console.log('[NotificationService] 已经初始化，跳过');
      return;
    }
    try {
      console.log('[NotificationService] ====== 开始初始化通知服务 ======');
      console.log('[NotificationService] 调用 TrackPlayer.setupPlayer()');
      await TrackPlayer.setupPlayer();
      console.log('[NotificationService] ✅ TrackPlayer.setupPlayer() 成功');
      
      console.log('[NotificationService] 配置播放选项');
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          alwaysShowNotificationCustom: true,
          handleAudioFocus: false 
        },
        capabilities: [Capability.Play, Capability.Pause],
        compactCapabilities: [Capability.Play, Capability.Pause],
      });
      console.log('[NotificationService] ✅ 播放选项配置完成');
      
      console.log('[NotificationService] 添加静音音轨');
      await TrackPlayer.add({
        id: 'esonare_silent_core',
        url: 'https://github.com/anars/blank-audio/raw/master/10-seconds-of-silence.mp3', 
        title: '心声冥想',
        artist: '正在为您营造宁静空间',
        duration: 3600, 
        isLiveStream: false,
        artwork: require('../assets/logo.png'), 
      });
      console.log('[NotificationService] ✅ 音轨添加完成');

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      this.isInitialized = true;
      console.log('[NotificationService] ====== 通知服务初始化完成 ======');
    } catch (e) {
      console.error('[NotificationService] ❌ Setup failed:', e);
      console.error('[NotificationService] Error stack:', e.stack);
      throw e;
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

  static async hideNotification() {
    if (!this.isInitialized) return;
    try {
      await TrackPlayer.reset();
      this.isInitialized = false;
    } catch (e) {}
  }
}