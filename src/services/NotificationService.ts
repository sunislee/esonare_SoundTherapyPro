import TrackPlayer, { 
  Capability, 
  AppKilledPlaybackBehavior, 
  State, 
  RepeatMode,
  Event
} from 'react-native-track-player';
import { Scene } from '../constants/scenes';
import { Platform, NativeModules } from 'react-native';
import i18next from 'i18next';

export class NotificationService {
  private static isInitialized = false;
  private static currentScene: Scene | null = null;
  private static currentState: State = State.None;
  private static lastUpdatedSceneId: string | null = null; // 用于按需更新

  static async setup() {
    if (this.isInitialized) return;
    try {
      // 1. 创建通知渠道（Android 8.0+）
      if (Platform.OS === 'android') {
        try {
          const NotificationManager = NativeModules.NotificationManager;
          if (NotificationManager && NotificationManager.createNotificationChannel) {
            await NotificationManager.createNotificationChannel();
            console.log('[NotificationService] Notification channel created successfully');
          }
        } catch (e) {
          console.error('[NotificationService] Channel creation failed:', e);
        }
      }
      
      // 2. 等待 TrackPlayer 完全就绪
      await TrackPlayer.setupPlayer();
      
      // 3. 设置播放选项，包含前台服务配置
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // 前台服务配置（Android 14 兼容性）
          foregroundService: {
            stopWithApp: true,
            notificationId: 1337
          }
        },
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause],
        notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      });
      
      // 4. 添加一个持久的 silent track（使用 1 小时静音音频）
      const t = i18next.t.bind(i18next);
      await TrackPlayer.add({
        id: 'esonare_silent_core',
        url: 'https://github.com/anars/blank-audio/raw/master/1-hour-of-silence.mp3', 
        title: t('notification.title', { defaultValue: '心声冥想' }),
        artist: t('notification.subtitle', { defaultValue: '正在深度疗愈中...' }),
        duration: 3600,
        isLiveStream: false,
        artwork: require('../assets/logo.png'),
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      
      // 5. 监听播放状态变化，自动更新通知
      TrackPlayer.addEventListener(Event.PlaybackState, async (state) => {
        console.log('[NotificationService] PlaybackState event:', state.state);
        this.currentState = state.state;
        await this.updateNotificationFromEvent();
      });
      
      this.isInitialized = true;
      console.log('[NotificationService] Setup completed successfully');
    } catch (e) {
      console.error('[NotificationService] Setup failed:', e);
    }
  }

  static async updateNotification(scene: Scene, state: State) {
    if (!this.isInitialized) {
      console.log('[NotificationService] Not initialized, calling setup...');
      await this.setup();
    }

    try {
      // 6. 每次都要更新 metadata 和播放状态
      this.currentScene = scene;
      this.currentState = state;
      
      // 使用 i18n 获取本地化文本
      const t = i18next.t.bind(i18next);
      const notificationTitle = t('notification.title', { defaultValue: '心声冥想' });
      const notificationSubtitle = t('notification.subtitle', { defaultValue: '正在深度疗愈中...' });
      
      // 场景标题也使用 i18n 国际化
      const sceneTitle = t(`scenes.${scene.id}.title`, { defaultValue: scene.title });
      
      console.log(`[NotificationService] Updating notification: ${sceneTitle}, state=${state}`);
      
      // 更新 metadata
      await TrackPlayer.updateMetadataForTrack(0, {
        title: sceneTitle,
        artist: notificationSubtitle,
        duration: 3600,
        artwork: require('../assets/logo.png'),
      });
      this.lastUpdatedSceneId = scene.id;
      console.log('[NotificationService] Metadata updated for scene:', scene.id);

      // 根据状态控制播放
      const tpState = await TrackPlayer.getState();
      if (state === State.Playing && tpState !== State.Playing) {
        console.log('[NotificationService] TrackPlayer playing...');
        await TrackPlayer.play();
      } else if (state === State.Paused && tpState !== State.Paused) {
        console.log('[NotificationService] TrackPlayer pausing...');
        await TrackPlayer.pause();
      }
      
      // 确保通知保持显示
      if (Platform.OS === 'android') {
        try {
          const NotificationManager = NativeModules.NotificationManager;
          if (NotificationManager && NotificationManager.updateNotification) {
            await NotificationManager.updateNotification({
              id: 1337,
              title: sceneTitle,
              artist: notificationSubtitle,
              isPlaying: state === State.Playing,
            });
          }
        } catch (e) {
          console.error('[NotificationService] Native notification update failed:', e);
        }
      }
    } catch (e) {
      console.error('[NotificationService] Update error:', e);
    }
  }

  private static async updateNotificationFromEvent() {
    if (!this.currentScene || !this.isInitialized) return;
    
    try {
      // 使用 i18n 获取本地化文本
      const t = i18next.t.bind(i18next);
      const notificationSubtitle = t('notification.subtitle', { defaultValue: '正在深度疗愈中...' });
      
      // 场景标题也使用 i18n 国际化
      const sceneTitle = t(`scenes.${this.currentScene.id}.title`, { defaultValue: this.currentScene.title });
      
      // 8. 事件更新时不重新设置 artwork，避免翻转 bug
      await TrackPlayer.updateMetadataForTrack(0, {
        title: sceneTitle,
        artist: notificationSubtitle,
        duration: 3600,
        // 不更新 artwork，避免翻转
      });
    } catch (e) {
      console.error('[NotificationService] Event update error:', e);
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
      this.currentScene = null;
      this.lastUpdatedSceneId = null; // 重置场景 ID
      console.log('[NotificationService] Notification hidden');
    } catch (e) {
      console.error('[NotificationService] Hide error:', e);
    }
  }
}