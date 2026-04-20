// 【去 Expo 化】完全使用 react-native-track-player
import { Platform, AppState, AppStateStatus, InteractionManager } from 'react-native';

// 【RN 0.81 兼容】解构导入，确保方法可访问
import TrackPlayer, { 
  State, 
  Capability, 
  Event, 
  PlaybackState,
  RepeatMode,
} from 'react-native-track-player';
import Sound from 'react-native-sound';
import { NativeModules } from 'react-native';

import { AUDIO_MAP, DEFAULT_FALLBACK_SOURCE, getDownloadUrl, getLocalPath } from '../constants/audioAssets';
import RNFS from 'react-native-fs';
import { NotificationService } from './NotificationService';
import { OfflineService } from './OfflineService';
import { Scene, SCENES } from '../constants/scenes';
import { EQManager } from './EQManager';
import { DownloaderServiceInstance, isDownloaded } from '../services/DownloaderService';

// 【多语言支持 - 终极补丁】直接导入 JSON 文件，手动取值
import zh from '../i18n/locales/zh.json';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';
import i18n from '../i18n';

// 【交互音效独立播放器】
import SFXPlayer from './SFXPlayer';

// 【防御性检查】确保 TrackPlayer 正确导入
if (!TrackPlayer || !TrackPlayer.setupPlayer) {
  console.error('[AudioService] ❌ TrackPlayer 导入失败:', TrackPlayer);
}

// 【播放状态锁】防止并发播放请求
let isProcessing = false;

/**
 * 【路径标准化工具】
 * 解决 Android 原生层对 file:// 协议头及其后续斜杠数量极其敏感的问题
 */
const getValidUrl = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  // 统一移除 file:// 前缀，清理多余斜杠，再补齐三个斜杠
  const cleanPath = path.replace('file://', '').replace(/^\/+/, '');
  return `file:///${cleanPath}`;
};

/**
 * 【多语言支持 - 终极补丁】手动从 JSON 对象中取值
 * 不依赖 i18n.t，直接根据当前语言从导入的 JSON 中获取翻译
 */
const getTranslatedTitle = (sceneTitleKey: string): string => {
  const currentLang = i18n.language || 'zh';
  
  console.log('[i18n 调试] sceneTitleKey:', sceneTitleKey, 'currentLang:', currentLang);
  
  let translations: any;
  switch (currentLang) {
    case 'zh':
      translations = zh;
      break;
    case 'en':
      translations = en;
      break;
    case 'ja':
      translations = ja;
      break;
    default:
      translations = zh;
  }
  
  // 从嵌套对象中取值，如 "scenes.nature_ocean.title"
  const keys = sceneTitleKey.split('.');
  let value: any = translations;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.log('[i18n 调试] 找不到 key:', key, '返回原值');
      return sceneTitleKey; // 找不到就返回原 key
    }
  }
  
  console.log('[i18n 调试] 翻译结果:', value);
  return typeof value === 'string' ? value : sceneTitleKey;
};

const getAppTitle = (): string => {
  const currentLang = i18n.language || 'zh';
  
  switch (currentLang) {
    case 'zh':
      return zh.appTitle || '心声冥想';
    case 'en':
      return en.appTitle || 'Sound Therapy';
    case 'ja':
      return ja.appTitle || 'サウンドセラピー';
    default:
      return '心声冥想';
  }
};

class AudioService {
  private static instance: AudioService;
  private activeSmallScenes: Set<string> = new Set();
  private currentBaseScene: Scene | null = null;
  private listeners: Set<() => void> = new Set();
  private audioStateListeners: Set<(state: { id: string | null; state: State }) => void> = new Set();
  private loadingListeners: Set<(state: { id: string | null; loading: boolean }) => void> = new Set();
  private smallScenesListeners: Set<(ids: string[]) => void> = new Set();
  private volumeListeners: Set<(vol: number) => void> = new Set();
  private timerListeners: Set<(remaining: number | null) => void> = new Set();
  private preloadedScenes: Set<string> = new Set(); // 【优化】预加载的场景集合
  
  private ambientVolume = 1.0;
  private sleepEndTime: number | null = null;
  private initialSleepSeconds: number | null = null;
  private sleepTimer: any = null;
  private loadingSceneId: string | null = null;
  private loadingTimeout: any = null;
  private loadingTimeoutMs = 20000;
  private appState: AppStateStatus = AppState.currentState;
  private pendingSetup = false;
  private isActuallyPlaying = false;
  private _isReady = false;
  
  // 【防双响锁】
  private isAmbientPlaying = false;
  private ambientPlaybackLock = false;
  
  // 【交互音效独立播放器】
  private sfxPlayer: SFXPlayer = SFXPlayer.getInstance();
  
  // 【LFO 动态音量调制】
  private currentLFOVolumeDisposer: (() => void) | null = null;
  private lfoBaseVolume: number = 1.0; // 用户设置的基础音量
  private isLFOEnabled: boolean = false;
  
  // 【全场景 ExtraSound 映射表】支持 14 个场景的独立 Sound 实例
  // Key: sceneId, Value: Sound 实例
  private activeExtraSounds: Map<string, Sound> = new Map();
  
  // 【全场景 LFO Disposer 映射表】
  private activeLFODisposers: Map<string, () => void> = new Map();
  
  // 【预加载状态标记】
  private isPreloadInitialized = false;
  private preloadPromise: Promise<void> | null = null;
  
  // 【下载回调订阅】用于监听资源下载完成事件
  private downloadCompleteCallbacks: Set<(assetId: string) => void> = new Set();
  
  /**
   * 【下载回调通知】由 DownloadService 调用，通知资源下载完成
   * @param assetId 已下载的资产 ID
   */
  public notifyDownloadComplete = (assetId: string): void => {
    console.log(`[AudioService] 📢 收到下载完成通知：${assetId}`);
    
    // 触发所有回调
    this.downloadCompleteCallbacks.forEach(callback => {
      try {
        callback(assetId);
      } catch (error) {
        console.error(`[AudioService] ❌ 下载回调执行失败:`, error);
      }
    });
  };
  
  // 【舟上雨 - 空间平移 Panning】（保留向后兼容）
  private boatRainSound: Sound | null = null;
  private currentLFOPanDisposer: (() => void) | null = null;
  private isPanningEnabled: boolean = false;
  
  // 【午后书店 - 空间聚焦】（保留向后兼容）
  private bookstoreSound: Sound | null = null;
  private currentLFOBookstoreDisposer: (() => void) | null = null;
  private isBookstorePanningEnabled: boolean = false;
  
  // 【西方教会 - LFO 动态调制】
  private westernChurchSound: Sound | null = null;
  private currentLFOVolumeDisposerWC: (() => void) | null = null;
  private currentLFOPanDisposerWC: (() => void) | null = null;
  private isWesternChurchLFOEnabled: boolean = false;
  private westernChurchBaseVolume: number = 1.0;

  private constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
    // 【生命周期管理】注册销毁钩子
    if (Platform.OS === 'android') {
      // 使用 AppState 的 change 事件检测应用退出
      this.handleAppStateChange = this.handleAppStateChange.bind(this);
    }
    
