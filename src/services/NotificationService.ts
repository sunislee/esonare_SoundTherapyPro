import TrackPlayer, { 
  Capability, 
  AppKilledPlaybackBehavior, 
  State, 
  RepeatMode 
} from 'react-native-track-player';
import { AppState, AppStateStatus, Platform, NativeModules } from 'react-native';
import { Scene } from '../constants/scenes';
import I18nManager from 'react-native/Libraries/ReactNative/I18nManager';

// 获取系统语言 - 使用原生 API
const getSystemLocale = (): string => {
  try {
    let locale: string = 'en';
    
    if (Platform.OS === 'android') {
      // Android: 从 I18nManager 获取
      locale = I18nManager.getConstants().localeIdentifier || 
               NativeModules.I18nManager?.localeIdentifier || 
               'en';
    } else {
      // iOS: 从 SettingsManager 获取
      const settings = NativeModules.SettingsManager?.settings;
      if (settings?.AppleLanguages && Array.isArray(settings.AppleLanguages)) {
        locale = settings.AppleLanguages[0];
      }
    }
    
    // 标准化：zh-CN, zh-TW -> zh; en-US -> en
    const normalized = locale.toLowerCase().split(/[-_]/)[0];
    console.log(`[NotificationService] System locale detected: ${locale} -> ${normalized}`);
    return normalized;
  } catch (error) {
    console.warn('[NotificationService] Failed to detect system locale:', error);
    return 'en';
  }
};

// 硬核翻译映射 - 不依赖 i18next
const TRANSLATIONS: Record<string, Record<string, string>> = {
  appTitle: {
    zh: '心声冥想',
    en: 'esonare',
    ja: 'サウンドセラピー',
  },
  channelDescription: {
    zh: '媒体播放控制',
    en: 'Media playback control',
    ja: 'メディア再生コントロール',
  },
  artistDescription: {
    zh: '🎵 用户，正在深度放松',
    en: '🎵 User, in deep relaxation',
    ja: '🎵 ユーザー、深いリラクゼーション中',
  },
  playingStatus: {
    zh: '正在深度疗愈中...',
    en: 'Deep Healing in progress...',
    ja: '深いヒーリング中...',
  },
};

