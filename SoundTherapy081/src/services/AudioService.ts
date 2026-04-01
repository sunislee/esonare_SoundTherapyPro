// 【去 Expo 化】完全使用 react-native-track-player
import { Platform, AppState, AppStateStatus } from 'react-native';

// 【RN 0.81 兼容】解构导入，确保方法可访问
import TrackPlayer, { 
  State, 
  Capability, 
  Event, 
  RepeatMode,
  PlaybackState
} from 'react-native-track-player';

import { AUDIO_MAP, DEFAULT_FALLBACK_SOURCE, getDownloadUrl, getLocalPath } from '../constants/audioAssets';
import RNFS from 'react-native-fs';
import { NotificationService } from './NotificationService';
import { OfflineService } from './OfflineService';
import { Scene, SCENES } from '../constants/scenes';

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

  private constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
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
    this.appState = nextAppState;
    
    if (nextAppState === 'active' && this.pendingSetup) {
      this.pendingSetup = false;
      this.performSetup();
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

  async setupPlayer() {
    try {
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
        channelId: 'esonare_playback_v119',
        channelName: '心声冥想',
        category: 'transport',
        foregroundServiceType: 'mediaPlayback',
      },
      capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      compactCapabilities: [Capability.Play, Capability.Pause],
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Track);
    await TrackPlayer.setVolume(this.ambientVolume);
    await NotificationService.setup();
    
    this._isReady = true;
    console.log('[AudioService] ✅ 初始化完成，isReady = true');
  }

  async playScene(scene: Scene, options?: { triggerLoading?: boolean; skipNotify?: boolean }) {
    if (!scene || !scene.filename) return;

    console.log('[AudioService] ====== playScene 被调用 ======');
    console.log('[AudioService] scene.id:', scene.id);
    console.log('[AudioService] isProcessing:', isProcessing);
    
    // 【播放状态锁】如果有播放请求正在处理，直接拒绝
    if (isProcessing) {
      console.warn('[AudioService] ⚠️ 有播放请求正在处理，拒绝本次请求');
      return;
    }
    
    // 【播放状态锁】标记开始处理
    isProcessing = true;
    console.log('[AudioService] 🔒 已锁定播放状态');
    
    try {
      // 【RN 0.81 保护】初始化未完成前禁止播放
      if (!this._isReady) {
        console.warn('[AudioService] ⚠️ 初始化未完成，延迟播放');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!this._isReady) {
          console.error('[AudioService] ❌ 初始化超时，无法播放');
          isProcessing = false;
          return;
        }
      }

      // 防止同一个场景重复点击触发 reset
      if (this.isActuallyPlaying && this.currentBaseScene?.id === scene.id) {
        console.log('[AudioService] ⚠️ 同一场景正在播放，跳过');
        isProcessing = false;
        return;
      }
      
      // 【关键检查】如果已经在播放其他场景，先停止
      if (this.isActuallyPlaying && this.currentBaseScene?.id !== scene.id) {
        console.log('[AudioService] 停止之前的播放，切换到新场景');
        await TrackPlayer.stop();
        this.isActuallyPlaying = false;
      }
      
      // 【场景切换保护】停止所有交互音效，防止场景切换后交互音继续播放
      console.log('[AudioService] 🛑 场景切换，停止所有交互音');
      await this.stopAllAmbient();

      const shouldTriggerLoading = options?.triggerLoading !== false;
      if (shouldTriggerLoading) {
        this.loadingSceneId = scene.id;
        this.notifyLoading(true, scene.id);
        this.startLoadingTimeout(scene.id);
      }

      const localPath = getLocalPath(scene.category, scene.filename);
      const isLocal = await RNFS.exists(localPath.replace('file://', ''));
      const isOffline = await OfflineService.isOfflineMode();
      
      let uri: string | null = null;
      if (isLocal) {
        uri = localPath;
      } else if (!isOffline) {
        uri = getDownloadUrl(scene.id)[0];
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
        // 【关键修复 1】先 stop 掉之前的队列，清空错误缓存
        console.log('[AudioService] 停止之前的播放队列...');
        await TrackPlayer.stop();
        await TrackPlayer.reset();
        console.log('[AudioService] ✅ 队列已清空');
        
        // 【关键修复 2】延迟 800ms 播放，给 Android 系统时间刷新文件索引
        console.log('[AudioService] 等待 800ms 确保文件索引刷新...');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        await TrackPlayer.add([track]);
        console.log('[AudioService] ✅ TrackPlayer.add 成功');
        
        // 0.81 环境下确保队列已就绪
        const queue = await TrackPlayer.getQueue();
        console.log('[AudioService] 队列长度:', queue.length);
        
        if (queue.length > 0) {
          // 【关键】播放前状态检查
          const stateBefore = await TrackPlayer.getState();
          console.log('[AudioService] 播放前状态:', stateBefore);
          
          // 【关键修复】在 play() 之前先更新 currentBaseScene
          // 这样 Event.PlaybackState 事件触发 notifyListeners() 时，状态已经是正确的
          this.currentBaseScene = scene;
          this.isActuallyPlaying = true;
          console.log('[AudioService] ✅ 预设状态：currentBaseScene =', scene.id, ', isActuallyPlaying = true');
          
          // 【1】seekTo(0) - 确保从开头播放
          console.log('[AudioService] [1/3] 调用 TrackPlayer.seekTo(0)');
          await TrackPlayer.seekTo(0);
          console.log('[AudioService] ✅ seekTo(0) 完成');
          
          // 【2】setVolume(1.0) - 强制设置最大音量
          console.log('[AudioService] [2/3] 调用 TrackPlayer.setVolume(1.0)');
          await TrackPlayer.setVolume(1.0);
          console.log('[AudioService] ✅ setVolume(1.0) 完成');
          
          // 【3】play() - 开始播放
          console.log('[AudioService] [3/3] --- [强制执行播放] --- 调用 TrackPlayer.play()');
          await TrackPlayer.play();
          
          // 【大招】播放后立即强刷元数据，解决通知栏滞后
          console.log('[AudioService] [4/4] 强制刷新通知栏元数据...');
          await TrackPlayer.updateNowPlayingMetadata({
            title: translatedTitle,
            artist: translatedArtist,
          });
          console.log('[AudioService] ✅ updateNowPlayingMetadata 完成');
          
          // 【关键修复 3】3 秒缓冲监控
          console.log('[AudioService] 开始监控缓冲状态...');
          setTimeout(async () => {
            const currentState = await TrackPlayer.getState();
            console.log('[AudioService] 3 秒后状态检查:', currentState);
            
            if (currentState === 'buffering') {
              console.warn('[AudioService] ⚠️ [Warning] 还在缓冲，检查 Uri 编码是否正确');
              console.warn('[AudioService] 原始 URI:', finalUri);
              console.warn('[AudioService] encodeURI 后:', encodeURI(finalUri));
              
              // 尝试重新编码 URI
              const encodedUri = encodeURI(finalUri);
              if (finalUri !== encodedUri) {
                console.warn('[AudioService] URI 包含特殊字符，已重新编码');
              }
            } else if (currentState === 'playing') {
              console.log('[AudioService] ✅ 播放正常进行中');
            } else {
              console.warn('[AudioService] ⚠️ 非预期状态:', currentState);
            }
          }, 3000);
          
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
  addListener(l: () => void) { this.listeners.add(l); }
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
    this.listeners.forEach(l => l());
    const curState = this.isActuallyPlaying ? State.Playing : State.Paused;
    console.log('[AudioService] notifyListeners 被调用, isActuallyPlaying=', this.isActuallyPlaying, 'curState=', curState, 'currentBaseScene.id=', this.currentBaseScene?.id);
    console.log('[AudioService] audioStateListeners 数量:', this.audioStateListeners.size);
    this.audioStateListeners.forEach((l, index) => {
      console.log('[AudioService] 调用第', index + 1, '个监听器');
      l({ id: this.currentBaseScene?.id || null, state: curState });
    });
    
    if (this.currentBaseScene) {
      NotificationService.updateNotification(this.currentBaseScene, this.getCurrentState()).catch(() => {});
      NotificationService.updatePlaybackState(this.isActuallyPlaying).catch(() => {});
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
    
    this.ambientVolume = volume;
    await TrackPlayer.setVolume(volume);
    this.volumeListeners.forEach(l => l(volume));
  }

  async switchSoundscape(scene: Scene): Promise<void> {
    await this.playScene(scene);
  }

  async togglePlayback(scene: Scene): Promise<void> {
    if (this.isActuallyPlaying && this.currentBaseScene?.id === scene.id) {
      await this.pause();
    } else {
      await this.playScene(scene);
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

export default AudioService;