    // 【v1.4.1 关键修复】清理旧版本的持久化播放状态
    this.cleanupLegacyPlaybackState();
  }
  
  /**
   * 【v1.4.1 新增】清理旧版本可能遗留的持久化播放状态
   * 防止旧版本指向已删除本地路径的状态导致闪退
   */
  private async cleanupLegacyPlaybackState() {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      
      // 清理可能存在的旧状态 key
      const legacyKeys = [
        '@soundtherapy_current_track',
        '@soundtherapy_playing_state',
        '@soundtherapy_audio_state',
      ];
      
      for (const key of legacyKeys) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value) {
            console.log(`[AudioService] 🧹 清理旧版本状态：${key}`);
            await AsyncStorage.removeItem(key);
          }
        } catch (error) {
          // 忽略单个 key 的清理错误
          console.warn(`[AudioService] 清理 ${key} 失败:`, error);
        }
      }
      
      console.log('[AudioService] ✅ 旧版本状态清理完成');
    } catch (error) {
      console.warn('[AudioService] 清理旧版本状态失败:', error);
    }
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  /**
   * 初始化基础监听，辅助定位 0.81 没声音的问题
   */
  private setupListeners() {
    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      const state = (event as PlaybackState).state;
      console.log('[AudioService] 状态变更:', state);
      this.isActuallyPlaying = state === State.Playing;
      this.notifyListeners();
    });

    TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
      console.error('[AudioService] 🚨 播放器底层错误:', error);
    });
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log(`[AudioService] AppState: ${this.appState} -> ${nextAppState}`);
    
    // 【生命周期管理】当应用进入后台或退出时，释放均衡器资源
    if (this.appState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
      console.log('[AudioService] 应用进入后台，准备释放均衡器资源');
      this.releaseEqualizerResources();
    }
    
    this.appState = nextAppState;
    
    if (nextAppState === 'active' && this.pendingSetup) {
      this.pendingSetup = false;
      this.performSetup();
    }
  }
  
  /**
   * 【生命周期管理】释放均衡器资源，防止内存泄漏
   */
  private releaseEqualizerResources() {
    if (Platform.OS === 'android') {
      try {
        const { NativeEQ } = require('../modules/NativeEQ');
        if (NativeEQ && typeof NativeEQ.release === 'function') {
          NativeEQ.release();
          console.log('[AudioService] ✅ 均衡器资源已释放');
        } else {
          console.warn('[AudioService] ⚠️ NativeEQ.release 不可用');
        }
      } catch (error) {
        console.error('[AudioService] ❌ 释放均衡器资源失败:', error);
      }
    }
  };

  isPlaying(): boolean {
    return this.isActuallyPlaying;
  }

  isReady(): boolean {
    return this._isReady;
  }

  getCurrentState(): string {
    return this.isActuallyPlaying ? 'playing' : 'paused';
  }

  /**
   * 【关键修复】允许外部强制设置播放状态，用于 Remote 控制同步
   */
  setIsActuallyPlaying(playing: boolean) {
    console.log('[AudioService] 强制设置播放状态:', playing);
    this.isActuallyPlaying = playing;
  }

  /**
   * 【修复时序问题】立即设置当前场景，避免状态竞争
   */
  setCurrentBaseScene(scene: Scene) {
    console.log('[AudioService] 立即设置当前场景:', scene.id);
    this.currentBaseScene = scene;
  }

  async setupPlayer() {
    try {
      // 【幂等性保护】如果已经初始化完成，直接返回
      if (this._isReady) {
        console.log('[AudioService] ✅ 已经初始化完成，跳过 setupPlayer');
        return;
      }
      
      console.log('[AudioService-DIAGNOSE] ====== 开始初始化 AudioService ======');
      console.log('[AudioService-DIAGNOSE] [1/5] 检查 TrackPlayer 模块...');
      
      // 【防御性检查】确保 TrackPlayer 已正确导入
      if (!TrackPlayer || !TrackPlayer.setupPlayer) {
        console.error('[AudioService-DIAGNOSE] ❌ TrackPlayer 未正确初始化:', TrackPlayer);
        throw new Error('TrackPlayer is not initialized');
      }
      console.log('[AudioService-DIAGNOSE] [2/5] ✅ TrackPlayer 模块检查通过');
      
      if (this.appState !== 'active') {
        console.log('[AudioService-DIAGNOSE] ⚠️ 应用在后台，挂起初始化');
        this.pendingSetup = true;
        return;
      }
      console.log('[AudioService-DIAGNOSE] [3/5] 应用在前台，开始执行初始化...');
      
      await this.performSetup();
      
      console.log('[AudioService-DIAGNOSE] [4/5] ✅ TrackPlayer 初始化成功');
      console.log('[AudioService-DIAGNOSE] [5/5] 设置 _isReady = true');
      console.log('[AudioService-DIAGNOSE] ====== AudioService 初始化完成 ======');
    } catch (e) {
      console.error('[AudioService-DIAGNOSE] ❌ setupPlayer Failed:', e);
      console.error('[AudioService-DIAGNOSE] ❌ Error stack:', e?.stack);
      throw e;
    }
  }
  
  private async performSetup() {
    try {
      console.log('[AudioService-DIAGNOSE] [performSetup] 开始执行原生层初始化');
      
      // 【防御性检查】确保 TrackPlayer 已正确导入
      if (!TrackPlayer || !TrackPlayer.setupPlayer) {
        console.error('[AudioService-DIAGNOSE] ❌ TrackPlayer 未正确初始化');
        throw new Error('TrackPlayer is not initialized');
      }
      
      // 增加一个微小的延迟，确保原生模块已经 Bridged
      console.log('[AudioService-DIAGNOSE] [performSetup] 等待 200ms 确保原生模块已 Bridged');
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[AudioService-DIAGNOSE] [performSetup] 调用 TrackPlayer.setupPlayer()...');
      await TrackPlayer.setupPlayer({
        // 0.81 建议加上一些基础缓冲配置
        minBuffer: 15,
        maxBuffer: 50,
        playBuffer: 5
      });
      console.log('[AudioService-DIAGNOSE] [performSetup] ✅ 调用成功');
    } catch (error: any) {
      if (error.message && error.message.includes('already been initialized')) {
        console.log('[AudioService-DIAGNOSE] [performSetup] ⚠️ 已初始化，跳过');
      } else {
        console.error('[AudioService-DIAGNOSE] [performSetup] ❌ 初始化失败:', error);
        throw error;
      }
    }
    
    // 前台服务与控制选项
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: 0,
        alwaysShowNotificationCustom: true,
        handleAudioFocus: true,
        alwaysPauseOnInterruption: true,
        stopWithApp: true, // 【关键修复】App 被杀死时停止播放并清理通知
        channelId: 'esonare_playback_v119',
        channelName: '心声冥想',
        category: 'transport',
        foregroundServiceType: 'mediaPlayback',
      },
      capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SeekTo],
      compactCapabilities: [Capability.Play, Capability.Pause],
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Track);
    await TrackPlayer.setVolume(this.ambientVolume);
    await NotificationService.setup();
    
    // 【关键】设置 _isReady = true，确保 AudioContext 能检测到
    this._isReady = true;
    console.log('[AudioService] ✅ 初始化完成，isReady = true，均衡器将在首次播放时初始化');
  }
    
    /**
     * 【关键】初始化专业音频处理器 - 在播放音频后调用
     * 使用 sessionId=0 作用于全局音频，让 EQ 同时影响主场景和降噪音频
     */
    private async initEqualizerIfNeeded() {
      try {
        // 【关键修复】使用 sessionId=0 作用于全局音频效果
        // 这样 EQ 可以同时影响 TrackPlayer（主场景）和 react-native-sound（降噪音频）
        console.log('[AudioService-EQ] 开始初始化专业音频处理器');
        
        const { AudioLevelModule } = NativeModules;
        if (AudioLevelModule) {
          // 调用新的初始化方法
          AudioLevelModule.initializeProAudio();
          console.log('[AudioService-EQ] ✅ 专业音频处理器初始化成功（8 段 EQ + AGC + 平滑插值）');
        } else {
          console.warn('[AudioService-EQ] ⚠️ AudioLevelModule 不可用，跳过均衡器初始化');
        }
      } catch (error) {
        console.warn('[AudioService-EQ] ❌ 均衡器初始化失败:', error);
      }
    }

  async playScene(scene: Scene, options?: { triggerLoading?: boolean; skipNotify?: boolean }) {
    if (!scene || !scene.filename) return;

    // 【性能优化】取消播放状态锁，允许指令覆盖
    if (isProcessing) {
      // 不返回，继续执行新请求
    }
    
    // 【性能优化】标记开始处理，但允许覆盖
    isProcessing = true;
    
    try {
      // 【RN 0.81 保护】初始化未完成前禁止播放
      if (!this._isReady) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!this._isReady) {
          console.error('[AudioService] ❌ 初始化超时，无法播放');
          isProcessing = false;
          return;
        }
      }

      // 【性能优化】立即乐观更新 UI 状态
      this.isActuallyPlaying = true;
      this.currentBaseScene = scene;
      if (!options?.skipNotify) {
        this.notifyListeners();
      }
      
      // 【场景切换保护】同步停止所有交互音效
      console.log('[AudioService] 🛑 场景切换，同步停止所有交互音');
      await this.stopAllAmbient();

      const shouldTriggerLoading = options?.triggerLoading !== false;
      if (shouldTriggerLoading) {
        this.loadingSceneId = scene.id;
        this.notifyLoading(true, scene.id);
        this.startLoadingTimeout(scene.id);
      }

      const localPath = getLocalPath(scene.category, scene.filename);
      
      // 【v1.4.1 关键修复】验证本地路径有效性
      if (!localPath || typeof localPath !== 'string') {
        console.error('[AudioService] ❌ 本地路径无效:', scene.id, localPath);
        throw new Error('INVALID_LOCAL_PATH');
      }
      
      const isLocal = await RNFS.exists(localPath.replace('file://', ''));
      const isOffline = await OfflineService.isOfflineMode();
      
      let uri: string | null = null;
      if (isLocal) {
        uri = localPath;
      } else if (!isOffline) {
        const downloadUrls = getDownloadUrl(scene.id);
        // 【防御性检查】确保下载 URL 有效
        if (!downloadUrls || downloadUrls.length === 0 || !downloadUrls[0]) {
          console.error('[AudioService] ❌ 远程 URL 无效:', scene.id);
          throw new Error('INVALID_REMOTE_URL');
        }
        uri = downloadUrls[0];
      }

      // 【关键修复】验证 URI 格式
      if (!uri || uri.includes('undefined') || uri.includes('null')) {
        console.error('[AudioService] ❌ URI 格式错误:', uri);
        throw new Error('INVALID_URI_FORMAT');
      }

      if (!uri) throw new Error('NO_AVAILABLE_SOURCE');

      await this.setupPlayer();
      await TrackPlayer.reset();

      const finalUri = getValidUrl(uri);
      console.log(`[AudioService] 尝试播放：${scene.id}, 路径：${finalUri}`);

      // 【多语言支持】统一使用 i18n.t()，与 playAmbient 保持一致
      const translatedTitle = i18n.t(`scenes.${scene.id}.title`);
      const translatedArtist = i18n.t('appTitle');

      const track: any = {
        id: scene.id,
        url: finalUri,
        title: translatedTitle,
        artist: translatedArtist,
        isLocalUri: finalUri.startsWith('file://'),
      };

      console.log('[AudioService] ====== 调用 TrackPlayer.add ======');
      console.log('[AudioService] track.id:', track.id);
      console.log('[AudioService] track.url:', track.url);
      console.log('[AudioService] track.title:', track.title);
      console.log('[AudioService] track.isLocalUri:', track.isLocalUri);
      
      try {
        // 【系统优化】检查目标音频是否已经在队列中，避免重复reset/add
        console.log('[AudioService] 🔍 检查目标音频是否已在队列中');
        let needToAddTrack = true;
        
        try {
          const queue = await TrackPlayer.getQueue();
          const currentTrack = await TrackPlayer.getCurrentTrack();
          
          // 检查队列中是否已经有相同ID的track
          const existingTrackIndex = queue.findIndex(t => t.id === scene.id);
          
          if (existingTrackIndex !== -1) {
            console.log(`[AudioService] ✅ 目标音频已在队列中，位置: ${existingTrackIndex}`);
            
            // 如果目标音频就是当前播放的音频，直接skip reset/add
            if (currentTrack !== null && queue[currentTrack]?.id === scene.id) {
              console.log(`[AudioService] ✅ 目标音频正在播放，跳过reset/add`);
              needToAddTrack = false;
            } else {
              // 如果目标音频在队列中但不是当前播放的，直接seek到该位置
              console.log(`[AudioService] 🚀 目标音频在队列中，直接seek到位置: ${existingTrackIndex}`);
              await TrackPlayer.skip(existingTrackIndex);
              needToAddTrack = false;
            }
          }
        } catch (error) {
          console.warn('[AudioService] 检查队列状态失败，继续执行正常流程:', error);
        }
        
        if (needToAddTrack) {
          console.log('[AudioService] 🚀 目标音频不在队列中，执行正常加载流程');
          
          // 【强制清理所有音频状态】确保暂停音频不会残留发音
          console.log('[AudioService] 🎚️ 强制清理所有音频状态');
          try {
            // 获取当前音频状态
            const currentState = await TrackPlayer.getState();
            console.log(`[AudioService] 当前音频状态: ${currentState}`);
            
            // 无论什么状态（播放、暂停、缓冲等），都执行清理
            if (currentState !== 'none' && currentState !== 'stopped') {
              console.log('[AudioService] 有音频在队列中，执行强制清理');
              
              // 如果是播放状态，先执行淡出
              if (currentState === 'playing' || currentState === State.Playing) {
                console.log('[AudioService] 正在播放旧音频，执行淡出');
                
                // 200ms淡出：从当前音量逐步降到0
                const fadeOutVolume = async () => {
                  const steps = 4; // 4步完成淡出
                  const stepDuration = 50; // 每步50ms，总共200ms
                  
                  for (let i = steps; i >= 0; i--) {
                    const volume = i / steps; // 1.0, 0.75, 0.5, 0.25, 0.0
                    await TrackPlayer.setVolume(volume);
                    console.log(`[AudioService] 音量淡出: ${volume.toFixed(2)}`);
                    
                    if (i > 0) {
                      await new Promise(resolve => setTimeout(resolve, stepDuration));
                    }
                  }
                  console.log('[AudioService] ✅ 旧音频淡出完成');
                };
                
                await fadeOutVolume();
              } else {
                // 对于暂停、缓冲等状态，直接设置音量为0
                console.log('[AudioService] 音频处于非播放状态，直接设置音量为0');
                await TrackPlayer.setVolume(0);
              }
              
              // 【关键修复】无论什么状态，都执行pause()确保音频停止
              console.log('[AudioService] 执行pause()确保音频停止');
              await TrackPlayer.pause();
            }
            
            // 【强制执行reset】彻底清空整个播放队列和底层Buffer
            console.log('[AudioService] 🛑 强制执行reset：彻底清空播放队列和底层Buffer');
            await TrackPlayer.reset(); // 强制清空整个播放队列和底层Buffer
            console.log('[AudioService] ✅ TrackPlayer.reset() 完成');
          } catch (error) {
            console.warn('[AudioService] 清理音频状态失败:', error);
          }
          
          // 【真·静音入队】在TrackPlayer.add之前，先设置volume=0
          console.log('[AudioService] 🔇 真·静音入队：在add前设置volume=0');
          await TrackPlayer.setVolume(0);
          console.log('[AudioService] ✅ volume=0 设置完成');
          
          // 【关键修复】在播放器操作前再次确认状态，防止被覆盖
          this.isActuallyPlaying = true;
          this.currentBaseScene = scene;
          console.log('[AudioService] 🔒 播放器操作前锁定状态：isActuallyPlaying=true');
          
          // 【异步时序保证】确保reset()完全完成后，再进行add操作
          console.log('[AudioService] 🔄 异步时序保证：reset()完成后执行add');
          await TrackPlayer.add([track]);
          console.log('[AudioService] ✅ TrackPlayer.add 成功');
          
          // 【针对本地文件特殊处理】确保指针完全归零后再play
          console.log('[AudioService] 📍 针对本地文件特殊处理：seekTo(0)确保指针归零');
          await TrackPlayer.seekTo(0);
          console.log('[AudioService] ✅ seekTo(0) 完成');
        }
        
        // 0.81 环境下确保队列已就绪
        const queue = await TrackPlayer.getQueue();
        console.log('[AudioService] 队列长度:', queue.length);
        
        if (queue.length > 0) {
          // 【彻底拆分Load和Play】先调用pause()确保处于暂停状态
          console.log('[AudioService] 🚀 彻底拆分Load和Play：先pause()确保暂停状态');
          
          // 【关键修复】在play()之前再次确认状态
          this.currentBaseScene = scene;
          this.isActuallyPlaying = true;
          console.log('[AudioService] ✅ 预设状态：currentBaseScene =', scene.id, ', isActuallyPlaying = true');
          
          try {
            // 【针对本地文件特殊处理】强制触发底层解码器刷新
            console.log('[AudioService] [1/5] 强制解码器刷新：setRate(1.0)');
            await TrackPlayer.setRate(1.0);
            console.log('[AudioService] ✅ setRate(1.0) 完成');
            
            // 【2】强制首位偏移：保持seekTo(0.15)
            console.log('[AudioService] [2/5] 强制首位偏移：seekTo(0.15)');
            await TrackPlayer.seekTo(0.15);
            console.log('[AudioService] ✅ seekTo(0.15) 完成');
            
            // 【3】开始播放（保持静音状态）
            console.log('[AudioService] [3/5] --- [静音播放] --- 调用 TrackPlayer.play()');
            await TrackPlayer.play();
            console.log('[AudioService] ✅ TrackPlayer.play() 成功');
            
            // 【关键】播放成功后初始化均衡器
            await this.initEqualizerIfNeeded();
            
            // 【4】延时开闸：400ms 硬性音量锁定
            console.log('[AudioService] [4/5] 延时开闸：400ms 硬性音量锁定');
            
            // 400ms期间，无论发生什么，音量必须硬锁定在0
            await new Promise(resolve => setTimeout(resolve, 400));
            console.log('[AudioService] ✅ 400ms延时开闸完成');
            
            // 【5】异步状态锁：10ms步进模仿物理推子
            console.log('[AudioService] [5/5] 异步状态锁：10ms步进模仿物理推子');
            
            // 更细粒度的步进：每10ms增加0.05，模仿物理调音台
            const physicalFadeIn = async () => {
              const steps = 20; // 20步完成恢复
              const stepDuration = 10; // 每步10ms，总共200ms
              
              for (let i = 1; i <= steps; i++) {
                const volume = i * 0.05; // 0.05, 0.10, 0.15, ..., 1.0
                await TrackPlayer.setVolume(volume);
                console.log(`[AudioService] 物理推子: ${volume.toFixed(2)}`);
                
                if (i < steps) {
                  await new Promise(resolve => setTimeout(resolve, stepDuration));
                }
              }
              console.log('[AudioService] ✅ 物理推子淡入完成');
            };
            
            await physicalFadeIn();
            
            // 【延迟刷新元数据】避免阻塞 UI 线程
            setTimeout(() => {
              TrackPlayer.updateNowPlayingMetadata({
                title: translatedTitle,
                artist: translatedArtist,
              }).catch(() => {});
              console.log('[AudioService] ✅ 延迟刷新通知栏元数据完成');
            }, 1000); // 1秒后延迟刷新
          } catch (error) {
            console.error('[AudioService] ❌ 播放操作失败:', error);
          } finally {
            isProcessing = false;
          }
          
          // 【关键】播放后状态检查
          const stateAfter = await TrackPlayer.getState();
          console.log('[AudioService] 播放后状态:', stateAfter);
          console.log('[AudioService] State.Playing 值应该是 3');
          
          console.log('[AudioService] ✅ 播放已启动，isActuallyPlaying =', this.isActuallyPlaying);
          
          // 【关键修复】显式清除 loading 状态
          this.loadingSceneId = null;
          this.clearLoadingTimeout();
          this.notifyLoading(false, scene.id);
          console.log('[AudioService] ✅ loading 状态已清除');
        } else {
          console.error('[AudioService] ❌ 队列为空，无法播放');
        }
      } catch (addError: any) {
        console.error('[AudioService] ❌ TrackPlayer.add 失败:', addError);
        console.error('[AudioService] ❌ 错误消息:', addError?.message);
        console.error('[AudioService] ❌ 错误堆栈:', addError?.stack);
        throw addError;
      } finally {
        // 【关键】无论成功失败，都要释放锁
        console.log('[AudioService] 🔓 释放播放状态锁');
        isProcessing = false;
      }
      
      // 通知 UI 层更新
      this.notifyListeners();
      console.log('[AudioService] ====== playScene 结束 ======');
    } catch (error: any) {
      console.error('[AudioService] ❌ playScene 失败:', error);
      isProcessing = false;
      throw error;
    }
  }

  private async loadTrack(uri: string, scene: Scene, shouldPlay: boolean) {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 loadTrack');
      return;
    }
    
    // 【诊断】打印路径信息
    console.log('[AudioService] ====== loadTrack 开始 ======');
    console.log('[AudioService] 原始 uri:', uri);
    console.log('[AudioService] 原始 uri 是否有 file:// 前缀:', uri?.startsWith('file://'));
    
    const finalUri = getValidUrl(uri);
    console.log('[AudioService] getValidUrl 处理后的 finalUri:', finalUri);
    console.log('[AudioService] finalUri 是否有 file:// 前缀:', finalUri?.startsWith('file://'));
    console.log('[AudioService] finalUri 是否包含 undefined:', finalUri?.includes('undefined'));
    console.log('[AudioService] finalUri 是否包含 null:', finalUri?.includes('null'));
    
    try {
      // 【多语言支持】统一使用 i18n.t()，与 playAmbient 保持一致
      const translatedTitle = i18n.t(`scenes.${scene.id}.title`);
      const translatedArtist = i18n.t('appTitle');
      
      await TrackPlayer.add({
        id: scene.id,
        url: finalUri,
        title: translatedTitle,
        artist: translatedArtist,
      });
      console.log('[AudioService] ✅ TrackPlayer.add 成功');
      
      // 【关键修复】在 play() 之前先更新 currentBaseScene
      this.currentBaseScene = scene;
      
      if (shouldPlay) {
        // 【关键修复】在 play() 之前先设置 isActuallyPlaying
        this.isActuallyPlaying = true;
        console.log('[AudioService] ▶️ 调用 TrackPlayer.play()');
        await TrackPlayer.play();
        
        // 【大招】播放后立即强刷元数据，解决通知栏滞后
        await TrackPlayer.updateNowPlayingMetadata({
          title: translatedTitle,
          artist: translatedArtist,
        });
        console.log('[AudioService] ✅ updateNowPlayingMetadata 完成');
        
        console.log('[AudioService] ✅ 播放已启动，isActuallyPlaying = true');
      }
      
      this.notifyListeners();
      console.log('[AudioService] ====== loadTrack 结束 ======');
    } catch (error: any) {
      console.error('[AudioService] ❌ loadTrack 失败:', error);
      console.error('[AudioService] ❌ 错误消息:', error?.message);
      console.error('[AudioService] ❌ 错误堆栈:', error?.stack);
      console.error('[AudioService] ❌ 使用的 URI:', finalUri);
      throw error;
    }
  }

  // --- 基础控制方法 ---
  async pause() {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 pause');
      return;
    }
    
    // 【关键修复】在 TrackPlayer.pause() 之前先更新状态
    // 这样 Event.PlaybackState 事件触发时状态已经正确
    this.isActuallyPlaying = false;
    await TrackPlayer.pause();
    this.notifyListeners();
  }

  async play() {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 play');
      return;
    }
    
    // 【关键修复】在 TrackPlayer.play() 之前先更新状态
    this.isActuallyPlaying = true;
    await TrackPlayer.play();
    this.notifyListeners();
  }

  async stop() {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 stop');
      return;
    }
    
    await TrackPlayer.stop();
    this.isActuallyPlaying = false;
    this.currentBaseScene = null;
    this.notifyListeners();
  }

  async stopAll() {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 stopAll');
      return;
    }
    
    // 【LFO 集成】清理 LFO
    this.disableLFO();
    
    await TrackPlayer.reset();
    this.isActuallyPlaying = false;
    this.currentBaseScene = null;
    this.activeSmallScenes.clear();
    this.notifyListeners();
  }

  async updateAmbientVolume(volume: number) {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 updateAmbientVolume');
      return;
    }
    
    this.ambientVolume = volume;
    await TrackPlayer.setVolume(volume);
    this.volumeListeners.forEach(l => l(volume));
  }

  // --- 监听器管理 ---
  addListener(l: () => void) {
    this.listeners.add(l);
    // 【关键修复】返回取消订阅函数，让 useSyncExternalStore 可以正确清理
    return () => { this.listeners.delete(l); };
  }
  removeListener(l: () => void) { this.listeners.delete(l); }
  
  addLoadingListener(l: (state: { id: string | null; loading: boolean }) => void) {
    this.loadingListeners.add(l);
    return () => { this.loadingListeners.delete(l); };
  }
  
  addAudioStateListener(l: (s: { id: string | null; state: State }) => void) {
    this.audioStateListeners.add(l);
    return () => { this.audioStateListeners.delete(l); };
  }

  addSmallScenesListener(l: (ids: string[]) => void) {
    this.smallScenesListeners.add(l);
    return () => { this.smallScenesListeners.delete(l); };
  }

  addVolumeListener(l: (vol: number) => void) {
    this.volumeListeners.add(l);
    return () => { this.volumeListeners.delete(l); };
  }

  addSleepTimerListener(l: (remaining: number | null) => void) {
    this.timerListeners.add(l);
    return () => { this.timerListeners.delete(l); };
  }

  private notifyListeners() {
    // 【严格100ms响应】记录开始时间
    const notifyStartTime = Date.now();
    
    console.log(`[AudioService] notifyListeners 被调用, audioStateListeners 数量: ${this.audioStateListeners.size}`);
    
    // 【优化】立即执行主监听器，不等待
    this.listeners.forEach(l => l());
    
    const curState = this.isActuallyPlaying ? State.Playing : State.Paused;
    
    console.log('[AudioService] notifyListeners 被调用, isActuallyPlaying=', this.isActuallyPlaying, 'curState=', curState, 'currentBaseScene.id=', this.currentBaseScene?.id);
    
    // 【关键优化】立即执行状态监听器，不等待
    console.log(`[AudioService] 开始调用 ${this.audioStateListeners.size} 个 audioStateListeners`);
    this.audioStateListeners.forEach((l, index) => {
      console.log(`[AudioService] 调用第 ${index + 1} 个 audioStateListener`);
      l({ id: this.currentBaseScene?.id || null, state: curState });
    });
    
    // 【优化】通知栏更新使用同步执行
    if (this.currentBaseScene) {
      NotificationService.updateNotification(this.currentBaseScene, this.getCurrentState()).catch(() => {});
      NotificationService.updatePlaybackState(this.isActuallyPlaying).catch(() => {});
    }
    
    // 【性能监控】检查是否在100ms内完成
    const notifyTime = Date.now() - notifyStartTime;
    if (notifyTime > 50) { // 预留50ms给UI更新
      console.warn(`[Performance] ⚠️ notifyListeners 耗时过长: ${notifyTime}ms`);
    }
  }

  private notifyLoading(loading: boolean, id: string | null) {
    this.loadingListeners.forEach(l => l({ id, loading }));
  }

  private notifySmallScenes() {
    const ids = Array.from(this.activeSmallScenes);
    console.log('[AudioService] 📡 notifySmallScenes 通知监听器:', ids);
    this.smallScenesListeners.forEach(l => l(ids));
  }

  private notifyVolume() {
    this.volumeListeners.forEach(l => l(this.ambientVolume));
  }

  private notifySleepTimer() {
    const remaining = this.sleepEndTime ? Math.max(0, Math.floor((this.sleepEndTime - Date.now()) / 1000)) : null;
    this.timerListeners.forEach(l => l(remaining));
  }

  private startLoadingTimeout(sceneId: string) {
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.loadingSceneId === sceneId) {
        this.loadingSceneId = null;
        this.notifyLoading(false, sceneId);
      }
    }, this.loadingTimeoutMs);
  }

  private clearLoadingTimeout() {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
  }

  // --- 补充缺失的方法 ---
  getCurrentBaseSceneId(): string | null {
    return this.currentBaseScene?.id || null;
  }

  getActiveSmallSceneIds(): string[] {
    return Array.from(this.activeSmallScenes);
  }

  getInitialSleepSeconds(): number | null {
    return this.initialSleepSeconds;
  }

  getSleepEndTime(): number | null {
    return this.sleepEndTime;
  }

  getAmbientVolume(): number {
    return this.ambientVolume;
  }

  getAmbientVolumeById(id: string): number {
    return this.ambientVolume;
  }

  getCurrentScene(): Scene | null {
    return this.currentBaseScene;
  }

  async syncNativeStatus(): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 syncNativeStatus');
      return;
    }
    
    try {
      const state = await TrackPlayer.getPlaybackState();
      this.isActuallyPlaying = state.state === State.Playing;
      this.notifyListeners();
    } catch (e) {
      console.error('[AudioService] syncNativeStatus error:', e);
    }
  }

  async setSleepTimer(minutes: number): Promise<void> {
    this.initialSleepSeconds = minutes * 60;
    this.sleepEndTime = Date.now() + this.initialSleepSeconds * 1000;
    this.notifyListeners();
  }

  clearSleepTimer(): void {
    this.initialSleepSeconds = null;
    this.sleepEndTime = null;
    this.notifyListeners();
  }

  async playAmbient(id: string): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 playAmbient');
      return;
    }
    
    __DEV__ && console.log('--- [播放交互音] ---', id);
    
    // 查找对应的场景配置
    const scene = SCENES.find(s => s.id === id);
    if (!scene || !scene.filename) {
      console.error('[AudioService] ❌ 交互音场景未找到:', id);
      return;
    }
    
    const uri = AUDIO_MAP[scene.filename];
    if (!uri) {
      console.error('[AudioService] ❌ 交互音资源未找到:', scene.filename);
      return;
    }
    
    const soundId = `small_${id}`;
    
    try {
      // 【关键重构】使用 SFXPlayer 播放，不触碰 TrackPlayer
      const localPath = getValidUrl(uri);
      console.log('[AudioService] 🎵 通过 SFXPlayer 播放交互音:', soundId);
      
      await this.sfxPlayer.play(localPath, soundId);
      __DEV__ && console.log('[AudioService] ✅ 交互音已加入 SFXPlayer 播放队列');
      
      // 记录到 activeSmallScenes
      this.activeSmallScenes.add(id);
      this.notifySmallScenes();
      
      __DEV__ && console.log('[AudioService] ✅ 交互音播放已触发');
    } catch (error: any) {
      console.error('[AudioService] ❌ playAmbient 失败:', error);
      console.error('[AudioService] ❌ 错误消息:', error?.message);
      console.error('[AudioService] ❌ 错误堆栈:', error?.stack);
      throw error;
    }
  }

  async stopAllAmbient(): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 stopAllAmbient');
      return;
    }
    
    __DEV__ && console.log('[AudioService] 🛑 停止所有交互音');
    
    try {
      // 【关键重构】使用 SFXPlayer 停止所有交互音
      this.sfxPlayer.stopAll();
      __DEV__ && console.log('[AudioService] ✅ SFXPlayer 已停止所有交互音');
      
      // 【关键】先清空集合，再通知监听器
      console.log('[AudioService] 📋 清空 activeSmallScenes 集合');
      this.activeSmallScenes.clear();
      console.log('[AudioService] 📡 通知监听器清空状态');
      this.notifySmallScenes();
      
      __DEV__ && console.log('[AudioService] ✅ 所有交互音已停止');
    } catch (error: any) {
      console.error('[AudioService] ❌ stopAllAmbient 失败:', error);
      console.error('[AudioService] ❌ 错误消息:', error?.message);
      throw error;
    }
  }

  async toggleAmbience(scene: Scene, targetState: boolean): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 toggleAmbience');
      return;
    }
    
    __DEV__ && console.log('--- [切换交互音] ---', scene.id, 'targetState:', targetState);
    
    try {
      if (targetState) {
        // 播放交互音
        await this.playAmbient(scene.id);
      } else {
        // 停止单个交互音
        const soundId = `small_${scene.id}`;
        this.sfxPlayer.stop(soundId);
        __DEV__ && console.log('[AudioService] ✅ 交互音已停止:', scene.id);
        
        this.activeSmallScenes.delete(scene.id);
        this.notifySmallScenes();
      }
    } catch (error: any) {
      console.error('[AudioService] ❌ toggleAmbience 失败:', error);
      throw error;
    }
  }

  async getRealIsPlaying(): Promise<boolean> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 getRealIsPlaying');
      return this.isActuallyPlaying;
    }
    
    try {
      const state = await TrackPlayer.getPlaybackState();
      return state.state === State.Playing;
    } catch {
      return this.isActuallyPlaying;
    }
  }

  async getVolume(): Promise<number> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 getVolume');
      return this.ambientVolume;
    }
    
    try {
      const state = await TrackPlayer.getPlaybackState();
      return state.volume ?? this.ambientVolume;
    } catch {
      return this.ambientVolume;
    }
  }

  async setVolume(volume: number): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 setVolume');
      return;
    }
    
    // 【LFO 集成】保存用户设置的基础音量
    this.lfoBaseVolume = volume;
    
    // 如果 LFO 已启用，不直接设置音量，由 LFO Hook 动态调制
    if (this.isLFOEnabled) {
      console.log('[AudioService] 🎵 LFO 已启用，音量由 LFO 动态调制，基础音量:', volume);
      return;
    }
    
    this.ambientVolume = volume;
    await TrackPlayer.setVolume(volume);
    this.volumeListeners.forEach(l => l(volume));
  }

  async switchSoundscape(scene: Scene): Promise<void> {
    await this.playScene(scene);
  }

  async togglePlayback(scene: Scene): Promise<void> {
    console.log(`[AudioService] togglePlayback: scene=${scene.id}, isActuallyPlaying=${this.isActuallyPlaying}, currentBaseScene.id=${this.currentBaseScene?.id}`);
    
    // 【关键修复】增加实质性播放对比：判断当前真正播放的trackId
    let currentPlayingTrackId: string | null = null;
    try {
      const currentTrack = await TrackPlayer.getCurrentTrack();
      if (currentTrack !== null) {
        const queue = await TrackPlayer.getQueue();
        if (queue[currentTrack]) {
          currentPlayingTrackId = queue[currentTrack].id;
        }
      }
    } catch (error) {
      console.warn('[AudioService] 获取当前播放track失败:', error);
    }
    
    console.log(`[AudioService] 实质性播放对比: currentPlayingTrackId=${currentPlayingTrackId}, scene.id=${scene.id}`);
    
    // 【关键修复】实质性播放对比：如果传入的scene.id不等于真正播放的trackId，必须强制执行playScene
    const isActuallyPlayingThisScene = this.isActuallyPlaying && currentPlayingTrackId === scene.id;
    
    console.log(`[AudioService] 播放状态判断: isActuallyPlayingThisScene=${isActuallyPlayingThisScene}, currentPlayingTrackId=${currentPlayingTrackId}`);
    
    if (isActuallyPlayingThisScene) {
      console.log(`[AudioService] togglePlayback: 真正正在播放当前场景，执行暂停`);
      
      // 【性能优化】立即更新状态，提供即时反馈
      this.isActuallyPlaying = false;
      this.notifyListeners();
      
      await this.pause();
    } else {
      console.log(`[AudioService] togglePlayback: 播放新场景或继续播放`);
      
      // 【关键修复】在没有音频播放时，强制更新状态为播放中
      if (!currentPlayingTrackId) {
        console.log(`[AudioService] 没有音频播放，强制更新状态为播放中`);
        this.isActuallyPlaying = true;
        this.currentBaseScene = scene;
        this.notifyListeners();
      }
      
      // 【关键修复】禁止提前更新状态，由playScene内部在音频加载成功后更新
      await this.playScene(scene);
    }
  }

  /**
   * 【优化】预加载场景音频，减少播放延迟
   */
  async preloadScene(scene: Scene): Promise<void> {
    if (this.preloadedScenes.has(scene.id)) {
      return; // 已经预加载过
    }
    
    try {
      console.log('[AudioService] 预加载场景音频:', scene.id);
      
      // 预加载音频文件到本地缓存
      const localPath = await getLocalPath(scene.id);
      const exists = await RNFS.exists(localPath);
      
      if (!exists) {
        // 如果本地文件不存在，提前下载
        const downloadUrl = getDownloadUrl(scene.id);
        console.log('[AudioService] 预下载音频文件:', downloadUrl);
        
        // 异步下载，不等待结果
        RNFS.downloadFile({
          fromUrl: downloadUrl,
          toFile: localPath,
          background: true,
          discretionary: true,
        }).promise.catch(() => {});
      }
      
      this.preloadedScenes.add(scene.id);
      console.log('[AudioService] ✅ 场景预加载完成:', scene.id);
    } catch (error) {
      console.warn('[AudioService] 预加载失败:', error);
    }
  }

  async loadAudio(scene: Scene, shouldPlay: boolean = false): Promise<void> {
    // 单例初始化保护
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 loadAudio');
      return;
    }

    try {
      console.log('[AudioService] 开始加载音频:', scene.id);
      
      if (shouldPlay) {
        await this.playScene(scene);
      } else {
        // 只加载不播放的逻辑
        const uri = AUDIO_MAP[scene.filename];
        
        // 【新增】检查资源是否存在
        console.log('[AudioService] ====== 路径诊断开始 ======');
        console.log('[AudioService] scene.filename:', scene.filename);
        console.log('[AudioService] AUDIO_MAP key:', scene.filename);
        console.log('[AudioService] AUDIO_MAP value (uri):', uri);
        console.log('[AudioService] uri 是否有 file:// 前缀:', uri?.startsWith('file://'));
        console.log('[AudioService] getLocalPath 返回值:', getLocalPath(scene.category, scene.filename));
        console.log('[AudioService] getLocalPath 返回值是否有 file:// 前缀:', getLocalPath(scene.category, scene.filename)?.startsWith('file://'));
        
        if (!uri) {
          console.error('[AudioService] ❌ 音频资源未找到 (AUDIO_MAP 中无此 key):', scene.filename);
          this.onResourceNotFound?.(scene);
          console.log('[AudioService] ====== 路径诊断结束 ======');
          return;
        }
        
        // 【新增】检查文件是否存在
        console.log('[AudioService] RNFS.exists 检查路径:', uri);
        const exists = await RNFS.exists(uri);
        console.log('[AudioService] RNFS.exists 结果:', exists);
        
        if (!exists) {
          console.error('[AudioService] ❌ 音频文件不存在:', uri);
          this.onResourceNotFound?.(scene);
          console.log('[AudioService] ====== 路径诊断结束 ======');
          return;
        }
        
        console.log('[AudioService] ✅ 路径验证通过，准备加载音频');
        console.log('[AudioService] ====== 路径诊断结束 ======');
        
        await this.loadTrack(uri, scene, false);
        console.log('[AudioService] ✅ 音频加载完成:', scene.id);
      }
    } catch (error: any) {
      console.error('[AudioService] ❌ loadAudio 失败:', error);
      
      // 【新增】错误类型判断，触发 UI 层下载引导
      if (error.message?.includes('file not found') || 
          error.message?.includes('ENOENT') ||
          error.message?.includes('无法找到音频')) {
        this.onResourceNotFound?.(scene);
      }
    }
  }

  // 【新增】资源缺失回调接口（用于 UI 层下载引导）
  public onResourceNotFound?: (scene: Scene) => void;
  
  /**
   * 【LFO 集成】为指定场景启用 LFO 动态音量调制
   * @param sceneId 场景 ID（如 'nature_deep_sea'）
   */
  public enableLFOForScene = (sceneId: string, onVolumeChange?: (volume: number) => void) => {
    // 清理旧的 LFO
    this.disableLFO();
    
    // 仅对支持的场景启用 LFO
    if (sceneId !== 'nature_deep_sea') {
      console.log('[AudioService] ⚠️ 场景', sceneId, '不支持 LFO，跳过');
      return;
    }
    
    console.log('[AudioService] 🎵 为场景启用 LFO:', sceneId);
    this.isLFOEnabled = true;
    
    // 动态导入 useLFO Hook（避免循环依赖）
    import('../hooks/useLFO').then(({ useLFO, LFOPresets }) => {
      // 注意：useLFO 是 React Hook，不能在普通类方法中直接调用
      // 这里我们采用回调模式，由 React 组件调用 Hook 并传入回调
      console.log('[AudioService] ✅ LFO 模块已加载，等待组件调用 Hook');
    }).catch(error => {
      console.error('[AudioService] ❌ 加载 LFO 模块失败:', error);
      this.isLFOEnabled = false;
    });
  };
  
  /**
   * 【LFO 集成】禁用 LFO 动态音量调制
   */
  public disableLFO = () => {
    if (this.currentLFOVolumeDisposer) {
      console.log('[AudioService] 🎵 禁用 LFO');
      this.currentLFOVolumeDisposer();
      this.currentLFOVolumeDisposer = null;
    }
    this.isLFOEnabled = false;
    
    // 恢复到用户设置的基础音量
    this.ambientVolume = this.lfoBaseVolume;
    TrackPlayer.setVolume(this.lfoBaseVolume).catch(() => {});
    console.log('[AudioService] ✅ LFO 已禁用，恢复基础音量:', this.lfoBaseVolume);
  };

  /**
   * 【舟上雨 - 空间平移】设置 Pan 值（-1.0 到 1.0）
   * @param pan Pan 值，-1.0=最左，0=中央，1.0=最右
   */
  public setAmbientPan = async (pan: number): Promise<void> => {
    // 限制范围在 -1.0 到 1.0
    const clampedPan = Math.max(-1.0, Math.min(1.0, pan));
    
    if (this.boatRainSound && this.boatRainSound.isLoaded()) {
      this.boatRainSound.pan(clampedPan);
      console.log('[AudioService] 🎧 设置 Pan:', clampedPan.toFixed(2));
    } else {
      console.warn('[AudioService] ⚠️ 舟上雨 Sound 未加载，跳过 Pan 设置');
    }
  };

  /**
   * 【舟上雨 - 空间平移】为舟上雨场景启用 LFO Panning
   * @param sceneId 场景 ID
   * @param onPanChange Pan 值变化回调
   */
  public enablePanningForScene = (
    sceneId: string,
    onPanChange?: (pan: number) => void
  ) => {
    // 清理旧的 Panning
    this.disablePanning();
    
    // 仅对舟上雨场景启用 Panning
    if (sceneId !== 'scene_boat_rain') {
      console.log('[AudioService] ⚠️ 场景', sceneId, '不支持 Panning，跳过');
      return;
    }
    
    console.log('[AudioService] 🎧 为舟上雨场景启用 Panning LFO');
    this.isPanningEnabled = true;
    
    // 加载舟上雨音频到 Sound 实例
    this.loadBoatRainSound().then(() => {
      console.log('[AudioService] ✅ 舟上雨 Sound 已加载，等待 Hook 调用');
    }).catch(error => {
      console.error('[AudioService] ❌ 加载舟上雨 Sound 失败:', error);
      this.isPanningEnabled = false;
    });
  };

  /**
   * 【舟上雨 - 空间平移】禁用 Panning
   */
  public disablePanning = () => {
    if (this.currentLFOPanDisposer) {
      console.log('[AudioService] 🎧 禁用 Panning');
      this.currentLFOPanDisposer();
      this.currentLFOPanDisposer = null;
    }
    this.isPanningEnabled = false;
    
    // Pan 归零
    this.setAmbientPan(0);
    console.log('[AudioService] ✅ Panning 已禁用，Pan 归零');
  };

  /**
   * 【舟上雨 - 空间平移】加载舟上雨音频到 Sound 实例
   */
  private loadBoatRainSound = async (): Promise<void> => {
    // 先停止旧的实例
    if (this.boatRainSound) {
      this.boatRainSound.stop();
      this.boatRainSound.release();
      this.boatRainSound = null;
    }
    
    // 获取舟上雨音频路径
    const audioAsset = AUDIO_MAP['scene_boat_rain'];
    if (!audioAsset) {
      throw new Error('舟上雨音频配置不存在');
    }
    
    const localPath = await getLocalPath('scene_boat_rain');
    
    return new Promise((resolve, reject) => {
      Sound.setCategory('Playback', true); // 允许与其他音频混合
      
      const sound = new Sound(localPath, '', (error) => {
        if (error) {
          console.error('[AudioService] ❌ 加载舟上雨 Sound 失败:', error);
          reject(error);
          return;
        }
        
        console.log('[AudioService] ✅ 舟上雨 Sound 加载成功');
        this.boatRainSound = sound;
        
        // 设置为循环播放
        sound.setNumberOfLoops(-1);
        
        // 设置音量（不干扰 TrackPlayer 的主场景音量）
        sound.setVolume(0.8);
        
        // 播放
        sound.play((success) => {
          if (success) {
            console.log('[AudioService] ✅ 舟上雨 Sound 播放完成');
          } else {
            console.warn('[AudioService] ⚠️ 舟上雨 Sound 播放失败');
          }
        });
        
        resolve();
      });
    });
  };

  /**
   * 【舟上雨 - 空间平移】设置 Panning LFO 回调
   * @param disposer 停止函数
   */
  public setPanningLFOCallback = (disposer: () => void) => {
    this.currentLFOPanDisposer = disposer;
  };

  /**
   * 【全场景通用】获取 ExtraSound 实例
   * @param sceneId 场景 ID
   * @returns Sound 实例或 null
   */
  public getExtraSound = (sceneId: string): Sound | null => {
    return this.activeExtraSounds.get(sceneId) || null;
  };

  /**
   * 【全场景通用】为场景加载 ExtraSound
   * @param sceneId 场景 ID
   */
  public loadExtraSound = async (sceneId: string): Promise<void> => {
    console.log(`\n========== [LOAD SOUND] ${sceneId} ==========`);
    
    // 先停止旧的实例
    const oldSound = this.activeExtraSounds.get(sceneId);
    if (oldSound) {
      oldSound.stop();
      oldSound.release();
      this.activeExtraSounds.delete(sceneId);
      console.log(`[AudioService] 🗑️ 已清理旧实例：${sceneId}`);
    }
    
    // 【唯一真理源】从 AUDIO_MANIFEST 获取资源配置
    const { AUDIO_MANIFEST } = await import('../constants/audioAssets');
    const audioAsset = AUDIO_MANIFEST.find(item => item.id === sceneId);
    
    if (!audioAsset) {
      console.error(`[AudioService] ❌ 场景 ${sceneId} 音频配置不存在 (AUDIO_MANIFEST 中未找到)`);
      throw new Error(`场景 ${sceneId} 音频配置不存在`);
    }
    
    console.log(`📍 Loading AUDIO [${audioAsset.filename}] for SCENE [${sceneId}]`);
    console.log(`[AudioService] 📂 资源配置：category=${audioAsset.category}, filename=${audioAsset.filename}`);
    
    const { getLocalPath } = await import('../constants/audioAssets');
    const localPath = getLocalPath(audioAsset.category, audioAsset.filename);
    
    console.log(`[AudioService] 📂 完整本地路径：${localPath}`);
    console.log(`[AudioService] 📂 DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
    console.log(`===========================================\n`);
    
    return new Promise((resolve, reject) => {
      Sound.setCategory('Playback', true);
      
      const sound = new Sound(localPath, '', (error) => {
        if (error) {
          console.error(`[AudioService] ❌ 加载场景 ${sceneId} Sound 失败:`, error);
          console.error(`[AudioService] ❌ 路径检查：${localPath}`);
          reject(error);
          return;
        }
        
        console.log(`[AudioService] ✅ 场景 ${sceneId} Sound 加载成功 (duration=${sound.getDuration()}s)`);
        this.activeExtraSounds.set(sceneId, sound);
        
        // 设置为循环播放
        sound.setNumberOfLoops(-1);
        
        // 默认音量 0.75
        sound.setVolume(0.75);
        
        // 播放
        sound.play((success) => {
          if (success) {
            console.log(`[AudioService] ✅ 场景 ${sceneId} Sound 播放完成`);
          } else {
            console.warn(`[AudioService] ⚠️ 场景 ${sceneId} Sound 播放失败`);
          }
        });
        
        resolve();
      });
    });
  };

  /**
   * 【全场景通用】设置场景 Pan 值
   * @param sceneId 场景 ID
   * @param pan Pan 值（-1.0 到 1.0）
   */
  public setExtraSoundPan = async (sceneId: string, pan: number): Promise<void> => {
    const clampedPan = Math.max(-1.0, Math.min(1.0, pan));
    const sound = this.activeExtraSounds.get(sceneId);
    
    if (sound && sound.isLoaded()) {
      sound.pan(clampedPan);
      console.log(`[AudioService] 🎧 设置场景 ${sceneId} Pan:`, clampedPan.toFixed(2));
    } else {
      console.warn(`[AudioService] ⚠️ 场景 ${sceneId} Sound 未加载，跳过 Pan 设置`);
    }
  };

  /**
   * 【全场景通用】设置场景音量
   * @param sceneId 场景 ID
   * @param volume 音量（0-1）
   */
  public setExtraSoundVolume = (sceneId: string, volume: number): void => {
    const sound = this.activeExtraSounds.get(sceneId);
    
    if (sound && sound.isLoaded()) {
      sound.setVolume(volume);
      console.log(`[AudioService] 🔊 设置场景 ${sceneId} Volume:`, volume.toFixed(2));
    } else {
      console.warn(`[AudioService] ⚠️ 场景 ${sceneId} Sound 未加载，跳过音量设置`);
    }
  };

  /**
   * 【全场景通用】注册 LFO Disposer
   * @param sceneId 场景 ID
   * @param disposer 停止函数
   */
  public registerLFODisposer = (sceneId: string, disposer: () => void): void => {
    // 先清理旧的
    this.unregisterLFODisposer(sceneId);
    
    this.activeLFODisposers.set(sceneId, disposer);
    console.log(`[AudioService] 📝 注册场景 ${sceneId} LFO Disposer`);
  };

  /**
   * 【全场景通用】注销 LFO Disposer
   * @param sceneId 场景 ID
   */
  public unregisterLFODisposer = (sceneId: string): void => {
    const disposer = this.activeLFODisposers.get(sceneId);
    if (disposer) {
      disposer();
      this.activeLFODisposers.delete(sceneId);
      console.log(`[AudioService] 🗑️ 注销场景 ${sceneId} LFO Disposer`);
    }
  };

  /**
   * 【全场景通用】清理场景的所有资源
   * @param sceneId 场景 ID
   */
  public cleanupScene = (sceneId: string): void => {
    // 清理 LFO
    this.unregisterLFODisposer(sceneId);
    
    // 清理 Sound 实例
    const sound = this.activeExtraSounds.get(sceneId);
    if (sound) {
      sound.stop();
      sound.release();
      this.activeExtraSounds.delete(sceneId);
      console.log(`[AudioService] 🧹 清理场景 ${sceneId} Sound 实例`);
    }
  };

  /**
   * 【全场景通用】清理所有场景资源
   */
  public cleanupAllScenes = (): void => {
    // 清理所有 LFO
    this.activeLFODisposers.forEach((disposer, sceneId) => {
      disposer();
      console.log(`[AudioService] 🧹 清理场景 ${sceneId} LFO`);
    });
    this.activeLFODisposers.clear();
    
    // 清理所有 Sound 实例（不释放，只停止）
    this.activeExtraSounds.forEach((sound, sceneId) => {
      sound.stop();
      sound.setVolume(0);
      console.log(`[AudioService] 🧹 停止场景 ${sceneId} Sound`);
    });
    // 注意：不清理 activeExtraSounds，保持实例池
  };

  /**
   * 【强制测试】清除所有普通场景的音频文件（保留降噪资源）
   * 目的：强制触发下载流程，验证进度条 UI
   */
  public clearAllSceneAudio = async (): Promise<void> => {
    console.log(`[AudioService] 🧹 [强制测试] 开始清除普通场景音频...`);
    
    try {
      const RNFS = await import('react-native-fs');
      const { AUDIO_MANIFEST, getLocalPath } = await import('../constants/audioAssets');
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      
      let deletedCount = 0;
      let skippedCount = 0;
      
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPath(asset.category, asset.filename);
        const exists = await RNFS.exists(localPath);
        
        if (exists) {
          // 检查是否是降噪资源
          if (asset.category === 'noise_cancellation') {
            console.log(`[AudioService] 🛡️ 保留降噪资源：${asset.id}`);
            skippedCount++;
          } else {
            await RNFS.unlink(localPath);
            console.log(`[AudioService] ✅ 已删除：${asset.id} (${asset.category})`);
            deletedCount++;
          }
        }
      }
      
      // 【关键修复】清除资源就绪标记，强制触发下载
      await AsyncStorage.removeItem('RESOURCE_READY');
      console.log('[AudioService] 🧹 已清除 RESOURCE_READY 标记');
      
      console.log(`[AudioService] 🧹 清除完成！删除：${deletedCount} 个，保留：${skippedCount} 个`);
    } catch (error) {
      console.error(`[AudioService] ❌ 清除失败:`, error);
    }
  };

  /**
   * 【音频秒开】预加载所有场景音频
   * 在 App 启动或空闲时调用，确保进入场景时音频立即可用
   */
  public preloadAllSounds = async (): Promise<void> => {
    // 如果已预加载或正在预加载，直接返回
    if (this.isPreloadInitialized || this.preloadPromise) {
      console.log('[AudioService] ⚡ 音频已预加载或正在加载，跳过');
      return this.preloadPromise || Promise.resolve();
    }
    
    console.log('[AudioService] 🚀 开始预加载所有场景音频...');
    
    this.preloadPromise = (async () => {
      // 导入配置
      const { SCENE_LFO_CONFIGS } = await import('../config/SceneLFOConfig');
      
      const sceneIds = Object.keys(SCENE_LFO_CONFIGS);
      const preloadStartTime = Date.now();
      let successCount = 0;
      let skipCount = 0;
      
      console.log(`[AudioService] 📋 待预加载场景列表：${sceneIds.join(', ')}`);
      
      // 【关键修复】使用 for...of 替代 map，确保闭包正确捕获 sceneId
      for (const sceneId of sceneIds) {
        try {
          // 跳过已加载的
          if (this.activeExtraSounds.has(sceneId)) {
            skipCount++;
            console.log(`[AudioService] ⚠️ 场景 ${sceneId} 已预加载，跳过`);
            continue;
          }
          
          // 获取音频路径
          const audioAsset = AUDIO_MAP[sceneId];
          if (!audioAsset) {
            console.warn(`[AudioService] ❌ 场景 ${sceneId} 音频配置不存在`);
            continue;
          }
          
          // 【关键修复】检查资源是否已下载
          const localPath = await getLocalPath(sceneId);
          if (!localPath) {
            console.log(`[AudioService] ⚠️ 场景 ${sceneId} 资源未下载，跳过预加载`);
            continue;
          }
          
          // 【关键修复】打印路径映射，确保一一对应
          console.log(`[AudioService] 🔈 正在预加载：${sceneId} → ${localPath}`);
          
          // 创建 Sound 实例
          await new Promise<void>((resolve, reject) => {
            Sound.setCategory('Playback', true);
            
            // 【关键修复】使用 const 确保 sceneId 在闭包中正确捕获
            const currentSceneId = sceneId;
            const sound = new Sound(localPath, '', (error) => {
              if (error) {
                console.warn(`[AudioService] ❌ 预加载 ${currentSceneId} 失败:`, error);
                resolve();
                return;
              }
              
              // 【双重校验】确保存储的 sceneId 和加载的一致
              console.log(`[AudioService] ✅ 预加载成功：${currentSceneId} → ${this.activeExtraSounds.has(currentSceneId) ? '已存在' : '存入实例池'}`);
              
              // 配置 Sound 实例
              sound.setNumberOfLoops(-1);
              sound.setVolume(0); // 静音待命
              sound.pause(); // 暂停状态
              
              // 存入实例池
              this.activeExtraSounds.set(currentSceneId, sound);
              successCount++;
              
              resolve();
            });
          });
        } catch (error) {
          console.warn(`[AudioService] ❌ 预加载 ${sceneId} 异常:`, error);
        }
      }
      
      const preloadDuration = Date.now() - preloadStartTime;
      this.isPreloadInitialized = true;
      
      console.log(`[AudioService] ✅ 预加载完成！成功：${successCount}, 跳过：${skipCount}, 实例池大小：${this.activeExtraSounds.size}, 总耗时 ${preloadDuration}ms`);
      console.log(`[AudioService] 📊 实例池内容：${Array.from(this.activeExtraSounds.keys()).join(', ')}`);
      
      // 【关键修复】触发下载完成回调，通知所有订阅者
      this.downloadCompleteCallbacks.forEach(callback => {
        // 遍历所有已下载的场景 ID
        this.activeExtraSounds.forEach((_, sceneId) => {
          callback(sceneId);
        });
      });
    })();
    
    return this.preloadPromise;
  };

  /**
   * 【音频秒开】预加载单个场景音频（增量预加载）
   * @param sceneId 场景 ID
   */
  private preloadSingleSound = async (sceneId: string): Promise<void> => {
    console.log(`[AudioService] 🚀 开始增量预加载：${sceneId}`);
    
    try {
      // 跳过已加载的
      if (this.activeExtraSounds.has(sceneId)) {
        console.log(`[AudioService] ⚠️ 场景 ${sceneId} 已预加载，跳过`);
        return;
      }
      
      // 获取音频路径
      const audioAsset = AUDIO_MAP[sceneId];
      if (!audioAsset) {
        console.warn(`[AudioService] ❌ 场景 ${sceneId} 音频配置不存在`);
        return;
      }
      
      const localPath = await getLocalPath(sceneId);
      if (!localPath) {
        console.warn(`[AudioService] ❌ 场景 ${sceneId} 本地路径不存在`);
        return;
      }
      
      console.log(`[AudioService] 🔈 增量预加载：${sceneId} → ${localPath}`);
      
      // 创建 Sound 实例
      await new Promise<void>((resolve, reject) => {
        Sound.setCategory('Playback', true);
        
        const sound = new Sound(localPath, '', (error) => {
          if (error) {
            console.warn(`[AudioService] ❌ 增量预加载 ${sceneId} 失败:`, error);
            resolve();
            return;
          }
          
          // 配置 Sound 实例
          sound.setNumberOfLoops(-1);
          sound.setVolume(0);
          sound.pause();
          
          // 存入实例池
          this.activeExtraSounds.set(sceneId, sound);
          console.log(`[AudioService] ✅ 增量预加载成功：${sceneId}`);
          
          resolve();
        });
      });
    } catch (error) {
      console.error(`[AudioService] ❌ 增量预加载 ${sceneId} 异常:`, error);
    }
  };

  /**
   * 【音频秒开】获取或加载场景 Sound 实例（优先复用）
   * @param sceneId 场景 ID
   * @returns Sound 实例或 null
   */
  public getOrLoadExtraSound = async (sceneId: string): Promise<Sound | null> => {
    console.log(`\n========== [GET OR LOAD] ${sceneId} ==========`);
    console.log(`[AudioService] 🔍 请求加载场景：${sceneId}`);
    
    // 优先：检查实例池
    const existingSound = this.activeExtraSounds.get(sceneId);
    if (existingSound && existingSound.isLoaded()) {
      console.log(`[AudioService] ⚡ 复用已加载的 ${sceneId} Sound (实例池命中)`);
      return existingSound;
    }
    
    // 【唯一真理源】从 AUDIO_MANIFEST 获取资源配置
    const { AUDIO_MANIFEST } = await import('../constants/audioAssets');
    const audioAsset = AUDIO_MANIFEST.find(item => item.id === sceneId);
    
    if (!audioAsset) {
      console.error(`[AudioService] ❌ 场景 ${sceneId} 音频配置不存在 (AUDIO_MANIFEST 中未找到)`);
      return null;
    }
    
    console.log(`📍 Loading AUDIO [${audioAsset.filename}] for SCENE [${sceneId}]`);
    console.log(`[AudioService] 📂 资源配置：category=${audioAsset.category}, filename=${audioAsset.filename}`);
    
    const { getLocalPath } = await import('../constants/audioAssets');
    const localPath = getLocalPath(audioAsset.category, audioAsset.filename);
    
    const RNFS = await import('react-native-fs');
    const isDownloaded = await RNFS.exists(localPath);
    
    // 【强制暴露】路径全链路检查
    console.log(`\n========== [PATH CHECK] ${sceneId} ==========`);
    console.log(`[AudioService] 📂 场景 ID: ${sceneId}`);
    console.log(`[AudioService] 📂 资源配置：${audioAsset.category}/${audioAsset.filename}`);
    console.log(`[AudioService] 📂 当前本地路径：${localPath}`);
    console.log(`[AudioService] 📂 路径存在：${await RNFS.exists(localPath)}`);
    console.log(`[AudioService] 📂 DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
    console.log(`[AudioService] 📂 资源检测：${sceneId} → ${isDownloaded ? '已下载' : '未下载'}`);
    
    // 【路径审计】检查是否指向非法的本地资源
    if (localPath.includes('res/raw') || localPath.includes('require(')) {
      console.error(`\n⚠️⚠️⚠️ [PATH AUDIT] 发现非法路径引用！⚠️⚠️⚠️`);
      console.error(`[PATH AUDIT] 场景：${sceneId}`);
      console.error(`[PATH AUDIT] 路径：${localPath}`);
      console.error(`[PATH AUDIT] 普通场景严禁引用 res/raw 或 require()！\n`);
    }
    
    // 【强制触发】对于普通场景，强制触发下载流程（即使文件已存在）
    const isNoiseCancellation = audioAsset.category === 'noise_cancellation';
    let forceTriggerDownload = false;
    
    if (!isNoiseCancellation && isDownloaded) {
      console.log(`[AudioService] ⚠️ [强制触发] 检测到普通场景已下载，强制删除文件以触发下载流程`);
      console.log(`[AudioService] ⚠️ [强制触发] 目的：验证 DownloadService 下载进度条 UI`);
      
      // 实际删除文件，强制触发下载
      try {
        const RNFS = await import('react-native-fs');
        await RNFS.unlink(localPath);
        console.log(`[AudioService] ✅ [强制触发] 文件已删除：${localPath}`);
        forceTriggerDownload = true;
        isDownloaded = false; // 重置状态
      } catch (error) {
        console.error(`[AudioService] ❌ [强制触发] 删除文件失败:`, error);
      }
    }
    
    console.log(`==========================================\n`);
    
    if (!isDownloaded || forceTriggerDownload) {
      // 【资源未下载】触发下载流程
      console.log(`[AudioService] 📥 资源未下载，触发下载：${sceneId}`);
      
      // 订阅下载完成事件
      const downloadCompleteHandler = async (completedAssetId: string) => {
        if (completedAssetId === sceneId) {
          console.log(`[AudioService] ✅ 下载完成回调触发：${sceneId}`);
          
          // 延迟 500ms 确保文件完全落盘
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 自动预加载刚下载的资源
          try {
            await this.preloadSingleSound(sceneId);
            console.log(`[AudioService] ✅ 下载后自动预加载完成：${sceneId}`);
          } catch (error) {
            console.error(`[AudioService] ❌ 下载后预加载失败：${sceneId}`, error);
          }
        }
      };
      
      this.downloadCompleteCallbacks.add(downloadCompleteHandler);
      
      // 触发下载
      const { DownloadService } = await import('./DownloadService');
      const downloadResult = await DownloadService.downloadAudio(sceneId);
      
      // 移除回调
      this.downloadCompleteCallbacks.delete(downloadCompleteHandler);
      
      if (!downloadResult) {
        console.error(`[AudioService] ❌ 下载失败：${sceneId}`);
        return null;
      }
      
      console.log(`[AudioService] ✅ 下载完成，尝试加载：${sceneId}`);
    }
    
    // 【拦截检查】再次确认资源存在性，严禁加载不存在的资源
    const finalCheck = await RNFS.exists(localPath);
    if (!finalCheck) {
      console.error(`[AudioService] ❌ 拦截：资源 ${sceneId} 不存在，禁止进入播放逻辑！`);
      return null;
    }
    
    // 兜底：动态加载（资源已下载）
    console.log(`[AudioService] 📥 动态加载 ${sceneId} Sound (资源已下载)`);
    await this.loadExtraSound(sceneId);
    const loadedSound = this.activeExtraSounds.get(sceneId);
    console.log(`[AudioService] 🔍 加载后检查：${sceneId} → ${loadedSound ? '成功获取' : '获取失败'}`);
    return loadedSound || null;
  };

  /**
   * 【音频秒开】播放场景音频（带渐入效果）
   * @param sceneId 场景 ID
   * @param targetVolume 目标音量（0-1）
   * @param fadeDuration 渐入时长（毫秒）
   */
  public playSceneWithFade = async (
    sceneId: string,
    targetVolume: number = 0.75,
    fadeDuration: number = 300
  ): Promise<void> => {
    console.log(`[AudioService] 🎵 开始播放场景：${sceneId}`);
    
    // 【强制同步】第一行就执行 setActiveScene，确保 UI 状态与播放引擎 100% 同步
    const scene = SCENES.find(s => s.id === sceneId);
    if (scene) {
      this.currentBaseScene = scene;
      this.notifyListeners();
    } else {
      console.error(`[AudioService] ❌ 场景 ${sceneId} 在 SCENES 配置中不存在`);
    }
    
    const sound = await this.getOrLoadExtraSound(sceneId);
    if (!sound) {
      console.error(`[AudioService] ❌ 无法播放 ${sceneId}: Sound 未加载`);
      return;
    }
    
    // 【新增】应用场景 EQ 预设
    EQManager.applyScenePreset(sound, sceneId, true);
    
    // 从 0 音量开始播放
    sound.setVolume(0);
    sound.play();
    
    console.log(`[AudioService] ▶️ ${sceneId} 开始播放，启动渐入效果...`);
    
    // 渐入效果
    const startTime = Date.now();
    const fadeInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / fadeDuration, 1);
      
      // 平滑渐入曲线
      const currentVolume = targetVolume * (0.5 + 0.5 * Math.sin(progress * Math.PI - Math.PI / 2));
      sound.setVolume(currentVolume);
      
      if (progress >= 1) {
        clearInterval(fadeInterval);
        console.log(`[AudioService] ✅ ${sceneId} 播放渐入完成 (最终音量：${sound.getVolume()})`);
      }
    }, 16); // ~60fps
  };

  /**
   * 【舟上雨 - 空间平移】获取 Sound 实例（向后兼容）
   * @returns Sound 实例或 null
   */
  public getBoatRainSound = (): Sound | null => {
    return this.boatRainSound || this.getExtraSound('scene_boat_rain');
  };

  /**
   * 【午后书店 - 空间聚焦】设置 Pan 值（向后兼容）
   * @param pan Pan 值，-1.0=最左，0=中央，1.0=最右
   */
  public setBookstorePan = async (pan: number): Promise<void> => {
    return this.setExtraSoundPan('scene_bookstore', pan);
  };

  /**
   * 【午后书店 - 空间聚焦】为书店场景启用 LFO Panning（向后兼容）
   * @param sceneId 场景 ID
   */
  public enableBookstorePanning = (sceneId: string) => {
    // 清理旧的 Panning
    this.disableBookstorePanning();
    
    // 仅对书店场景启用 Panning
    if (sceneId !== 'scene_bookstore') {
      console.log('[AudioService] ⚠️ 场景', sceneId, '不支持书店 Panning，跳过');
      return;
    }
    
    console.log('[AudioService] 📚 为书店场景启用 Panning LFO (45 秒周期)');
    this.isBookstorePanningEnabled = true;
    
    // 加载书店音频到 Sound 实例
    this.loadBookstoreSound().then(() => {
      console.log('[AudioService] ✅ 书店 Sound 已加载，等待 Hook 调用');
    }).catch(error => {
      console.error('[AudioService] ❌ 加载书店 Sound 失败:', error);
      this.isBookstorePanningEnabled = false;
    });
  };

  /**
   * 【午后书店 - 空间聚焦】禁用 Panning（向后兼容）
   */
  public disableBookstorePanning = () => {
    if (this.currentLFOBookstoreDisposer) {
      console.log('[AudioService] 📚 禁用书店 Panning');
      this.currentLFOBookstoreDisposer();
      this.currentLFOBookstoreDisposer = null;
    }
    this.isBookstorePanningEnabled = false;
    
    // Pan 归零
    this.setBookstorePan(0);
    console.log('[AudioService] ✅ 书店 Panning 已禁用，Pan 归零');
  };

  /**
   * 【午后书店 - 空间聚焦】加载书店音频到 Sound 实例（向后兼容）
   */
  private loadBookstoreSound = async (): Promise<void> => {
    return this.loadExtraSound('scene_bookstore');
  };

  /**
   * 【午后书店 - 空间聚焦】设置 Panning LFO 回调（向后兼容）
   * @param disposer 停止函数
   */
  public setBookstoreLFOCallback = (disposer: () => void) => {
    this.currentLFOBookstoreDisposer = disposer;
    this.registerLFODisposer('scene_bookstore', disposer);
  };

  /**
   * 【午后书店 - 空间聚焦】获取 Sound 实例（向后兼容）
   * @returns Sound 实例或 null
   */
  public getBookstoreSound = (): Sound | null => {
    return this.bookstoreSound || this.getExtraSound('scene_bookstore');
  };
  
  /**
   * 【LFO 集成】设置 LFO 音量调制回调（由 React 组件调用）
   * @param disposer 清理函数
   */
  public setLFOVolumeCallback = (disposer: () => void) => {
    this.currentLFOVolumeDisposer = disposer;
  };
  
  /**
   * 【LFO 集成】获取 LFO 启用状态
   */
  public getIsLFOEnabled = (): boolean => {
    return this.isLFOEnabled;
  };

  /**
   * 【资源降级保护】检查音频资源是否就绪
   * 用于播放器 UI 降级显示，防止未下载完成时报错崩溃
   * @param type 资源类型（如：'balanced_noise_1', 'crowd_noise_2' 等）
   * @returns 资源是否可用
   */
  public isAssetReady = async (type: string): Promise<boolean> => {
    try {
      // 1. 检查是否在 RESOURCE_MAP 中（远程资源）
      const { RESOURCE_MAP } = await import('../config/ResourceConfig');
      if (RESOURCE_MAP[type]) {
        // 远程资源：检查是否已下载
        return await isDownloaded(type);
      }

      // 2. 检查是否为本地场景资源
      const scene = SCENES.find(s => s.id === type);
      if (scene && scene.filename) {
        // 场景资源：检查 Sound 实例是否已加载
        const sound = this.getExtraSound(type);
        return sound?.isLoaded() ?? false;
      }

      // 3. 其他情况：默认不可用
      return false;
    } catch (error) {
      console.error('[AudioService] isAssetReady 检查失败:', error);
      return false;
    }
  };

  // ==================== 西方教会 - LFO 动态调制 ====================

  /**
   * 【西方教会 - 音量呼吸】为西方教会场景启用 LFO Volume 调制
   * @param sceneId 场景 ID（如 'western_church_gregorian'）
   * @param onVolumeChange 音量变化回调
   */
  public enableWesternChurchVolumeLFO = (
    sceneId: string,
    onVolumeChange?: (volume: number) => void
  ) => {
    // 清理旧的 LFO
    this.disableWesternChurchVolumeLFO();
    
    // 仅对西方教会场景启用
    if (!sceneId.startsWith('western_church_')) {
      console.log('[AudioService] ⚠️ 场景', sceneId, '不是西方教会场景，跳过 Volume LFO');
      return;
    }
    
    console.log('[AudioService] 🎵 为西方教会场景启用 Volume LFO:', sceneId);
    this.isWesternChurchLFOEnabled = true;
    this.westernChurchBaseVolume = this.ambientVolume;
  };

  /**
   * 【西方教会 - 音量呼吸】禁用 Volume LFO
   */
  public disableWesternChurchVolumeLFO = () => {
    if (this.currentLFOVolumeDisposerWC) {
      console.log('[AudioService] 🎵 禁用西方教会 Volume LFO');
      this.currentLFOVolumeDisposerWC();
      this.currentLFOVolumeDisposerWC = null;
    }
    this.isWesternChurchLFOEnabled = false;
    
    // 恢复到基础音量
    TrackPlayer.setVolume(this.westernChurchBaseVolume).catch(() => {});
    console.log('[AudioService] ✅ 西方教会 Volume LFO 已禁用，恢复基础音量:', this.westernChurchBaseVolume);
  };

  /**
   * 【西方教会 - 音量呼吸】设置 Volume LFO 回调
   * @param disposer 停止函数
   */
  public setWesternChurchVolumeLFOCallback = (disposer: () => void) => {
    this.currentLFOVolumeDisposerWC = disposer;
  };

  /**
   * 【西方教会 - 动态声场】为西方教会场景启用 LFO Panning 调制
   * @param sceneId 场景 ID
   * @param onPanChange Pan 值变化回调
   */
  public enableWesternChurchPanningLFO = (
    sceneId: string,
    onPanChange?: (pan: number) => void
  ) => {
    // 清理旧的 Panning
    this.disableWesternChurchPanningLFO();
    
    // 仅对西方教会场景启用
    if (!sceneId.startsWith('western_church_')) {
      console.log('[AudioService] ⚠️ 场景', sceneId, '不是西方教会场景，跳过 Panning LFO');
      return;
    }
    
    console.log('[AudioService] 🎧 为西方教会场景启用 Panning LFO:', sceneId);
    this.isWesternChurchLFOEnabled = true;
  };

  /**
   * 【西方教会 - 动态声场】禁用 Panning LFO
   */
  public disableWesternChurchPanningLFO = () => {
    if (this.currentLFOPanDisposerWC) {
      console.log('[AudioService] 🎧 禁用西方教会 Panning LFO');
      this.currentLFOPanDisposerWC();
      this.currentLFOPanDisposerWC = null;
    }
    
    // Pan 归零
    TrackPlayer.setPan?.(0).catch(() => {});
    console.log('[AudioService] ✅ 西方教会 Panning LFO 已禁用，Pan 归零');
  };

  /**
   * 【西方教会 - 动态声场】设置 Panning LFO 回调
   * @param disposer 停止函数
   */
  public setWesternChurchPanningLFOCallback = (disposer: () => void) => {
    this.currentLFOPanDisposerWC = disposer;
  };

  /**
   * 【西方教会 - LFO】获取启用状态
   */
  public getIsWesternChurchLFOEnabled = (): boolean => {
    return this.isWesternChurchLFOEnabled;
  };

  // ... 其余 SleepTimer 等逻辑保持一致 ...
}

