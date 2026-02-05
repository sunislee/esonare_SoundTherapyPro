import { Platform } from 'react-native';
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, State } from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { Scene } from '../constants/scenes';

export class NotificationService {
  private static isInitialized = false;

  /**
   * Initialize notification service configuration
   */
  static async setup() {
    if (this.isInitialized) return;

    try {
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // Enable Android MediaSession management
          alwaysPauseOnInterruption: true,
        },
        // Core control capabilities
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
        ],
        // Control buttons displayed in the notification bar
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
        ],
        // Buttons in compact mode (displayed when notification bar is collapsed)
        compactCapabilities: [Capability.Play, Capability.Pause],
        // Progress bar update frequency (seconds)
        progressUpdateEventInterval: 1,
      });
      this.isInitialized = true;
    } catch (e) {
      console.error('[NotificationService] Setup failed:', e);
    }
  }

  /**
   * Sync update notification bar info
   * @param scene Current scene
   * @param state Playback state
   */
  static async updateNotification(scene: Scene, state: State) {
    try {
      // Ensure initialized
      if (!this.isInitialized) {
        await this.setup();
      }

      if (!scene || state === State.Stopped || state === State.None) {
        return;
      }

      const userName = (await AsyncStorage.getItem('USER_NAME')) || i18n.t('settings.defaultName');
      
      // Index safety check: get current active track index
      let activeTrackIndex: number | undefined;
      try {
        activeTrackIndex = await TrackPlayer.getActiveTrackIndex();
      } catch (e) {
        console.log('[NotificationService] Failed to get active track index');
        return;
      }
      
      // If index is undefined or out of bounds, do not update to avoid throw out of bounds exception
      if (activeTrackIndex === undefined || activeTrackIndex < 0) {
        return;
      }

      // Get current queue, double check
      const queue = await TrackPlayer.getQueue();
      if (queue.length === 0 || activeTrackIndex >= queue.length) {
        return;
      }

      // Update TrackPlayer metadata
      await TrackPlayer.updateMetadataForTrack(activeTrackIndex, {
        title: i18n.t(`scenes.${scene.id}.title`),
        artist: i18n.t('notification.artistDescription', { userName }),
        artwork: scene.backgroundUrl,
      });
    } catch (e) {
      // Swallow all notification bar update errors, do not allow affecting main UI thread
      console.log('[NotificationService] Silent error:', e);
    }
  }
}