// 硬核翻译函数 - 直接使用系统语言
const getSafeTranslation = (key: string, defaultValue: string): string => {
  const systemLocale = getSystemLocale();
  const isChinese = systemLocale.startsWith('zh');
  const isJapanese = systemLocale.startsWith('ja');
  
  console.log(`[getSafeTranslation] key=${key}, systemLocale=${systemLocale}, isChinese=${isChinese}, isJapanese=${isJapanese}`);
  
  // 获取翻译映射
  const translations = TRANSLATIONS[key];
  if (!translations) {
    console.warn(`[NotificationService] No translation found for key: ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
  
  // 优先中文
  if (isChinese && translations.zh) {
    console.log(`[NotificationService] Using Chinese translation for ${key}: ${translations.zh}`);
    return translations.zh;
  }
  
  // 其次日文
  if (isJapanese && translations.ja) {
    console.log(`[NotificationService] Using Japanese translation for ${key}: ${translations.ja}`);
    return translations.ja;
  }
  
  // 默认英文
  if (translations.en) {
    console.log(`[NotificationService] Using English translation for ${key}: ${translations.en}`);
    return translations.en;
  }
  
  console.warn(`[NotificationService] No suitable translation for ${key}, using default: ${defaultValue}`);
  return defaultValue;
};

export class NotificationService {
  private static isInitialized = false;
  private static appState: AppStateStatus = 'active';
  private static appStateListener: any = null;

  private static initAppStateListener() {
    if (this.appStateListener) return;
    // 监听 AppState 变化
    this.appStateListener = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log(`[NotificationService] AppState changed: ${NotificationService.appState} -> ${nextAppState}`);
      NotificationService.appState = nextAppState;
    });
  }

  static async setup() {
    if (this.isInitialized) {
      console.log('[NotificationService] 已经初始化，跳过');
      return;
    }
    
    // 初始化 AppState 监听
    this.initAppStateListener();
    
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
          handleAudioFocus: true, // 【关键】启用音频焦点管理
          alwaysPauseOnInterruption: true,
          channelId: 'esonare_playback_v119', // 【关键】唯一渠道 ID
          channelName: getSafeTranslation('appTitle', 'esonare'),
          channelDescription: getSafeTranslation('channelDescription', 'Media playback control'),
          category: 'transport', // 【关键】媒体传输类别
          foregroundServiceType: 'mediaPlayback', // 【关键】前台服务类型
        },
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SeekTo],
        notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SeekTo],
        compactCapabilities: [Capability.Play, Capability.Pause],
        progressUpdateEventInterval: 1, // 每秒更新进度
      });
      console.log('[NotificationService] ✅ 播放选项配置完成（含通知栏配置）');
      
      console.log('[NotificationService] 添加静音音轨');
      await TrackPlayer.add({
        id: 'esonare_silent_core',
        url: 'https://github.com/anars/blank-audio/raw/master/10-seconds-of-silence.mp3', 
        title: getSafeTranslation('appTitle', 'esonare'),
        artist: getSafeTranslation('artistDescription', '🎵 User, in deep relaxation'),
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
      // 确保 title 和 artist 不为空
      const title = getSafeTranslation('appTitle', 'esonare');
      const artist = getSafeTranslation('playingStatus', 'Deep Healing in progress...');
      
      console.log(`[NotificationService] Updating metadata: title=${title}, artist=${artist}`);
      
      // 检查音轨是否存在，不存在则先添加
      const queue = await TrackPlayer.getQueue();
      if (queue.length === 0) {
        console.log('[NotificationService] 音轨为空，重新添加');
        await TrackPlayer.add({
          id: 'esonare_silent_core',
          url: 'https://github.com/anars/blank-audio/raw/master/10-seconds-of-silence.mp3', 
          title: title,
          artist: artist,
          duration: 3600, 
          isLiveStream: false,
          artwork: require('../assets/logo.png'), 
        });
      } else {
        await TrackPlayer.updateMetadataForTrack(0, {
          title: title,
          artist: artist,
          duration: 3600,
          artwork: require('../assets/logo.png'), 
        });
      }

      const tpState = await TrackPlayer.getState();
      if (state === State.Playing && tpState !== State.Playing) {
        await TrackPlayer.play();
      } else if (state === State.Paused && tpState !== State.Paused) {
        await TrackPlayer.pause();
      }
      
      console.log('[NotificationService] Metadata updated successfully');
    } catch (e) {
      console.error('[NotificationService] Update error:', e);
      // 错误时尝试使用默认值重新更新
      try {
        await TrackPlayer.updateMetadataForTrack(0, {
          title: 'esonare',
          artist: 'Deep Healing in progress...',
          duration: 3600,
          artwork: require('../assets/logo.png'), 
        });
        console.log('[NotificationService] Fallback to default values');
      } catch (fallbackError) {
        console.error('[NotificationService] Fallback failed:', fallbackError);
      }
    }
  }

  static async updatePlaybackState(isPlaying: boolean) {
    if (!this.isInitialized) {
      console.log('[NotificationService] 未初始化，跳过');
      return;
    }
    
    console.log(`[NotificationService] updatePlaybackState: isPlaying=${isPlaying}, AppState=${this.appState}`);
    
    // 【关键】后台状态下禁止调用 TrackPlayer.play()，避免 ForegroundServiceStartNotAllowedException
    if (isPlaying && this.appState !== 'active') {
      console.log(`[NotificationService] ⚠️ 应用在后台，跳过播放状态更新`);
      return;
    }
    
    try {
      const tpState = await TrackPlayer.getState();
      console.log(`[NotificationService] TrackPlayer state: ${tpState}, target: ${isPlaying ? 'Playing' : 'Paused'}`);
      
      // 强制同步状态：目标状态与当前状态不一致时才更新
      if (isPlaying) {
        if (tpState !== State.Playing) {
          console.log(`[NotificationService] ⚠️ 需要播放：TrackPlayer=${tpState} → 调用 play()`);
          await TrackPlayer.play();
        } else {
          console.log(`[NotificationService] ✅ 已经是播放状态`);
        }
      } else {
        if (tpState !== State.Paused) {
          console.log(`[NotificationService] ⚠️ 需要暂停：TrackPlayer=${tpState} → 调用 pause()`);
          await TrackPlayer.pause();
        } else {
          console.log(`[NotificationService] ✅ 已经是暂停状态`);
        }
      }
    } catch (e) {
      console.error('[NotificationService] updatePlaybackState error:', e);
    }
  }

  static async hideNotification() {
    if (!this.isInitialized) return;
    try {
      await TrackPlayer.reset();
      this.isInitialized = false;
    } catch (e) {}
  }
}