import { Platform } from 'react-native';
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, State } from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Scene } from '../constants/scenes';

export class NotificationService {
  private static isInitialized = false;

  /**
   * 初始化通知服务配置
   */
  static async setup() {
    if (this.isInitialized) return;

    try {
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // 开启 Android 的 MediaSession 管理
          alwaysPauseOnInterruption: true,
        },
        // 核心控制能力
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
        ],
        // 通知栏显示的控制按钮
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
        ],
        // 紧凑模式下的按钮（通知栏折叠时显示）
        compactCapabilities: [Capability.Play, Capability.Pause],
        // 进度条更新频率（秒）
        progressUpdateEventInterval: 1,
      });
      this.isInitialized = true;
    } catch (e) {
      console.error('[NotificationService] Setup failed:', e);
    }
  }

  /**
   * 同步更新通知栏信息
   * @param scene 当前场景
   * @param state 播放状态
   */
  static async updateNotification(scene: Scene, state: State) {
    // 确保已初始化
    if (!this.isInitialized) {
      await this.setup();
    }

    if (!scene || state === State.Stopped || state === State.None) {
      return;
    }

    const userName = (await AsyncStorage.getItem('USER_NAME')) || '朋友';
    const isPlaying = state === State.Playing;

    try {
      // 获取当前队列中的第一个轨道
      const queue = await TrackPlayer.getQueue();
      
      // 如果队列为空，则不进行更新元数据操作，避免报错
      if (queue.length === 0) {
        return;
      }

      // 获取场景缩写
      const shortName = scene.title.substring(0, 4);

      // 更新 TrackPlayer 元数据
      // 注意：这里更新的是当前正在播放的轨道（index 0）
      await TrackPlayer.updateMetadataForTrack(0, {
        title: scene.title,
        artist: `🎵 ${userName}，正在深度疗愈`,
        artwork: scene.backgroundUrl,
      });

      // 同步到 Android 原生 MediaSession
      // 在当前的 react-native-track-player 4.x 中，updateMetadataForTrack 会自动处理 MediaSession
    } catch (e) {
      console.error('[NotificationService] Update failed:', e);
    }
  }
}