// 具名导出封装（保持原有调用方式）
export const setupPlayer = () => AudioService.getInstance().setupPlayer();
export const play = () => AudioService.getInstance().play();
export const pause = () => AudioService.getInstance().pause();
export const stop = () => AudioService.getInstance().stop();
export const stopAll = () => AudioService.getInstance().stopAll();
export const playScene = (scene: any) => AudioService.getInstance().playScene(scene);
export const isPlaying = () => AudioService.getInstance().isPlaying();
export const getCurrentScene = () => AudioService.getInstance().getCurrentScene();
export const getCurrentState = () => AudioService.getInstance().getCurrentState();
export const getCurrentBaseSceneId = () => AudioService.getInstance().getCurrentBaseSceneId();
export const getActiveSmallSceneIds = () => AudioService.getInstance().getActiveSmallSceneIds();
export const getInitialSleepSeconds = () => AudioService.getInstance().getInitialSleepSeconds();
export const getSleepEndTime = () => AudioService.getInstance().getSleepEndTime();
export const getAmbientVolume = () => AudioService.getInstance().getAmbientVolume();
export const syncNativeStatus = () => AudioService.getInstance().syncNativeStatus();
export const setSleepTimer = (minutes: number) => AudioService.getInstance().setSleepTimer(minutes);
export const clearSleepTimer = () => AudioService.getInstance().clearSleepTimer();
export const updateAmbientVolume = (volume: number) => AudioService.getInstance().updateAmbientVolume(volume);
export const playAmbient = (id: string) => AudioService.getInstance().playAmbient(id);
export const stopAllAmbient = () => AudioService.getInstance().stopAllAmbient();
export const toggleAmbience = (scene: any, targetState: boolean) => AudioService.getInstance().toggleAmbience(scene, targetState);
export const getRealIsPlaying = () => AudioService.getInstance().getRealIsPlaying();
export const getVolume = () => AudioService.getInstance().getVolume();
export const setVolume = (volume: number) => AudioService.getInstance().setVolume(volume);
export const isAssetReady = (type: string) => AudioService.getInstance().isAssetReady(type);

export default AudioService;