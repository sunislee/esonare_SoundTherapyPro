import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import I18nManager from 'react-native/Libraries/ReactNative/I18nManager';
// 【RN 0.81 兼容】统一使用默认导入
import TrackPlayer, { 
  Capability, 
  State, 
  RepeatMode,
  PlaybackState
} from 'react-native-track-player';
import { Scene } from '../constants/scenes';
// 【多语言支持】引入 i18n 实例
import i18n from '../i18n';

// 获取系统语言
const getSystemLocale = (): string => {
  try {
    let locale: string = 'en';
    if (Platform.OS === 'android') {
      locale = I18nManager.getConstants().localeIdentifier || 'en';
    } else {
      const settings = NativeModules.SettingsManager?.settings;
      if (settings?.AppleLanguages) locale = settings.AppleLanguages[0];
    }
    return locale.toLowerCase().split(/[-_]/)[0];
  } catch {
    return 'en';
  }
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
  appTitle: { zh: '心声冥想', en: 'esonare', ja: 'サウンドセラピー' },
  channelDescription: { zh: '媒体播放控制', en: 'Media playback control', ja: 'メディア再生コントロール' },
  artistDescription: { zh: '🎵 正在深度放松', en: '🎵 In deep relaxation', ja: '🎵 深いリラクゼーション中' },
  playingStatus: { zh: '正在深度疗愈中...', en: 'Deep Healing in progress...', ja: '深いヒーリング中...' },
};

const getSafeTranslation = (key: string, defaultValue: string): string => {
  const lang = getSystemLocale();
  return TRANSLATIONS[key]?.[lang] || TRANSLATIONS[key]?.['en'] || defaultValue;
};

export class NotificationService {
  private static isInitialized = false;
  private static appState: AppStateStatus = AppState.currentState;

  static async setup() {
    if (this.isInitialized) return;

    try {
      console.log('[NotificationService] 初始化通知配置...');
      
      // 0.81 必须：先确保 setupPlayer
      // 注意：AudioService 已经在 App.tsx 中统一初始化，这里不需要重复调用
      // await TrackPlayer.setupPlayer();

      await TrackPlayer.updateOptions({
        android: {
          // 0: StopPlaybackAndRemoveNotification (最稳妥)
          appKilledPlaybackBehavior: 0, 
          alwaysShowNotificationCustom: true,
          handleAudioFocus: true,
          alwaysPauseOnInterruption: true,
          channelId: 'esonare_playback_v119',
          channelName: getSafeTranslation('appTitle', 'esonare'),
          channelDescription: getSafeTranslation('channelDescription', 'Media playback control'),
          category: 'transport',
          foregroundServiceType: 'mediaPlayback',
        },
        // 0.81 建议：notificationCapabilities 必须与 capabilities 保持高度一致
        capabilities: [
          Capability.Play, 
          Capability.Pause, 
          Capability.Stop, 
        ],
        notificationCapabilities: [
          Capability.Play, 
          Capability.Pause, 
          Capability.Stop, 
        ],
        compactCapabilities: [Capability.Play, Capability.Pause],
      });

      this.isInitialized = true;
      console.log('[NotificationService] ✅ 配置完成');
    } catch (e) {
      console.error('[NotificationService] ❌ Setup Error:', e);
    }
  }

  /**
   * 更新通知栏元数据
   */
  static async updateNotification(scene: Scene, state: string) {
    if (!this.isInitialized) await this.setup();

    try {
      // 【多语言支持】使用 i18n 翻译标题
      const title = i18n.t(`scenes.${scene.id}.title`) || scene.title || getSafeTranslation('appTitle', 'esonare');
      const artist = i18n.t('appTitle') || getSafeTranslation('artistDescription', '🎵');

      // 检查队列
      const queue = await TrackPlayer.getQueue();
      if (queue.length === 0) {
        // 如果没有音轨，添加一个占位符，但不建议用远程 URL
        await TrackPlayer.add({
          id: 'placeholder',
          url: 'about:blank', // 使用空地址，避免网络请求
          title: title,
          artist: artist,
          artwork: require('../assets/logo.png'),
        });
      }

      await TrackPlayer.updateMetadataForTrack(0, {
        title: title,
        artist: artist,
        artwork: require('../assets/logo.png'),
      });

    } catch (e) {
      console.error('[NotificationService] Metadata Update Error:', e);
    }
  }

  /**
   * 同步播放状态到通知栏按钮
   */
  static async updatePlaybackState(isPlaying: boolean) {
    if (!this.isInitialized) return;
    
    // Android 14 核心限制：后台不能启动前台服务
    if (isPlaying && AppState.currentState !== 'active') {
      console.log('[NotificationService] 后台尝试播放，已拦截以防止 Crash');
      return;
    }

    try {
      const stateObj: any = await TrackPlayer.getPlaybackState();
      const currentState = stateObj.state;

      if (isPlaying && currentState !== State.Playing) {
        await TrackPlayer.play();
      } else if (!isPlaying && currentState === State.Playing) {
        await TrackPlayer.pause();
      }
    } catch (e) {
      console.error('[NotificationService] State Sync Error:', e);
    }
  }
}