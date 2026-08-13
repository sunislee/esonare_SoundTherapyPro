/**
 * @fileoverview Audio Service - 音频播放引擎，管理本地与远程音轨的播放、定时切换、
 *   音量淡入淡出、EQ/降噪/DRC 处理链以及下载进度分发。
 *
 * @architecture-constraint
 * [架构约束] 经 2026 年 6 月全量依赖图谱分析（6247个节点，8578条边确认）：
 * AudioService 与 DownloaderService 之间必须保持绝对的事件驱动解耦（如 addResourceLoadingListener/notifyListeners）。
 * 严禁任何团队成员后续在重构或维护时引入两者的直接函数硬编码调用，以维护 codebase 架构的清洁度。
 */

// 【去 Expo 化】完全使用 react-native-track-player
import { Platform, AppState, AppStateStatus, InteractionManager, DeviceEventEmitter } from 'react-native';

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
import * as RNFS from '@dr.pogodin/react-native-fs';
import { NotificationService } from './NotificationService';
import { Scene, SCENES } from '../constants/scenes';
import { EQManager } from './EQManager';
// 【v1.4.2 Release 修复】静态 import NativeEQ，替代 releaseEqualizerResources 中的动态 require()
// 动态 require('../modules/NativeEQ') 在 Hermes 混淆后可能导致方法名丢失或模块 undefined
import { NativeEQ } from '../modules/NativeEQ';
import { DownloaderServiceInstance, isDownloaded } from '../services/DownloaderService';

// 【多语言支持 - 终极补丁】直接导入 JSON 文件，手动取值
import zh from '../i18n/locales/zh.json';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';
import i18n from '../i18n';

// 【交互音效独立播放器】
import SFXPlayer from './SFXPlayer';
import { recordShopAudioManager, RecordShopLayer, RecordShopVolumes } from './RecordShopAudioManager';

// 【Shuffle 后台切换优化】静态导入 SceneRoamManager，避免锁屏后 await import() 卡死
import { sceneRoamManager } from './SceneRoamManager';

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
  
  // 【静默模式兜底】资源加载状态监听器
  private resourceLoadingListeners: Set<(state: { sceneId: string; loading: boolean; message: string }) => void> = new Set();
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
  private _setupPromise: Promise<void> | null = null;

  // 【🔑 修复 #2】自动识别禁用标志
  // 当进入 life_record_shop 时设置为 true，通知 NoiseCancellationExperiment 跳过自动识别
  private skipAutoEnvironmentDetection: boolean = false;
  
  // 【漫游轮询定时器】
  private roamCheckTimer: any = null;
  private isSwitchingScene = false; // 防止重复切换
  
  // 【进度监听定时器 - 提前淡入淡出】
  private progressMonitorTimer: any = null;
  private hasTriggeredEarlyFade = false; // 防止重复触发提前切换
  private _highProgressStartTime: number | null = null; // 超级兜底计时器
  
  // 【双实例预加载缓存】
  private preloadedNextScene: Scene | null = null; // 预加载的下一个场景
  private preloadedTrack: Track | null = null; // 预加载的Track对象
  private isPreloaded = false; // 是否已完成预加载
  private preloadTriggered = false; // 是否已触发预加载（80%时）
  
  // 【🆕 Shuffle 原生队列预加载】
  private shuffleQueuePreloaded = false; // Shuffle 队列是否已预加载到原生层
  
  // 【Cross-fade 淡入淡出锁】
  private isFading = false; // 防止快速连续切换导致音量逻辑冲突
  private fadeStartTime = 0; // 【方案 A】淡入淡出开始时间戳（用于竞态保护）
  
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

  // 【诊断】实例ID，用于确认是否存在多个实例
  private readonly instanceId: string;
  
  private constructor() {
    this.instanceId = `AudioService#${Math.random().toString(36).substring(2, 10)}`;
    console.error(`[${this.instanceId}] CONSTRUCTOR START`);
    try {
      AppState.addEventListener('change', this.handleAppStateChange);
      // 【生命周期管理】注册销毁钩子
      if (Platform.OS === 'android') {
        // 使用 AppState 的 change 事件检测应用退出
        this.handleAppStateChange = this.handleAppStateChange.bind(this);
      }
      
      // 【v1.4.1 关键修复】清理旧版本的持久化播放状态
      console.error('[AudioService] CONSTRUCTOR calling cleanupLegacyPlaybackState...');
      const cleanupPromise = this.cleanupLegacyPlaybackState();
      console.error('[AudioService] CONSTRUCTOR cleanupLegacyPlaybackState returned, promise =', cleanupPromise);
    } catch (e) {
      console.error('[AudioService] CONSTRUCTOR ERROR:', e);
    }
    console.error('[AudioService] CONSTRUCTOR END, _isReady =', this._isReady);
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
      console.error('[getInstance] Creating new instance...');
      AudioService.instance = new AudioService();
    } else {
      console.error(`[getInstance] Returning existing instance: ${(AudioService.instance as any).instanceId}`);
    }
    return AudioService.instance;
  }

  /**
   * 初始化基础监听，辅助定位 0.81 没声音的问题
   */
  private setupListeners() {
    TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
      const state = (event as PlaybackState).state;
      console.log('[AudioService] 状态变更:', state);
      
      // 【🔥🔥🔥 精准修复】只对"最终停止状态"设为 false！中间状态不覆盖！
      if (state === State.Playing) {
        this.isActuallyPlaying = true;
        console.log(`[AudioService] ▶️ [PlaybackState] state=Playing → isActuallyPlaying=true`);
      } else if (state === State.Stopped || state === State.Ended || state === State.None || state === State.Paused) {
        this.isActuallyPlaying = false;
        console.log(`[AudioService] 🛑 [PlaybackState] 检测到结束状态(${state})，强制 isActuallyPlaying=false`);
      } else {
        // Buffering / Ready 等中间状态 → 保持 isActuallyPlaying 不变！
        console.log(`[AudioService] ⏳ [PlaybackState] state=${state} → 中间状态，保持 isActuallyPlaying=${this.isActuallyPlaying}`);
      }
      
      this.notifyListeners();
      
      // 【备用方案】检测 Ended 状态触发漫游切换
      if (state === State.Ended) {
        console.log('═══════════════════════════════════════');
        console.log('[AudioService] 🎵🎵🎵 检测到播放结束状态(Ended)！');
        console.log('═══════════════════════════════════════');
        
        try {
          const isRoaming = sceneRoamManager.getIsRoaming();
          
          console.log(`[AudioService] 🎲 [Ended] 漫游状态: isRoaming=${isRoaming}, currentBaseScene=${this.currentBaseScene?.id || 'null'}`);
          
          if (isRoaming && this.currentBaseScene) {
            console.log('[AudioService] 🎲✅ [Ended] 漫游模式激活！');
            
            // ══════════════════════════════════════════
            // 【🔑 核心修复】检查是否有预加载的下一首在队列中
            // 如果有 → 让原生层自动推进（不依赖 JS）
            // 如果没有 → 尝试 JS 切换（前台可用，后台可能失败）
            // ══════════════════════════════════════════
            try {
              const queue = await TrackPlayer.getQueue();
              const currentTrackIndex = await TrackPlayer.getCurrentTrack();
              
              console.log(`[AudioService] 🔍 [Ended] 队列长度: ${queue.length}, 当前索引: ${currentTrackIndex}`);
              
              if (queue.length > 1 && currentTrackIndex !== null && currentTrackIndex < queue.length - 1) {
                console.log('[AudioService] ✅ [Ended] 队列中有下一首！等待原生层自动推进...');
                console.log('[AudioService] ✅ [Ended] 不执行 JS 切换，避免锁屏卡死');
                
                this.isActuallyPlaying = true; // 保持播放状态
                return; // 让原生层处理！
              } else {
                console.warn('[AudioService] ⚠️ [Ended] 队列为空或无下一首，尝试 JS 切换...');
              }
            } catch (queueError) {
              console.warn('[AudioService] ⚠️ [Ended] 检查队列失败:', queueError);
            }
            
            // 【兜底】如果没有预加载或队列检查失败，尝试 JS 切换
            const nextScene = sceneRoamManager.getNextRoamScene(this.currentBaseScene.id);
            console.log(`[AudioService] 🎲 [Ended] getNextRoamScene 返回: ${nextScene?.id || 'null'}`);
            
            if (nextScene) {
              console.log(`[AudioService] 🚀 [Ended] 准备切换: ${this.currentBaseScene.id} → ${nextScene.id}`);
              this.isFading = false; // 强制释放锁！
              await this.switchSoundscape(nextScene);
              console.log('[AudioService] ✅ [Ended] 切换完成！');
              return; // 漫游切换完成，直接返回
            } else {
              console.warn('[AudioService] ⚠️ [Ended] 无可用下一个场景，停止漫游');
              sceneRoamManager.stopRoaming();
            }
          }
          
          // 【🔁 Loop 实验】非漫游模式 + RepeatMode.Track → 自动循环，不停止！
          if (!isRoaming) {
            const currentMode = await TrackPlayer.getRepeatMode();
            if (currentMode === RepeatMode.Track) {
              console.log('[AudioService] 🔁 [Ended] 单场景循环模式 → 音频自动重播，保持播放状态');
              return;
            }
          }
          
          // 【🔥 关键修复】非漫游模式或无下一个场景时，必须停止播放并更新 UI！
          console.log('[AudioService] ⏹️ [Ended] 音频播放完毕，停止播放并更新状态');
          this.isActuallyPlaying = false;
          this.notifyListeners();
          
        } catch (e) {
          console.error('[AudioService] ❌ [Ended] 处理异常:', e);
          // 即使异常也要确保状态正确
          this.isActuallyPlaying = false;
          this.notifyListeners();
        }
      }
    });

    TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
      console.error('[AudioService] 🚨 播放器底层错误:', error);
    });

    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (event) => {
      console.log('═══════════════════════════════════════');
      console.log('[AudioService] 🎵🎵🎵 播放队列结束事件触发！');
      console.log(`[AudioService] 🎵 当前场景: ${this.currentBaseScene?.id || 'null'}`);
      console.log('═══════════════════════════════════════');
      
      // 【🔁 Loop 实验】检查是否单场景循环模式
      try {
        const isRoaming = sceneRoamManager.getIsRoaming();
        if (!isRoaming) {
          const currentMode = await TrackPlayer.getRepeatMode();
          if (currentMode === RepeatMode.Track) {
            console.log('[AudioService] 🔁 [QueueEnded] 单场景循环 → 自动重播，保持状态');
            return;
          }
        }
      } catch (e) {
        console.warn('[AudioService] ⚠️ [QueueEnded] 检查循环模式失败:', e);
      }
      
      this.isActuallyPlaying = false;
      this.notifyListeners();
      
      // 触发漫游切换
      try {
        const isRoaming = sceneRoamManager.getIsRoaming();
        
        console.log(`[AudioService] 🎲 [QueueEnded] 漫游状态: isRoaming=${isRoaming}, currentBaseScene=${this.currentBaseScene?.id || 'null'}`);
        
        if (isRoaming && this.currentBaseScene) {
          console.log('[AudioService] 🎲✅ [QueueEnded] 漫游模式激活！');
          
          // ══════════════════════════════════════════
          // 【🔑 核心修复】队列结束时，检查是否需要重新加载
          // 正常情况下不应该走到这里（因为有预加载机制）
          // 如果走到了 → 说明预加载失败或队列异常
          // ══════════════════════════════════════════
          try {
            const queue = await TrackPlayer.getQueue();
            console.log(`[AudioService] 🔍 [QueueEnded] 当前队列长度: ${queue.length}`);
            
            if (queue.length > 0) {
              console.log('[AudioService] ⚠️ [QueueEnded] 队列非空但触发了 QueueEnded，尝试重新加载...');
            }
          } catch (queueError) {
            console.warn('[AudioService] ⚠️ [QueueEnded] 检查队列失败:', queueError);
          }
          
          const nextScene = sceneRoamManager.getNextRoamScene(this.currentBaseScene.id);
          console.log(`[AudioService] 🎲 [QueueEnded] getNextRoamScene 返回: ${nextScene?.id || 'null'}`);
          
          if (nextScene) {
            console.log(`[AudioService] 🚀 [QueueEnded] 准备切换: ${this.currentBaseScene.id} → ${nextScene.id}`);
            this.isFading = false; // 强制释放锁！
            await this.switchSoundscape(nextScene);
            console.log('[AudioService] ✅ [QueueEnded] 切换完成！');
          } else {
            console.warn('[AudioService] ⚠️ [QueueEnded] 无可用下一个场景，停止漫游');
            sceneRoamManager.stopRoaming();
          }
        } else {
          console.log('[AudioService] ℹ️ 非漫游模式或不满足条件，跳过自动切换');
        }
      } catch (e) {
        console.error('[AudioService] ❌❌❌ 漫游切换异常:', e);
      }
    });

    // ═══════════════════════════════════════════════════
    // 【🔑 核心优化】PlaybackTrackChanged 监听器
    // 当 TrackPlayer 原生层自动推进到下一首时触发
    // 用于：锁屏后 Shuffle 自动切换的场景同步
    // ═══════════════════════════════════════════════════
    TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async (event) => {
      try {
        const { track, position, nextTrack } = event as any;
        
        console.log('═══════════════════════════════════════');
        console.log('[AudioService] 🎵🎵🎵 [TrackChanged] 检测到曲目切换！');
        console.log(`[AudioService] 🎵 [TrackChanged] prevTrack: ${track?.id || 'null'}`);
        console.log(`[AudioService] 🎵 [TrackChanged] nextTrack: ${nextTrack?.id || 'null'}`);
        console.log(`[AudioService] 🎵 [TrackChanged] position: ${position || 0}`);
        console.log('═══════════════════════════════════════');
        
        // 检查是否是 Shuffle 模式下的自动切换
        if (!sceneRoamManager.getIsRoaming()) {
          console.log('[AudioService] ℹ️ [TrackChanged] 非漫游模式，跳过处理');
          return;
        }
        
        // ══════════════════════════════════════════
        // 【🆕 核心改进】从 nextTrack 获取场景信息
        // 新方案：不再依赖 preloadedNextScene，直接从 Track 对象获取！
        // ══════════════════════════════════════════
        const nextTrackId = nextTrack?.id;
        
        if (!nextTrackId) {
          console.warn('[AudioService] ⚠️ [TrackChanged] 无法获取下一首 ID');
          return;
        }
        
        console.log(`[AudioService] 🔍 [TrackChanged] 下一首ID: ${nextTrackId}`);
        
        // 尝试从 SceneRoamManager 或全局配置中查找对应的场景对象
        let nextScene: Scene | null = null;
        
        // 方法1：检查预加载缓存（兼容旧逻辑）
        if (this.preloadedNextScene?.id === nextTrackId) {
          nextScene = this.preloadedNextScene;
          console.log('[AudioService] ✅ [TrackChanged] 从预加载缓存找到场景');
        }
        
        // 方法2：从 SceneRoamManager 获取（新方案）
        if (!nextScene) {
          const allScenes = sceneRoamManager.getBaseScenesByCategory(sceneRoamManager.roamCategory);
          nextScene = allScenes.find((s: any) => s.id === nextTrackId) || null;
          if (nextScene) {
            console.log('[AudioService] ✅ [TrackChanged] 从 RoamManager 找到场景');
          }
        }
        
        if (!nextScene) {
          console.warn(`[AudioService] ⚠️ [TrackChanged] 未找到场景: ${nextTrackId}，使用基本信息`);
          // 即使找不到完整场景对象，也要更新基本状态
          this.currentBaseScene = { 
            id: nextTrackId, 
            title: nextTrack?.title || nextTrackId,
            filename: '',
            category: sceneRoamManager.roamCategory || 'nature',
            duration: 0
          } as Scene;
        } else {
          // ══════════════════════════════════════════
          // 【核心】更新全局播放状态！
          // ══════════════════════════════════════════
          
          const previousScene = this.currentBaseScene;
          this.currentBaseScene = nextScene;
          
          console.log(`[AudioService] ✅ [TrackChanged] 场景已更新: ${previousScene?.id} → ${this.currentBaseScene.id}`);
          console.log(`[AudioService] ✅ [TrackChanged] 标题: ${this.currentBaseScene.title}`);
          
          // 记录已播放场景（用于避重）
          sceneRoamManager.recordPlayedScene(nextScene.id);
        }
        
        // 重置播放状态
        this.isActuallyPlaying = true;
        this.isFading = false;
        this.isSwitchingScene = false;
        
        // 清空旧的预加载缓存
        this.preloadedNextScene = null;
        this.preloadedTrack = null;
        this.isPreloaded = false;
        this.preloadTriggered = false;
        this.hasTriggeredEarlyFade = false;
        
        // 通知 UI 层更新（封面、标题、进度条等）
        this.notifyListeners();
        
        console.log('[AudioService] ✅✅✅ [TrackChanged] 全局状态已同步！');
        console.log(`[AudioService] ✅ [TrackChanged] 当前播放: ${this.currentBaseScene.title}`);
        
        // ══════════════════════════════════════════
        // 【🆕 关键优化】检查并补充队列！
        // 当剩余曲目不足时，提前补充新的随机曲目
        // ══════════════════════════════════════════
        try {
          const queue = await TrackPlayer.getQueue();
          const currentTrackIndex = await TrackPlayer.getCurrentTrack();
          if (currentTrackIndex === null) {
            console.warn('[AudioService] ⚠️ [TrackChanged] getCurrentTrack() 返回 null，跳过队列检查');
            return; // 无有效 track，无法计算剩余量
          }
          
          if (currentTrackIndex >= queue.length) {
            console.warn('[AudioService] ⚠️ [TrackChanged-队列检查] 当前 track 索引越界，跳过');
            return; // bounds check failed
          }

          const remainingTracks = queue.length - currentTrackIndex - 1;


          console.log(`[AudioService] 📊 [TrackChanged-队列检查] 剩余待播放: ${remainingTracks} 首`);
          


          if (remainingTracks <= 2 && this.shuffleQueuePreloaded) {
            console.log('[AudioService] 🔄 [TrackChanged] 队列即将耗尽，补充新曲目...');
            await this.preloadShuffleQueue(sceneRoamManager);
          }
        } catch (queueCheckError) {
          console.warn('[AudioService] ⚠️ [TrackChanged] 队列检查失败:', queueCheckError);
        }
        
        // 重新启动进度监听器（为后续操作做准备）
        this.stopProgressMonitor();
        this.stopRoamPolling();
        
        // 延迟一小段时间再启动，确保原生层已经稳定
        setTimeout(() => {
          if (sceneRoamManager.getIsRoaming() && this.isActuallyPlaying) {
            this.startProgressMonitor();
            this.startRoamPolling();
            console.log('[AudioService] 🔄 [TrackChanged] 监听器已重启');
          }
        }, 1000);
        
      } catch (error) {
        console.error('[AudioService] ❌ [TrackChanged] 处理异常:', error);
        
        // 即使异常也要确保状态正确
        this.isActuallyPlaying = true; // 假设正在播放
        this.notifyListeners();
      }
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
        // 【v1.4.2 Release 修复】使用静态 import 的 NativeEQ，避免混淆后方法丢失
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

  /**
   * 【新增】允许外部获取实际播放状态（用于 HomeScreen 的漫游状态控制）
   */
  getIsActuallyPlaying(): boolean {
    return this.isActuallyPlaying;
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
    // 【幂等性保护】如果已经初始化完成，直接返回
    if (this._isReady) {
      console.log('[AudioService] ✅ 已经初始化完成，跳过 setupPlayer');
      return;
    }
    
    // 【关键修复】如果正在初始化中，等待当前初始化完成
    if (this._setupPromise) {
      console.log('[AudioService] ⏳ 正在初始化中，等待完成...');
      return this._setupPromise;
    }
    
    // 【关键修复】创建初始化 Promise 并缓存
    this._setupPromise = this.performSetupInternal();
    return this._setupPromise;
  }
  
  private async performSetupInternal() {
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
      // 【关键修复】初始化失败时清空 promise，允许重试
      this._setupPromise = null;
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

    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    await TrackPlayer.setVolume(this.ambientVolume);
    await NotificationService.setup();

    // 【🔥 v1.4.2 根因修复】TrackPlayer 初始化完成后，注册内部事件监听器
    try {
      this.setupListeners();
      console.log('[AudioService] ✅ setupListeners() 已调用');
    } catch (listenerErr) {
      console.warn('[AudioService] ⚠️ setupListeners() 失败（不影响继续运行）:', listenerErr);
    }
    
    // 【关键】设置 _isReady = true，确保 AudioContext 能检测到
    this._isReady = true;
    console.log('[AudioService] ✅ 初始化完成，isReady = true，均衡器将在首次播放时初始化');

    // 【🔥 v1.4.2-coldstart-fix】冷启动后自动预加载背景图缓存，确保 backgroundImagesReady 事件能触发
    // 否则 backgroundAvailabilityCache 永远为空 → getSceneBackground fallback 到默认死图
    // 🔥 调用 scenes.ts 的有效实现（AudioService 中已有一个损坏的空壳 preloadBackgroundAvailability）
    import('../constants/scenes').then(({ preloadBackgroundAvailability: preloadBg }) => {
      return preloadBg();
    }).then(() => {
      DeviceEventEmitter.emit('backgroundImagesReady');
      console.log('[AudioService] ✅ [preload] 背景图缓存就绪（scenes.ts），已 emit backgroundImagesReady');
    }).catch(e => {
      console.warn('[AudioService] ⚠️ preloadBackgroundAvailability 失败:', e);
    });
  }
    
    /**
     * 【🔁 Loop 实验】公共方法：根据漫游状态设置 RepeatMode
     * @param isRoaming true=漫游模式(Off), false=单场景循环(Track)
     */
    async applyLoopMode(isRoaming: boolean): Promise<void> {
      try {
        if (isRoaming) {
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
          console.log('[AudioService] 🎲 [applyLoopMode] 漫游模式 → RepeatMode=Off');
        } else {
          await TrackPlayer.setRepeatMode(RepeatMode.Track);
          console.log('[AudioService] 🔁 [applyLoopMode] 单场景 → RepeatMode=Track (循环)');
        }
      } catch (e) {
        console.warn('[AudioService] ⚠️ [applyLoopMode] 设置失败:', e);
      }
    }

    /**
     * 【全局拦截】强制确保漫游模式下 RepeatMode 为 Off
     * 在所有播放操作后调用，防止任何地方覆盖设置
     */
    private async forceRepeatModeOffForRoaming() {
      try {
        if (sceneRoamManager.getIsRoaming()) {
          console.log('[AudioService] 🛡️ [全局拦截] 检测到漫游模式！');
          console.log('═══════════════════════════════════════');
          console.log('[AudioService] 🚀🚀🚀 [原生队列方案] 启动 Shuffle 原生队列预加载！');
          console.log('═══════════════════════════════════════');
          
          // ══════════════════════════════════════════
          // 【🔑🔑🔑 核心新方案】启动时一次性预加载多首到队列！
          // 原理：锁屏后 JS 线程挂起，无法动态添加曲目
          // 方案：在启动 Shuffle 时就预加载 5-10 首随机曲目
          // 效果：原生层自动按顺序播放整个队列，无需 JS 参与！
          // ══════════════════════════════════════════
          const preloadResult = await this.preloadShuffleQueue(sceneRoamManager);
          
          // ══════════════════════════════════════════
          // 【🚨 关键】显式设置 RepeatMode.Queue 确保队列自动推进！
          // Queue = 循环播放整个队列（播完最后一首回到第一首）
          // Off = 播放完当前就停止 ❌❌❌
          // Track = 循环当前单曲 ❌
          // ══════════════════════════════════════════
          if (preloadResult) {
            try {
              await TrackPlayer.setRepeatMode(RepeatMode.Queue);
              console.log('[AudioService] 🔄 [全局拦截] RepeatMode=Queue ✅✅✅ （队列将循环播放）');
            } catch (queueError) {
              console.warn('[AudioService] ⚠️ [全局拦截] 设置Queue失败，尝试保持默认:', queueError);
            }
          } else {
            console.warn('[AudioService] ⚠️ [全局拦截] 预加载失败，不设置Queue模式');
          }
          
          // 启动轮询定时器（兜底机制 - 前台时使用）
          this.startRoamPolling();
          
          // 【核心】启动进度监听定时器（主要机制 - 提前2秒触发，前台使用）
          this.startProgressMonitor();
        } else {
          // 【🔁 Loop 实验】非漫游模式 → 默认 Off（用户手动激活循环才设 Track）
          
          // 清空预加载的队列信息
          this.shuffleQueuePreloaded = false;
          
          // 停止轮询定时器
          this.stopRoamPolling();
          
          // 停止进度监听定时器
          this.stopProgressMonitor();
        }
      } catch (e) {
        console.warn('[AudioService] 🛡️ [全局拦截] 检查失败:', e);
      }
    }
    
    /**
     * 【🆕 核心方法】预加载 Shuffle 队列到原生层
     * 在启动 Shuffle 时调用，一次性添加多首随机曲目到 TrackPlayer 队列
     * 这样即使锁屏后 JS 线程挂起，原生层也能自动推进！
     * @returns 是否成功预加载
     */
    private async preloadShuffleQueue(sceneRoamManager: any): Promise<boolean> {
      if (!this.currentBaseScene) {
        console.warn('[AudioService] ⚠️ [Shuffle队列] 无当前场景');
        return false;
      }
      
      const SHUFFLE_QUEUE_SIZE = 8; // 预加载 8 首随机曲目
      
      try {
        console.log(`[AudioService] 🎲 [Shuffle队列] 开始预加载 ${SHUFFLE_QUEUE_SIZE} 首随机曲目...`);
        
        // 获取当前分类下的所有可用场景
        const category = sceneRoamManager.roamCategory;
        const allScenes = sceneRoamManager.getBaseScenesByCategory(category);
        
        // 过滤掉当前正在播放的场景
        const availableScenes = allScenes.filter((scene: any) => scene.id !== this.currentBaseScene?.id);
        
        if (availableScenes.length === 0) {
          console.warn('[AudioService] ⚠️ [Shuffle队列] 无可用场景');
          return false;
        }
        
        console.log(`[AudioService] 📊 [Shuffle队列] 可用场景数: ${availableScenes.length}`);
        
        // 随机打乱并选择 SHUFFLE_QUEUE_SIZE 首
        const shuffled = [...availableScenes].sort(() => Math.random() - 0.5);
        const selectedScenes = shuffled.slice(0, Math.min(SHUFFLE_QUEUE_SIZE, shuffled.length));
        
        console.log(`[AudioService] 🎯 [Shuffle队列] 已选择 ${selectedScenes.length} 首随机场景:`);
        selectedScenes.forEach((scene: any, index: number) => {
          console.log(`   ${index + 1}. ${scene.id} (${scene.title})`);
        });
        
        // 构建所有 Track 对象
        const tracks: any[] = [];
        for (const scene of selectedScenes) {
          const track = await this.buildTrackForScene(scene);
          if (track) {
            tracks.push(track);
          }
        }
        
        if (tracks.length === 0) {
          console.error('[AudioService] ❌ [Shuffle队列] 所有 Track 构建失败');
          return false;
        }
        
        console.log(`[AudioService] 📦 [Shuffle队列] 成功构建 ${tracks.length} 个 Track 对象`);
        
        // 添加到 TrackPlayer 原生队列
        await TrackPlayer.add(tracks);
        
        // 验证队列
        const queue = await TrackPlayer.getQueue();
        console.log('═══════════════════════════════════════');
        console.log(`[AudioService] ✅✅✅ [Shuffle队列-成功] 已添加 ${tracks.length} 首到原生队列！`);
        console.log(`[AudioService] ✅ [Shuffle队列] 当前队列总长度: ${queue.length}`);
        console.log('[AudioService] ✅ [Shuffle队列] 队列内容:');
        queue.forEach((track: any, index: number) => {
          console.log(`   [${index}] ${track.id}${index === 0 ? ' ← 当前播放' : ''}`);
        });
        console.log('═══════════════════════════════════════');
        console.log('[AudioService] 🎉 [Shuffle队列] 锁屏后将由原生层自动推进，无需JS参与！');
        
        // 标记已预加载
        this.shuffleQueuePreloaded = true;
        
        return true; // ✅ 成功
        
      } catch (error) {
        console.error('[AudioService] ❌ [Shuffle队列] 预加载失败:', error);
        this.shuffleQueuePreloaded = false;
        return false; // ❌ 失败
      }
    }
    
    /**
     * 【终极保底】启动漫游轮询定时器
     * 每2秒检查一次播放状态，如果播放结束则自动切换
     */
    private startRoamPolling() {
      if (this.roamCheckTimer) {
        console.log('[AudioService] ⏱️ [轮询] 定时器已在运行');
        return;
      }
      
      console.log('[AudioService] ⏱️ [轮询] 启动漫游检查定时器 (2秒间隔)');
      
      let highProgressStartTime: number | null = null;
      let lastPosition: number = 0;
      let hasPlayedPastHalf: boolean = false;
      
      this.roamCheckTimer = setInterval(async () => {
        if (this.isSwitchingScene || this.isFading) {
          return;
        }
        
        try {
          
          if (!sceneRoamManager.getIsRoaming()) {
            this.stopRoamPolling();
            return;
          }
          
          const state = await TrackPlayer.getState();
          
          if (state === State.Ended || state === 'ended' || state === 'Ended') {
            console.log('[AudioService] ⏱️ [轮询] 检测到播放结束状态，准备切换');
            
            if (this.currentBaseScene) {
              await this.executeRoamSwitch(sceneRoamManager);
            }
            return;
          }
          
          const shouldCheckProgress = (state === State.Playing || state === State.Paused) 
                                       && this.currentBaseScene;
          
          if (shouldCheckProgress) {
            try {
              const position = await TrackPlayer.getPosition();
              const duration = await TrackPlayer.getDuration();
              
              if (position > 0 && duration > 0) {
                const progressPercent = (position / duration) * 100;
                
                if (hasPlayedPastHalf && lastPosition > 10) {
                  const positionDrop = lastPosition - position;
                  
                  if (positionDrop > 10) {
                    console.log(`[AudioService] ⏱️ [循环检测] position回退${positionDrop.toFixed(1)}s，触发切换`);
                    
                    lastPosition = position;
                    hasPlayedPastHalf = false;
                    
                    await this.executeRoamSwitch(sceneRoamManager);
                    return;
                  }
                }
                
                if (progressPercent >= 50) {
                  hasPlayedPastHalf = true;
                }
                
                lastPosition = position;
                
                if (progressPercent >= 98) {
                  if (!highProgressStartTime) {
                    highProgressStartTime = Date.now();
                  } else if ((Date.now() - highProgressStartTime) > 5000) {
                    console.log(`[AudioService] ⏱️ [强制切换] 进度${progressPercent.toFixed(1)}%持续5秒+`);
                    
                    highProgressStartTime = null;
                    await this.executeRoamSwitch(sceneRoamManager);
                    return;
                  }
                } else {
                  highProgressStartTime = null;
                }
                
                if (state === State.Paused && progressPercent >= 95) {
                  console.log(`[AudioService] ⏱️ [超级兜底] paused + ${progressPercent.toFixed(1)}%，切换`);
                  
                  highProgressStartTime = null;
                  await this.executeRoamSwitch(sceneRoamManager);
                  return;
                }
              }
            } catch (e) {
              // 忽略获取进度失败
            }
          }
          
        } catch (e) {
          // 忽略轮询异常
        }
      }, 2000); // 每2秒检查一次
    }
    
    /**
     * 执行漫游切换的统一方法
     * 【方案 A - 自然随机性】添加 ±15% 随机偏移，模拟大自然非线性流转节奏
     */
    private async executeRoamSwitch(sceneRoamManager: any): Promise<void> {
      if (!this.currentBaseScene) return;
      
      this.isSwitchingScene = true;
      this.isFading = false;
      this.isActuallyPlaying = false;
      
      // 【方案 A - Natural Jitter】为每次漫游切换增加随机偏移
      // 基础延迟 500ms + 随机偏移 ±15% (0ms ~ 1000ms)
      // 模拟大自然非线性的流转节奏：潮汐、风、心跳等都不是严格周期性的
      const baseDelay = 500;
      const jitterRange = 500; // ±15% 的随机范围
      const jitter = Math.floor(Math.random() * jitterRange) - (jitterRange / 2);
      const naturalDelay = Math.max(0, baseDelay + jitter);
      
      console.log(`[AudioService] 🌿 [Natural Jitter] 漫游切换随机延迟: ${naturalDelay}ms (基础${baseDelay}ms + 偏移${jitter.toFixed(0)}ms)`);
      
      await new Promise(resolve => setTimeout(resolve, naturalDelay));
      
      const nextScene = sceneRoamManager.getNextRoamScene(this.currentBaseScene.id);
      
      if (nextScene) {
        console.log(`[AudioService] 🎲 [漫游切换] ${this.currentBaseScene.id} → ${nextScene.id}`);
        
        try {
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
          
          await this.switchSoundscape(nextScene);
        } catch (e) {
          console.error('[AudioService] [漫游切换] 失败:', e);
        }
      } else {
        console.warn('[AudioService] [漫游切换] 没有可用场景，停止漫游');
        sceneRoamManager.stopRoaming();
        this.stopRoamPolling();
      }
      
      this.isSwitchingScene = false;
      this.isFading = false;
    }
    
    /**
     * 停止漫游轮询定时器
     */
    private stopRoamPolling() {
      if (this.roamCheckTimer) {
        console.log('[AudioService] ⏱️ [轮询] 停止漫游检查定时器');
        clearInterval(this.roamCheckTimer);
        this.roamCheckTimer = null;
      }
      this.isSwitchingScene = false;
    }
    
    /**
     * 【核心功能】启动进度监听 - 80%预加载 + 提前切换
     * 在漫游模式下，实时监控播放进度
     * - 80%时：预加载下一个场景到队列（后台静默）
     * - 剩余2秒时：执行无缝切换（使用预加载数据）
     */
    private startProgressMonitor() {
      if (this.progressMonitorTimer) {
        console.log('[AudioService] 📊 [进度监听] 定时器已在运行');
        return;
      }
      
      console.log('[AudioService] 📊 [进度监听] 启动进度监听定时器 (500ms间隔)');
      console.log('[AudioService] 📊 [进度监听] 策略：80%预加载 + 剩余2秒无缝切换');
      
      // 重置所有标志
      this.hasTriggeredEarlyFade = false;
      this.preloadTriggered = false;
      this.isPreloaded = false;
      this.preloadedNextScene = null;
      this.preloadedTrack = null;
      
      // 【关键修复】记录启动时间，用于超时检测
      const startTime = Date.now();
      let lastProgressLog = 0;
      
      this.progressMonitorTimer = setInterval(async () => {
        // ════════════════════════════════════════
        // 【超时保护】如果运行超过60秒且没有成功切换，强制重置所有锁！
        // ════════════════════════════════════════
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        if (elapsedSeconds > 60 && (this.isFading || this.isSwitchingScene || this.hasTriggeredEarlyFade)) {
          console.warn(`[AudioService] ⚠️📊 [进度-超时] 运行${elapsedSeconds.toFixed(0)}秒未切换，强制重置所有锁！`);
          console.warn(`[AudioService] ⚠️📊 [进度-超时] 重置前: isFading=${this.isFading}, isSwitching=${this.isSwitchingScene}, hasTriggered=${this.hasTriggeredEarlyFade}`);
          
          // 强制重置所有锁
          this.isFading = false;
          this.isSwitchingScene = false;
          this.hasTriggeredEarlyFade = false;
          this.preloadTriggered = false;
          this.isPreloaded = false;
          
          console.warn(`[AudioService] ✅📊 [进度-超时] 重置完成: isFading=${this.isFading}, isSwitching=${this.isSwitchingScene}`);
        }
        
        // 防止重复切换或正在淡入淡出
        if (this.isSwitchingScene || this.isFading || this.hasTriggeredEarlyFade) {
          // 【诊断】打印为什么跳过
          if (Math.random() < 0.1) { // 只打印10%避免刷屏
            console.log(`[AudioService] 📊 [进度-跳过] isSwitching=${this.isSwitchingScene}, isFading=${this.isFading}, hasTriggered=${this.hasTriggeredEarlyFade}`);
          }
          return;
        }
        
        try {
          
          // 检查是否还在漫游模式
          if (!sceneRoamManager.getIsRoaming()) {
            this.stopProgressMonitor();
            return;
          }
          
          // 检查是否有正在播放的场景
          if (!this.currentBaseScene || !this.isActuallyPlaying) {
            return;
          }
          
          // 获取播放进度
          const position = await TrackPlayer.getPosition();
          const duration = await TrackPlayer.getDuration();
          
          // 验证数据有效性
          if (!position || !duration || duration <= 0 || position < 0) {
            return;
          }
          
          // 计算播放进度百分比
          const progressPercent = (position / duration) * 100;
          const remainingTime = (duration - position) * 1000;
          
          __DEV__ && console.log(
            `[AudioService] 📊 [进度] ${progressPercent.toFixed(1)}% | ${position.toFixed(1)}s/${duration.toFixed(1)}s | 剩余: ${(remainingTime/1000).toFixed(1)}s`
          );
          
          // ══════════════════════════════════════════
          // 【Phase 1】80% 时触发预加载！
          // ══════════════════════════════════════════
          if (!this.preloadTriggered && progressPercent >= 80 && progressPercent < 95) {
            console.log('═══════════════════════════════════════════════');
            console.log(`[AudioService] 🚀🚀🚀 [预加载] 播放进度达到 ${progressPercent.toFixed(1)}%！`);
            console.log('[AudioService] 🚀🚀🚀 开始后台预加载下一个场景...');
            console.log('═══════════════════════════════════════════════');
            
            this.preloadTriggered = true;
            await this.preloadNextScene(sceneRoamManager);
          }
          
          // ══════════════════════════════════════════
          // 【Phase 2】剩余2秒时触发无缝切换！
          // ══════════════════════════════════════════
          const EARLY_TRIGGER_MS = 2000; // 提前2秒触发
          
          if (remainingTime <= EARLY_TRIGGER_MS && remainingTime > 0) {
            console.log('═══════════════════════════════════════════════');
            console.log(`[AudioService] 🎯🎯🎯 [无缝切换] 检测到即将结束！`);
            console.log(`[AudioService] 🎯🎯🎯 剩余时间: ${(remainingTime/1000).toFixed(2)}s | 预加载状态: ${this.isPreloaded ? '✅就绪' : '⏳未完成'}`);
            console.log('═══════════════════════════════════════════════');
            
            // 标记已触发，防止重复执行
            this.hasTriggeredEarlyFade = true;
            
            // 执行无缝切换（使用预加载数据或即时加载）
            await this.seamlessSwitch(sceneRoamManager);
          }
          
          // 兜底：如果已经结束但没触发，也执行切换
          const state = await TrackPlayer.getState();
          if ((state === State.Ended || state === 'ended') && !this.hasTriggeredEarlyFade) {
            console.log('[AudioService] 📊 [兜底-Ended] 播放已结束，强制切换');
            this.hasTriggeredEarlyFade = true;
            await this.seamlessSwitch(sceneRoamManager);
          }
          
          // ════════════════════════════════════════
          // 【超级兜底】超过98%持续3秒，强制切换！（防止某些音频不触发Ended）
          // ════════════════════════════════════════
          if (progressPercent >= 98 && !this.hasTriggeredEarlyFade) {
            if (!this._highProgressStartTime) {
              this._highProgressStartTime = Date.now();
              console.log(`[AudioService] ⚠️📊 [超级兜底] 进度达到${progressPercent.toFixed(1)}%，开始计时...`);
            } else if ((Date.now() - this._highProgressStartTime) > 3000) {
              console.log('═══════════════════════════════════════════════');
              console.log(`[AudioService] 🚨🚨🚨 [超级兜底] 进度${progressPercent.toFixed(1)}%已持续3秒+，强制切换！`);
              console.log('(原因：播放器未正常触发Ended事件)');
              console.log('═══════════════════════════════════════════════');
              
              this.hasTriggeredEarlyFade = true;
              this._highProgressStartTime = null;
              await this.seamlessSwitch(sceneRoamManager);
            }
          } else {
            this._highProgressStartTime = null;
          }
          
        } catch (error) {
          // 忽略临时错误，不停止监听
          __DEV__ && console.warn('[AudioService] 📊 [进度监听] 检查异常:', error);
        }
      }, 500); // 每500ms检查一次（足够精确）
    }
    
    /**
     * 停止进度监听定时器
     */
    private stopProgressMonitor() {
      if (this.progressMonitorTimer) {
        console.log('[AudioService] 📊 [进度监听] 停止进度监听定时器');
        clearInterval(this.progressMonitorTimer);
        this.progressMonitorTimer = null;
      }
      // 重置所有状态
      this.hasTriggeredEarlyFade = false;
      this.preloadTriggered = false;
      this.isPreloaded = false;
      this.preloadedNextScene = null;
      this.preloadedTrack = null;
    }
    
    /**
     * 【双实例缓存】预加载下一个场景到队列（后台静默）
     * 在播放到80%时调用，提前准备好下一个Track
     */
    private async preloadNextScene(sceneRoamManager: any): Promise<void> {
      try {
        if (!this.currentBaseScene) {
          console.warn('[AudioService] ⚠️ [预加载] 无当前场景');
          return;
        }
        
        // 获取下一个随机场景
        const nextScene = sceneRoamManager.getNextRoamScene(this.currentBaseScene.id);
        
        if (!nextScene) {
          console.warn('[AudioService] ⚠️ [预加载] 无可用下一个场景');
          return;
        }
        
        console.log(`[AudioService] 🔮 [预加载] 目标场景: ${nextScene.id}`);
        
        // 构建Track对象（复用playScene的逻辑）
        const track = await this.buildTrackForScene(nextScene);
        
        if (!track) {
          console.error('[AudioService] ❌ [预加载] 构建Track失败');
          return;
        }
        
        // 缓存预加载结果
        this.preloadedNextScene = nextScene;
        this.preloadedTrack = track;
        this.isPreloaded = true;
        
        console.log('═══════════════════════════════════════════════');
        console.log('[AudioService] ✅✅✅ [预加载-内存缓存] 完成！');
        console.log(`[AudioService] ✅ 场景: ${nextScene.id} (${nextScene.title})`);
        console.log(`[AudioService] ✅ URL: ${(track.url as string)?.substring(0, 50)}...`);
        
        // ══════════════════════════════════════════
        // 【🔑 核心优化】将下一首添加到 TrackPlayer 原生队列！
        // 这样即使锁屏后 JS 线程挂起，原生层也能自动推进到下一首
        // ══════════════════════════════════════════
        try {
          const queue = await TrackPlayer.getQueue();
          
          if (queue.length <= 1) {
            console.log('[AudioService] 🎯 [预加载-队列] 当前队列长度:', queue.length);
            console.log('[AudioService] 🎯 [预加载-队列] 正在添加下一首到原生队列...');
            
            await TrackPlayer.add(track);
            
            const newQueue = await TrackPlayer.getQueue();
            console.log(`[AudioService] ✅✅✅ [预加载-队列成功] 已添加到队列！新队列长度: ${newQueue.length}`);
            console.log('[AudioService] ✅ [预加载-队列] 锁屏后将由原生层自动推进到下一首！');
          } else {
            console.log('[AudioService] ℹ️ [预加载-队列跳过] 队列已有待播放曲目，跳过重复添加');
          }
        } catch (queueError) {
          console.warn('[AudioService] ⚠️ [预加载-队列失败] 添加到队列失败（不影响内存缓存）:', queueError);
        }
        
        console.log('═══════════════════════════════════════════════');
        
      } catch (error) {
        console.error('[AudioService] ❌ [预加载] 失败:', error);
        this.isPreloaded = false;
      }
    }
    
    /**
     * 构建场景的Track对象（从playScene提取）
     */
    private async buildTrackForScene(scene: Scene): Promise<Track | null> {
      try {
        const effectiveCategory = scene.id.startsWith('manual_') ? 'nature' : scene.category;
        const localPath = getLocalPath(effectiveCategory, scene.filename);
        
        let url: string | null = null;
        
        if (localPath) {
          const fileExists = await RNFS.exists(localPath.replace('file://', ''));
          if (fileExists) {
            url = localPath;
          }
        }
        
        if (!url) {
          const downloadUrls = getDownloadUrl(scene.id);
          if (downloadUrls && downloadUrls.length > 0 && downloadUrls[0]) {
            url = downloadUrls[0];
          }
        }
        
        if (!url) {
          console.warn(`[AudioService] ⚠️ [buildTrack] 无可用音频源: ${scene.id}`);
          return null;
        }
        
        const i18n = await import('../i18n');
        const t = i18n.default.t;
        const translatedTitle = t(`scenes.${scene.id}.title`, { defaultValue: scene.title });
        const translatedArtist = t('common.artist', { defaultValue: 'SoundTherapy Pro' });
        
        const track: Track = {
          id: scene.id,
          url: url,
          title: translatedTitle,
          artist: translatedArtist,
          duration: scene.duration ?? 0,
        };
        
        return track;
        
      } catch (error) {
        console.error('[AudioService] ❌ buildTrackForScene 失败:', error);
        return null;
      }
    }
    
    /**
     * 【稳定版】无缝切换 - 使用预加载 + reset（稳定可靠）
     * 核心策略：
     * 1. 80%时预加载Track对象到内存（节省切换时的构建时间）
     * 2. 切换时使用reset()清空播放器（100%稳定，无队列混乱风险）
     * 3. 利用预加载数据加速reset后的恢复速度
     */
    private async seamlessSwitch(sceneRoamManager: any): Promise<void> {
      if (this.isSwitchingScene || this.isFading) {
        console.warn('[AudioService] ⚠️ [无缝切换] 正在切换中，跳过');
        return;
      }
      
      if (!this.currentBaseScene) {
        console.warn('[AudioService] ⚠️ [无缝切换] 无当前场景');
        return;
      }
      
      // ═══════════════════════════════════════════════════
      // 【🔥🔥🔥 v7 预判信号前置】在任何操作之前立即发送！
      // 目标：音频还没动，UI 先焊死！
      // ═══════════════════════════════════════════════════
      try {
        const { DeviceEventEmitter: Emitter } = require('react-native');
        
        let nextSceneId: string = '';
        
        if (this.isPreloaded && this.preloadedNextScene) {
          nextSceneId = (this.preloadedNextScene.id || '').trim();
        } else {
          const sceneModule = await import('./SceneRoamManager');
          const roamMgr = sceneModule.default || sceneModule.sceneRoamManager;
          const tempNextScene = roamMgr.getNextRoamScene(this.currentBaseScene?.id || '');
          nextSceneId = (tempNextScene?.id || '').trim();
        }
        
        if (nextSceneId) {
          console.log(`[AudioService] 📡📡📡 [v7 预判信号] 即将切换到: ${nextSceneId}（音频还没动！）`);
          Emitter.emit('sceneSwitchStart', { 
            nextSceneId, 
            source: 'seamlessSwitch-v7' 
          });
        } else {
          console.warn('[AudioService] ⚠️ [v7 预判信号] 无法获取 nextSceneId');
        }
      } catch (emitError) {
        console.warn('[AudioService] ⚠️ [v7 预判信号] 发送失败:', emitError?.message);
      }
      
      this.isSwitchingScene = true;
      
      try {
        // ═══════════════════════════════════════════════════
        // 【决策点】使用预加载还是即时构建？
        // ═══════════════════════════════════════════════════
        
        let nextScene: Scene;
        let nextTrack: Track | null = null;
        
        if (this.isPreloaded && this.preloadedNextScene && this.preloadedTrack) {
          // ✅ 使用预加载数据（最佳路径 - 已在80%时准备好）
          console.log('[AudioService] 🚀 [无缝切换] 使用预加载数据！');
          nextScene = this.preloadedNextScene;
          nextTrack = this.preloadedTrack;
          console.log(`[AudioService] 🚀 [无缝切换] 预加载场景: ${nextScene.id}`);
        } else {
          // ⏳ 即时构建（备用路径 - 如果80%预加载没来得及完成）
          console.log('[AudioService] ⏳ [无缝切换] 预加载未完成，即时构建...');
          nextScene = sceneRoamManager.getNextRoamScene(this.currentBaseScene.id);
          
          if (!nextScene) {
            console.warn('[AudioService] ⚠️ [无缝切换] 无可用下一个场景，停止漫游');
            sceneRoamManager.stopRoaming();
            this.stopProgressMonitor();
            this.stopRoamPolling();
            return;
          }
          
          // 即时构建Track（会比预加载慢一点，但仍然可用）
          nextTrack = await this.buildTrackForScene(nextScene);
          if (!nextTrack) {
            throw new Error('构建Track失败');
          }
        }
        
        console.log(`[AudioService] 🎬✨ [无缝切换] 开始！${this.currentBaseScene.id} → ${nextScene.id}`);
        console.log('[AudioService] 🎬✨ 策略：淡出(1.5s) → reset → 加载预缓存 → 淡入(1.5s)');
        
        // ═══════════════════════════════════════════════════
        // 【Phase 1】淡出旧音频（1500ms）
        // ═══════════════════════════════════════════════════
        
        console.log('[AudioService] 🔽 [Phase 1/3] 开始淡出旧音 (1500ms)...');
        await this.fadeOutVolume(1500);
        console.log('[AudioService] ✅ [Phase 1/3] 旧音淡出完成');
        
        // ═══════════════════════════════════════════════════
        // 【Phase 2】reset + 使用预加载数据快速恢复
        // ═══════════════════════════════════════════════════
        
        console.log('[AudioService] 🛑 [Phase 2/3] reset 播放器 + 加载新场景...');
        
        // 完全重置播放器（确保干净的状态）
        await TrackPlayer.reset();
        this.isActuallyPlaying = false;
        
        // 更新场景信息
        this.currentBaseScene = nextScene;
        this.notifyListeners();
        
        // ══════════════════════════════════════════
        // 【🚨 关键修复】RepeatMode 智能设置
        // 漫游模式 → 保持默认（支持队列自动推进）✅
        // 非漫游模式 → Off（防止循环）
        // ══════════════════════════════════════════
        if (sceneRoamManager.getIsRoaming()) {
          console.log('[AudioService] [seamlessSwitch] 漫游模式，保持默认RepeatMode');
        } else {
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
          console.log('[AudioService] [seamlessSwitch] 非漫游模式，RepeatMode=Off');
        }
        
        // 使用预构建好的Track直接添加（比playScene快，因为省去了构建时间）
        console.log('[AudioService] 📥 [Phase 2/3] 使用预缓存Track加载...');
        await TrackPlayer.add([nextTrack]);
        
        // seekTo(0.15) 跳过开头
        await TrackPlayer.seekTo(0.15);
        
        // 设置volume=0（静音状态开始播放）
        await TrackPlayer.setVolume(0);
        
        // 开始播放
        await TrackPlayer.play();
        console.log('[AudioService] ▶️ [Phase 2/3] 新音轨开始播放（静音）');
        
        // 初始化均衡器
        await this.initEqualizerIfNeeded();
        
        // ═══════════════════════════════════════════════════
        // 【Phase 3】淡入新音频（1500ms）- 平滑出现！
        // ═══════════════════════════════════════════════════
        
        console.log('[AudioService] 🔼 [Phase 3/3] 淡入新音 (1500ms)...');
        await this.fadeInVolume(1500);
        console.log('[AudioService] ✅ [Phase 3/3] 新音淡入完成');
        
        // 更新最终状态
        this.isActuallyPlaying = true;
        
        console.log('═══════════════════════════════════════════════');
        console.log('[AudioService] ✅✅✅ [无缝切换] 完成！');
        console.log(`[AudioService] ✅ 当前场景: ${nextScene.id}`);
        console.log(`[AudioService] ✅ 上一个场景: ${this.currentBaseScene?.id === nextScene.id ? '相同（异常！）' : '不同（正确）'}`);
        console.log('[AudioService] ✅ 切换时长: ~3秒 (淡出1.5s + reset+加载~0s + 淡入1.5s)');
        console.log('═══════════════════════════════════════════════');
        
        // ═══════════════════════════════════════════════════
        // 【关键修复】无缝切换完成后，重新启动进度监听！
        // ═══════════════════════════════════════════════════
        
        try {
          
          if (sceneRoamManager.getIsRoaming()) {
            console.log('[AudioService] 🔄 [无缝切换] 漫游仍在进行，重新启动进度监听...');
            
            // 先停止旧的（确保干净）
            this.stopProgressMonitor();
            
            // 延迟一小段时间再启动（确保播放器状态稳定）
            setTimeout(() => {
              this.startProgressMonitor();
              console.log('[AudioService] 🔄 [无缝切换] 进度监听已重启！');
            }, 500);
          }
        } catch (e) {
          console.warn('[AudioService] ⚠️ [无缝切换] 重启监听失败:', e);
        }
        
      } catch (error) {
        console.error('[AudioService] ❌ [无缝切换] 失败:', error);
        
        // 回滚机制：尝试恢复播放
        this.isFading = false;
        
        if (this.currentBaseScene) {
          try {
            console.log('[AudioService] 🔄 [回滚] 尝试恢复当前场景...');
            await this.playScene(this.currentBaseScene);
            await this.fadeInVolume(1500); // 响应优先：使用 1500ms
            console.log('[AudioService] ✅ [回滚] 恢复成功');
          } catch (e) {
            console.error('[AudioService] ❌ [回滚] 也失败了:', e);
          }
        }
      } finally {
        // 重置所有标志位（包括isFading锁！）
        this.isSwitchingScene = false;
        this.isFading = false;
        this.hasTriggeredEarlyFade = false;
        this.preloadTriggered = false;
        this.isPreloaded = false;
        this.preloadedNextScene = null;
        this.preloadedTrack = null;
      }
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

    console.log(`[AudioService] 🎬 [playScene] 开始！目标: ${scene.id}`);
    
    // 【性能优化】取消播放状态锁，允许指令覆盖
    if (isProcessing) {
      // 不返回，继续执行新请求
    }
    
    // 【性能优化】标记开始处理，但允许覆盖
    isProcessing = true;
    
    // 【🔑 修复 #1】保存前一个场景 ID，用于后续停止逻辑判断
    // 必须在 this.currentBaseScene 被修改之前保存
    const prevSceneId = this.currentBaseScene?.id;

    try {
      // ══════════════════════════════════════════
      // 【🔁 Loop 实验】根据漫游状态智能设置 RepeatMode：
      //   - 非漫游（单场景）→ RepeatMode.Off（默认不循环，用户手动激活）
      //   - 漫游模式 → 保持默认（允许原生队列自动推进）✅
      //   - 用户点击循环按钮 → applyLoopMode() 设为 Track
      // ══════════════════════════════════════════
      try {
        const isRoaming = sceneRoamManager.getIsRoaming();
        if (!isRoaming) {
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
          console.log(`[AudioService] [playScene] RepeatMode=Off (非漫游模式)`);
        } else {
          console.log(`[AudioService] [playScene] 漫游模式，保持默认RepeatMode（支持队列自动推进）`);
        }
      } catch (e) {
        console.warn('[AudioService] ⚠️ [playScene] 设置RepeatMode失败:', e);
      }
      
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

    // 【老唱片店】场景切换前停止录音机场景音频层
    // 【🔑 修复 #1】使用 prevSceneId 而非 this.currentBaseScene?.id，
    // 因为 currentBaseScene 已在上面被设置为目标场景，导致停止逻辑失效
    if (prevSceneId === 'life_record_shop') {
      console.log('[AudioService] 🛑 停止老唱片店场景音频层（vinyl crackle + 随机 SFX）');
      await recordShopAudioManager.stop();
      // 【🔑 修复 #2】离开 life_record_shop 时重置自动识别标志
      this.resetAutoEnvironmentDetection();
    }

    await this.stopAllAmbient();

      const shouldTriggerLoading = options?.triggerLoading !== false;
      if (shouldTriggerLoading) {
        this.loadingSceneId = scene.id;
        this.notifyLoading(true, scene.id);
        this.startLoadingTimeout(scene.id);
      }

      // 【强制纠正 Category】确保 manual_ 新场景能正确找到复用文件
      const effectiveCategory = scene.id.startsWith('manual_') ? 'nature' : scene.category;
      // 【关键修复】使用完整 filename（包含 base/ 等目录前缀），不要剥离
      const localPath = getLocalPath(effectiveCategory, scene.filename);
      
      console.log(`[AudioService] 🎵 Attempting to play: ${scene.id}`);
      console.log(`[AudioService] 📂 effectiveCategory: ${effectiveCategory}, filename: ${scene.filename}`);
      console.log(`[AudioService] CHECK_FILE_EXISTS: ${localPath.replace('file://', '')}`);
      
      if (!localPath || typeof localPath !== 'string') {
        console.error('[AudioService] ❌ 本地路径无效:', scene.id, localPath);
      }
      
      const isLocal = await RNFS.exists(localPath.replace('file://', ''));
      console.log(`[AudioService]  本地文件存在: ${isLocal}`);
      
      // 【静默模式兜底】文件不存在时，提示用户资源正在加载
      if (!isLocal) {
        console.warn(`[AudioService] ⚠️ 文件不存在: ${scene.filename}，资源可能还在下载中...`);
        
        // 触发"资源加载中"状态通知
        this.notifyResourceLoading(scene.id);
        
        // 不立即返回，尝试使用远程 URL（如果有网络）
        // 这样即使本地没有，也能从网络播放（降级方案）
      }
      
      const isOffline = false;
      
      let uri: string | null = null;
      if (isLocal) {
        uri = localPath;
        console.log(`[AudioService] ✅ 使用本地文件: ${uri}`);
      } else {
        const downloadUrls = getDownloadUrl(scene.id);
        if (!downloadUrls || downloadUrls.length === 0 || !downloadUrls[0]) {
          console.error('[AudioService] ❌ 远程 URL 无效:', scene.id);
        } else {
          uri = downloadUrls[0];
          console.log(`[AudioService] 本地文件不存在，使用远程 URL: ${uri}`);
        }
      }

      if (!uri) {
        console.error('[AudioService] ❌ 无可用音频源:', scene.id);
        return;
      }

      await this.setupPlayer();
      
      // ══════════════════════════════════════════
      // 【🔑🔑🔑 核心修复】漫游模式下保护预加载队列！
      // 问题：reset() + removeUpcomingTracks() 会清空 preloadNextScene() 添加的下一首
      // 方案：漫游模式 + 队列有下一首 → 跳过清空操作
      // ══════════════════════════════════════════
      const isRoaming = sceneRoamManager.getIsRoaming();
      let shouldPreserveQueue = false;
      
      if (isRoaming) {
        try {
          const queue = await TrackPlayer.getQueue();
          const currentTrack = await TrackPlayer.getCurrentTrack();
          
          console.log(`[AudioService] 🛡️ [playScene-队列检查] 漫游模式，当前队列长度: ${queue.length}, 当前索引: ${currentTrack}`);
          
          if (queue.length > 1 && currentTrack !== null && currentTrack < queue.length - 1) {
            shouldPreserveQueue = true;
            console.log('[AudioService] ✅ [playScene-队列保护] 检测到预加载的下一首，跳过 reset/removeUpcomingTracks！');
            console.log(`[AudioService] ✅ [playScene-队列保护] 保护队列: ${queue.map(t => t.id).join(' → ')}`);
          } else {
            console.log('[AudioService] ⚠️ [playScene-队列检查] 队列无待播放曲目或只有一首，正常清空');
          }
        } catch (checkError) {
          console.warn('[AudioService] ⚠️ [playScene-队列检查失败]:', checkError);
        }
      }
      
      if (!shouldPreserveQueue) {
        await TrackPlayer.reset();
        await TrackPlayer.removeUpcomingTracks();
        __DEV__ && console.log('[AudioService] [playScene] 执行 reset + removeUpcomingTracks');
      }

      // 【关键修复】本地文件直接使用原始路径，不要经过 getValidUrl 二次处理
      let finalUri: string;
      if (isLocal) {
        // Android ExoPlayer 不支持 file:/// 协议，直接使用原始路径
        finalUri = uri.replace('file://', '').replace('file:///', '');
        console.log(`[AudioService] ===== 本地路径处理 =====`);
        console.log(`[AudioService] 原始 uri: ${uri}`);
        console.log(`[AudioService] 移除 file:// 前缀后: ${finalUri}`);
        console.log(`[AudioService] Platform.OS: ${Platform.OS}`);
        
        // 【新增】验证文件是否真实存在
        const cleanPath = finalUri.replace('file://', '').replace('file:///', '');
        const fileExists = await RNFS.exists(cleanPath);
        console.log(`[AudioService] 文件存在性检查: ${cleanPath}`);
        console.log(`[AudioService] 文件是否存在: ${fileExists}`);
        
        if (!fileExists) {
          console.error(`[AudioService] ❌ 警告：文件不存在！路径: ${cleanPath}`);
        }
      } else {
        finalUri = getValidUrl(uri);
      }
      
      console.log(`[AudioService] 尝试播放：${scene.id}, 路径：${finalUri}`);
      console.log(`[AudioService] FINAL_AUDIO_PATH: ${finalUri}`);

      const translatedTitle = i18n.t(`scenes.${scene.id}.title`);
      const translatedArtist = i18n.t('appTitle');

      const track: any = {
        id: scene.id,
        url: finalUri,
        title: translatedTitle,
        artist: translatedArtist,
        isLocalUri: isLocal,
      };

      console.log('[AudioService] ====== 调用 TrackPlayer.add ======');
      console.log('[AudioService] track 完整 JSON:', JSON.stringify(track, null, 2));
      
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

      // 【老唱片店】如果**目标**场景是老唱片店，启动录像机场景音频层
      if (scene.id === 'life_record_shop' && this._isReady) {
        console.log('[AudioService] 🎵 启动老唱片店场景音频层（vinyl crackle + 随机 SFX）');
        // 设置 TrackPlayer 雨声层音量
        const rainVol = recordShopAudioManager.getLayerVolume('rain');
        await TrackPlayer.setVolume(rainVol);
        // 【🔑 修复 #2】进入 life_record_shop 时禁用自动识别
        // 防止 NoiseCancellationExperiment 屏幕意外激活自动场景识别
        this.disableAutoEnvironmentDetection();
        await recordShopAudioManager.start();
      }
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
      
      // 【全局拦截】播放完成后强制确保漫游模式下 RepeatMode 为 Off
      await this.forceRepeatModeOffForRoaming();
      
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
    
    try {
      await TrackPlayer.pause();
    } catch (e) {
      console.error('[AudioService] ❌ TrackPlayer.pause() 失败:', e);
      // 【关键】即使失败也要通知 UI 更新状态！防止列表页显示不同步
    }
    
    // ✅ 无论成功失败都通知监听器，确保 Context 状态同步
    this.notifyListeners();
    console.log('[AudioService] ✅ pause() 完成，已通知所有监听器 (isActuallyPlaying=false)');
  }

  async play() {
    // 【关键修复】如果未初始化，自动等待初始化完成
    if (!this._isReady) {
      console.log('[AudioService] ⏳ 初始化未完成，等待初始化...');
      try {
        await this.setupPlayer();
        // 等待初始化完全完成
        let waitCount = 0;
        while (!this._isReady && waitCount < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        if (!this._isReady) {
          console.warn('[AudioService] ⚠️ 初始化超时，跳过 play');
          return;
        }
        console.log('[AudioService] ✅ 初始化完成，继续播放');
      } catch (e) {
        console.error('[AudioService] ❌ 初始化失败，无法播放:', e);
        return;
      }
    }
    
    // 【关键修复】在 TrackPlayer.play() 之前先更新状态
    this.isActuallyPlaying = true;
    
    try {
      // 【🔁 Loop 实验】默认 Off，用户手动激活循环
      // 【检测 Ended 状态】避免Ended后直接play()无效
      try {
        const currentState = await TrackPlayer.getPlaybackState();
        if (currentState.state === State.Ended) {
          console.log('[AudioService] [play] 检测到 Ended 状态，先 seekTo(0) 再播放');
          await TrackPlayer.seekTo(0);
        }
      } catch (e) {
        console.warn('[AudioService] [play] 检查播放状态失败:', e);
      }

      await TrackPlayer.setRepeatMode(RepeatMode.Off);
      console.log('[AudioService] [play] RepeatMode=Off (用户需手动激活循环)');
      
      await TrackPlayer.play();
    } catch (e) {
      console.error('[AudioService] ❌ TrackPlayer.play() 失败:', e);
      // 【关键】即使失败也要通知 UI 更新状态！
      this.isActuallyPlaying = false; // 回滚状态
    }
    
    // ✅ 无论成功失败都通知监听器，确保 Context 状态同步
    this.notifyListeners();
    console.log('[AudioService] ✅ play() 完成，已通知所有监听器 (isActuallyPlaying=', this.isActuallyPlaying, ')');
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

    await recordShopAudioManager.stop();
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

  /**
   * 【老唱片店】设置录音机场景各层音量
   * rain 层控制 TrackPlayer 音量，vinyl/sfx 层控制 SFXPlayer 音量
   */
  async setRecordShopLayerVolume(layer: RecordShopLayer, volume: number): Promise<void> {
    recordShopAudioManager.setLayerVolume(layer, volume);

    if (layer === 'rain' && this._isReady) {
      await TrackPlayer.setVolume(volume);
    }
  }

  /**
   * 【老唱片店】获取录音机场景各层音量
   */
  getRecordShopVolumes(): RecordShopVolumes {
    return recordShopAudioManager.getVolumes();
  }

  disableAutoEnvironmentDetection() {
    this.skipAutoEnvironmentDetection = true;
    console.log('[AudioService] ✅ 自动环境识别已禁用 (life_record_shop)');
  }

  getSkipAutoEnvironmentDetection(): boolean {
    return this.skipAutoEnvironmentDetection;
  }

  resetAutoEnvironmentDetection() {
    this.skipAutoEnvironmentDetection = false;
    console.log('[AudioService] 🔄 自动环境识别标志已重置');
  }

// --- 监听器管理 ---
addListener(l: () => void) {
  this.listeners.add(l);
  // 【关键修复】返回取消订阅函数，让 useSyncExternalStore 可以正确清理
  return () => { this.listeners.delete(l); };
}
removeListener(l: () => void) { this.listeners.delete(l); }

/**
 * 场景级状态变更监听（替代 DeviceEventEmitter）
 *
[Showing lines 1-37 of 52 total. Use start_line=38 to continue reading.]


				# TODO LIST UPDATE REQUIRED - You MUST include the task_progress parameter in your NEXT tool call.

**Current Progress: 4/4 items completed (100%)**

- [x] 用 codebase-memory MCP 查询三个 bug 的已有记录和文件调用关系
- [x] 结合 git diff/log 分析修复原因
- [x] 分析 DownloaderService 事件广播链路问题
- [x] 给出结论：真正修复 vs 偶然未复现 + 优化建议

Note: This list was your last task_progress input. It may be outdated or inaccurate now. Check before proceeding — if the work is truly done, use attempt_completion to present results. Do NOT call it based on stale list state; verify first.

ASSUMPTION: The numbers in this list (e.g., "2 of 3") are your best estimate, not verified facts. If you're uncertain about completion status, ASK the user before marking items complete.

				

**You have completed all tasks you set out to do. Do NOT re-run the full workflow.** Before using `attempt_completion`, verify the result is correct using whatever tools are appropriate for the task type — this may include running CLI commands (e.g., `ls`, `grep`, `pytest`) to check outputs, or manual inspection. Only use `attempt_completion` when you are confident the work is done correctly.

				
<system-reminder>
The tool call you made did not produce any output yet. The system is waiting for it to complete — please keep monitoring until results come back. Do NOT re-issue the same call unless it failed.
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

  // 【静默模式兜底】资源加载状态监听器注册
  addResourceLoadingListener(l: (state: { sceneId: string; loading: boolean; message: string }) => void) {
    this.resourceLoadingListeners.add(l);
    return () => { this.resourceLoadingListeners.delete(l); };
  }

  /**
   * 【🔥 v1.4.1】公开方法，供 PlaybackService 调用（播放状态同步）
   */
  public notifyListeners() {
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
    
    // 【🔥🔥🔥 关键修复】发射全局事件，强制所有 UI 组件刷新状态
    DeviceEventEmitter.emit('audioStateChanged', {
      isActuallyPlaying: this.isActuallyPlaying,
      currentBaseSceneId: this.currentBaseScene?.id || null,
      timestamp: Date.now(),
    });
    console.log(`[AudioService] 📡 [DeviceEventEmitter] 已发射 audioStateChanged 事件: isPlaying=${this.isActuallyPlaying}, sceneId=${this.currentBaseScene?.id}`);
    
    // 【性能监控】检查是否在100ms内完成
    const notifyTime = Date.now() - notifyStartTime;
    if (notifyTime > 50) { // 预留50ms给UI更新
      console.warn(`[Performance] ⚠️ notifyListeners 耗时过长: ${notifyTime}ms`);
    }
  }

  /**
   * 🔥【真实状态心跳】强制向 UI 推送最新的播放状态
   * 
   * 使用场景：
   * - Fade 逻辑结束（成功/失败/中断）
   * - 音频自然结束（Ended）
   * - 发生错误需要重置状态
   * - 任何可能导致 UI 状态与实际不一致的时刻
   */
  forceUpdateUIStatus(): void {
    console.log('═══════════════════════════════════════');
    console.log('[AudioService] 🔄 [forceUpdateUIStatus] 强制同步真实状态到 UI');
    console.log(`[AudioService] 📊 当前状态: isActuallyPlaying=${this.isActuallyPlaying}, isFading=${this.isFading}, isSwitchingScene=${this.isSwitchingScene}`);
    console.log(`[AudioService] 📊 场景信息: currentBaseScene=${this.currentBaseScene?.id || 'null'}`);
    
    // 【🔥 关键】确保所有锁都被释放
    if (this.isFading) {
      console.warn('[AudioService] ⚠️ [forceUpdateUIStatus] 检测到 isFading=true，强制释放！');
      this.isFading = false;
    }
    
    if (this.isSwitchingScene) {
      console.warn('[AudioService] ⚠️ [forceUpdateUIStatus] 检测到 isSwitchingScene=true，强制释放！');
      this.isSwitchingScene = false;
    }
    
    // 【🔥 关键】从 TrackPlayer 获取真实播放状态（而非依赖内存变量）
    this.syncRealPlaybackState()
      .then(() => {
        console.log('[AudioService] ✅ [forceUpdateUIStatus] 状态已同步，通知 UI');
        this.notifyListeners();
        console.log('═══════════════════════════════════════');
      })
      .catch((e) => {
        console.error('[AudioService] ❌ [forceUpdateUIStatus] 同步失败:', e);
        // 即使失败也要用当前内存状态通知 UI
        this.notifyListeners();
      });
  }

  /**
   * 从 TrackPlayer 获取真实播放状态并同步到 isActuallyPlaying
   */
  private async syncRealPlaybackState(): Promise<void> {
    try {
      if (!this._isReady) {
        console.log('[AudioService] ⏳ [syncRealPlaybackState] AudioService 未准备好');
        return;
      }
      
      const state = await TrackPlayer.getState();
      const realIsPlaying = state === State.Playing;
      
      if (this.isActuallyPlaying !== realIsPlaying) {
        console.warn(`[AudioService] ⚠️ [syncRealPlaybackState] 状态不一致！内存=${this.isActuallyPlaying}, 真实=${realIsPlaying}`);
        this.isActuallyPlaying = realIsPlaying;
      } else {
        console.log(`[AudioService] ✅ [syncRealPlaybackState] 状态一致: ${realIsPlaying}`);
      }
    } catch (e) {
      console.error('[AudioService] ❌ [syncRealPlaybackState] 获取状态失败:', e);
    }
  }

  private notifyLoading(loading: boolean, id: string | null) {
    this.loadingListeners.forEach(l => l({ id, loading }));
  }

  // 【静默模式兜底】资源加载中状态通知
  private notifyResourceLoading(sceneId: string) {
    console.log(`[AudioService] 📢 通知UI：资源正在加载 - ${sceneId}`);
    this.resourceLoadingListeners?.forEach(l => l({ sceneId, loading: true, message: '冥想资源加载中...' }));
  }

  // 【静默模式兜底】资源加载完成通知
  private notifyResourceReady(sceneId: string) {
    this.resourceLoadingListeners?.forEach(l => l({ sceneId, loading: false, message: '' }));
  }

  private notifySmallScenes() {
    const ids = Array.from(this.activeSmallScenes);
    console.log('[AudioService] 📡 notifySmallScenes 通知监听器:', ids);
    
    // 【R8 修复】同时触发静态回调，确保外部订阅者也能收到通知
    for (const cb of _smallScenesCallbacks) {
      try { cb(ids); } catch (e) { console.error('[AudioService] smallScenes callback error:', e); }
    }
    
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
    // 【Hermes Release 修复】用公开方法 this.isReady() 代替 (this as any)._isReady
    // Hermes + R8 混淆了私有属性 _isReady，导致返回 undefined
    if (!this.isReady()) {
      console.log('[AudioService] [toggleAmbience] isReady=false，尝试触发初始化...');
      try {
        await this.setupPlayer();
      } catch (e: any) {
        console.error('[AudioService] [toggleAmbience] setupPlayer 失败:', e?.message);
      }
      if (!this.isReady()) {
        console.warn('[AudioService] [toggleAmbience] 初始化仍未完成，跳过');
        return;
      }
    }
    
    console.log('[AudioService] [toggleAmbience] isReady=true，开始播放:', scene.id);
    
    try {
      if (targetState) {
        console.log('[AudioService] 🔍 [toggleAmbience] 调用 playAmbient:', scene.id);
        await this.playAmbient(scene.id);
      } else {
        const soundId = `small_${scene.id}`;
        this.sfxPlayer.stop(soundId);
        console.log('[AudioService] ✅ 交互音已停止:', scene.id);
        
        this.activeSmallScenes.delete(scene.id);
        this.notifySmallScenes();
      }
    } catch (error: any) {
      console.error('[AudioService] ❌ toggleAmbience 失败:', error);
      console.error('[AudioService] ❌ 错误消息:', error?.message);
      console.error('[AudioService] ❌ 错误堆栈:', error?.stack);
      throw error;
    }
  }

  /**
   * 【UI激活状态同步修复】只停止交互音SFX，不清空activeSmallScenes集合。
   *
   * 用途：ImmersivePlayer组件卸载cleanup时调用，防止useEffect依赖变化
   * 意外清空用户正在使用的interactive按钮UI状态。
   *
   * 与 stopAllAmbient() 的区别：
   * - stopAllAmbient(): 停止SFX + 清空activeSmallScenes + notifySmallScenes（全量重置）
   * - stopAllAmbientOnly(): 仅停止SFX播放，保留activeSmallScenes集合和UI状态
   */
  async stopAllAmbientOnly(): Promise<void> {
    if (!this._isReady) {
      console.warn('[AudioService] ⚠️ 初始化未完成，跳过 stopAllAmbientOnly');
      return;
    }

    __DEV__ && console.log('[AudioService] 🛑 停止所有交互音SFX（保留activeSmallScenes）');

    try {
      this.sfxPlayer.stopAll();
      __DEV__ && console.log('[AudioService] ✅ SFXPlayer 已停止所有交互音');
      // 注意：不清空 activeSmallScenes，不通知监听器
      __DEV__ && console.log('[AudioService] ✅ stopAllAmbientOnly 完成（UI状态保持不变）');
    } catch (error: any) {
      console.error('[AudioService] ❌ stopAllAmbientOnly 失败:', error);
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

  /**
   * 【方案 A - 等功率淡出 v3.0】Equal Power Fade Out
   * 
   * 核心改进：
   * - 使用 sin((1-progress) × π/2) 曲线（而非线性）
   * - 与 fadeIn 配合实现能量守恒：sin²θ + cos²θ = 1
   * - 消除听感上的"凹陷感"
   * 
   * @param duration 淡出时长（毫秒），默认 1500ms (1.5秒-细腻优先)
   */
  private async fadeOutVolume(duration: number = 1500): Promise<void> {
    if (!this._isReady || this.isFading) return;
    
    const currentVolume = this.ambientVolume;
    this.isFading = true;
    this.fadeStartTime = Date.now();
    console.log(`[AudioService] 🎵 [等功率淡出v3.0] 开始，时长: ${duration}ms, 当前音量: ${currentVolume}`);
    
    try {
      const { lfoService } = await import('./LFOService');
      
      const { fadeOut } = lfoService.createEqualPowerCrossfade({
        maxVolume: currentVolume,
        duration: duration,
        steps: 50,
      });
      
      for (let i = 1; i < fadeOut.volumes.length; i++) {
        if (!this.isFading) {
          console.log('[AudioService] ⚡ [等功率淡出v3.0] 被外部中断，执行平滑恢复');
          await this.smoothRecoverVolume(currentVolume);
          return;
        }
        
        const elapsed = Date.now() - this.fadeStartTime;
        if (elapsed > duration + 1000) {
          console.warn('[AudioService] ⚠️ [等功率淡出v3.0] 超时保护触发');
          break;
        }
        
        await TrackPlayer.setVolume(fadeOut.volumes[i]);
        
        if (i < fadeOut.volumes.length - 1 && this.isFading) {
          await new Promise(resolve => setTimeout(resolve, fadeOut.stepDuration));
        }
      }
      
      console.log(`[AudioService] ✅ [等功率淡出v3.0] 完成，耗时: ${Date.now() - this.fadeStartTime}ms`);
    } catch (error) {
      console.error('[AudioService] ❌ [等功率淡出v3.0] 异常:', error);
    } finally {
      this.isFading = false;
    }
  }

  /**
   * 【方案 A - 等功率淡入 v3.0】Equal Power Fade In
   * 
   * @param duration 淡入时长（毫秒），默认 1500ms
   */
  private async fadeInVolume(duration: number = 1500): Promise<void> {
    if (!this._isReady) return;
    
    const targetVolume = this.ambientVolume;
    this.isFading = true;
    this.fadeStartTime = Date.now();
    console.log(`[AudioService] 🎵 [等功率淡入v3.0] 开始，时长: ${duration}ms, 目标音量: ${targetVolume}`);
    
    try {
      const { lfoService } = await import('./LFOService');
      
      const { fadeIn } = lfoService.createEqualPowerCrossfade({
        maxVolume: targetVolume,
        duration: duration,
        steps: 50,
      });
      
      for (let i = 1; i < fadeIn.volumes.length; i++) {
        if (!this.isFading) {
          console.log('[AudioService] ⚡ [等功率淡入v3.0] 被外部中断，执行平滑恢复');
          await this.smoothRecoverVolume(targetVolume);
          return;
        }
        
        const elapsed = Date.now() - this.fadeStartTime;
        if (elapsed > duration + 1000) {
          console.warn('[AudioService] ⚠️ [等功率淡入v3.0] 超时保护触发');
          break;
        }
        
        await TrackPlayer.setVolume(fadeIn.volumes[i]);
        
        if (i < fadeIn.volumes.length - 1 && this.isFading) {
          await new Promise(resolve => setTimeout(resolve, fadeIn.stepDuration));
        }
      }
      
      console.log(`[AudioService] ✅ [等功率淡入v3.0] 完成，耗时: ${Date.now() - this.fadeStartTime}ms`);
    } catch (error) {
      console.error('[AudioService] ❌ [等功率淡入v3.0] 异常:', error);
    } finally {
      this.isFading = false;
    }
  }

  private async smoothRecoverVolume(targetVolume: number): Promise<void> {
    try {
      const currentVol = await TrackPlayer.getVolume();
      const diff = targetVolume - currentVol;
      
      if (Math.abs(diff) < 0.01) {
        await TrackPlayer.setVolume(targetVolume);
        return;
      }
      
      const steps = 10;
      const stepDelay = 200 / steps;
      
      for (let i = 1; i <= steps; i++) {
        const vol = currentVol + (diff * i / steps);
        await TrackPlayer.setVolume(Math.max(0, Math.min(1, vol)));
        await new Promise(resolve => setTimeout(resolve, stepDelay));
      }
      
      console.log(`[AudioService] ✅ [竞态保护] 平滑恢复完成: ${currentVol.toFixed(3)} → ${targetVolume.toFixed(3)}`);
    } catch (e) {
      console.error('[AudioService] ❌ [竞态保护] 平滑恢复失败:', e);
      try {
        await TrackPlayer.setVolume(targetVolume);
      } catch (_) {}
    }
  }

  async cancelFadeAndRecover(): Promise<void> {
    if (!this.isFading) return;
    
    console.log('[AudioService] 🛑 [竞态保护] 收到取消请求...');
    this.isFading = false;
    
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.smoothRecoverVolume(this.ambientVolume);
    
    console.log('[AudioService] ✅ [竞态保护] 清理完成');
  }

  async switchSoundscape(scene: Scene): Promise<void> {
    const startTime = Date.now(); // 【性能监控】
    
    console.log(`[AudioService] 🎬 [switchSoundscape v2.0-响应] 被调用！目标: ${scene.id}, 当前: ${this.currentBaseScene?.id || 'null'}`);
    
    if (this.isFading) {
      console.warn('[AudioService] ⚠️ [响应优先] 正在淡入淡出中，忽略请求');
      return;
    }
    
    const prevScene = this.currentBaseScene;
    
    try {
      // ════════════════════════════════════════════════════════
      // 【Phase 0 ⚡️】UI 反馈优先（点击瞬间立即执行！）
      // ════════════════════════════════════════════════════════
      
      this.isSwitchingScene = true; // 立即锁定，防止重复点击
      this.notifyListeners(); // 🔥 第一时间让 UI 响应！
      
      console.log(`[AudioService] ⚡️ [Phase 0] UI 已响应！耗时: ${Date.now() - startTime}ms`);
      
      // ════════════════════════════════════════════════════════
      // 【Phase 1】并行启动：旧音频淡出 + 新音频预加载（激进模式）
      // ════════════════════════════════════════════════════════
      
      let fadeOutPromise: Promise<void> | null = null;
      
      if (this.isActuallyPlaying && this._isReady) {
        console.log('[AudioService] 🔽 [Phase 1] 启动 Sine 淡出 (2000ms)...');
        this.isFading = true;
        fadeOutPromise = this.fadeOutVolume(2000);
      }
      
      // 【激进预加载】立即准备新音频（不等待！）
      console.log('[AudioService] 🚀 [Phase 1] 立即预加载新音频...');
      
      const isRoaming = sceneRoamManager.getIsRoaming();
      
      // ══════════════════════════════════════════
      // 【🚨 关键修复】RepeatMode 智能设置
      // 漫游模式 → 保持默认（支持队列自动推进）✅
      // 非漫游模式 → Track（单场景循环）
      // ══════════════════════════════════════════
      if (isRoaming) {
        console.log('[AudioService] [switchSoundscape] 漫游模式，保持默认RepeatMode（支持队列推进）');
      } else {
        await TrackPlayer.setRepeatMode(RepeatMode.Track);
        console.log('[AudioService] [switchSoundscape] 非漫游模式，RepeatMode=Track');
      }
      
      console.log(`[AudioService] 📦 [Phase 1] 预加载完成！耗时: ${Date.now() - startTime}ms`);
      
      // ════════════════════════════════════════════════════════
      // 【Phase 2】500ms 快速交叉点（新旧音频交织）
      // ════════════════════════════════════════════════════════
      
      const CROSSFADE_DELAY = 500;
      
      if (fadeOutPromise) {
        console.log(`[AudioService] ⏳ [Phase 2] 等待 ${CROSSFADE_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, CROSSFADE_DELAY));
        console.log(`[AudioService] ⏱️ [Phase 2] 交叉点到达！耗时: ${Date.now() - startTime}ms`);

        // ═══════════════════════════════════════════════════
        // 【🔥🔥🔥 v7 预判信号补丁 - Phase 2/3 路径】
        // 问题：Shuffle 漫游走的是 Phase 2/3 路径（非 seamlessSwitch）
        // 导致 v8 双向锁定机制未触发，UI 出现闪烁
        // 修复：在 Phase 2 交叉点到达后、切换音频前，立即发射信号
        // ═══════════════════════════════════════════════════
        try {
          const { DeviceEventEmitter: Emitter } = require('react-native');

          let nextSceneId = this.preloadedNextScene?.id || '';

          if (!nextSceneId && scene?.id) {
            nextSceneId = scene.id;
          }

          if (nextSceneId) {
            console.log(`[AudioService] 📡 [v7-Phase2补丁] 发射预判信号: ${nextSceneId}`);
            Emitter.emit('sceneSwitchStart', {
              nextSceneId,
              source: 'Phase2-v7-Fix'
            });
          } else {
            console.warn('[AudioService] ⚠️ [v7-Phase2补丁] 无法获取 nextSceneId');
          }
        } catch (emitError) {
          console.warn('[AudioService] ⚠️ [v7-Phase2补丁] 发送失败:', emitError?.message);
        }
      }

      // ════════════════════════════════════════════════════════
      // 【Phase 3】停止旧音频 + 加载新音频
      // ════════════════════════════════════════════════════════
      
      if (fadeOutPromise) {
        console.log('[AudioService] ✅ [Phase 3] 等待淡出完成...');
        await fadeOutPromise;
      }
      
      console.log('[AudioService] 🛑 [Phase 3] 切换音频...');
      
      try {
        // ══════════════════════════════════════════
        // 【🔑🔑🔑 核心修复】漫游模式下保护预加载队列！
        // 问题：reset() 会清空 preloadNextScene() 添加的下一首
        // 方案：漫游模式 + 队列有下一首 → 跳过 reset，让原生层继续使用队列
        // ══════════════════════════════════════════
        const isRoamingMode = sceneRoamManager.getIsRoaming();
        let shouldPreserveQueueInSwitch = false;
        
        if (isRoamingMode) {
          try {
            const queue = await TrackPlayer.getQueue();
            const currentTrackIndex = await TrackPlayer.getCurrentTrack();
            
            console.log(`[AudioService] 🛡️ [switch-队列检查] 漫游模式，队列长度: ${queue.length}, 当前索引: ${currentTrackIndex}`);
            
            if (queue.length > 1 && currentTrackIndex !== null && currentTrackIndex < queue.length - 1) {
              shouldPreserveQueueInSwitch = true;
              console.log('[AudioService] ✅ [switch-队列保护] 检测到预加载队列，跳过 reset！');
            } else {
              console.log('[AudioService] ⚠️ [switch-队列检查] 队列为空或只有当前首，执行 reset');
            }
          } catch (checkError) {
            console.warn('[AudioService] ⚠️ [switch-队列检查失败]:', checkError);
          }
        }
        
        if (!shouldPreserveQueueInSwitch) {
          await TrackPlayer.reset();
          __DEV__ && console.log('[AudioService] [switch] 执行 reset');
        } else {
          __DEV__ && console.log('[AudioService] [switch] 跳过 reset（保护预加载队列）');
        }
      } catch (e) {
        console.warn('[AudioService] reset 失败:', e);
      }
      this.isActuallyPlaying = false;
      
      this.currentBaseScene = scene;
      this.notifyListeners();
      
      console.log('[AudioService] 🎵 [Phase 3] 加载新音频...');
      await this.playScene(scene);
      
      console.log(`[AudioService] 🎵 [Phase 3] 新音频已就绪！耗时: ${Date.now() - startTime}ms`);
      
      // ════════════════════════════════════════════════════════
      // 【Phase 4】Sine 淡入新音频 (1500ms)
      // ════════════════════════════════════════════════════════
      
      console.log('[AudioService] 🔼 [Phase 4] Sine 淡入 (1500ms)...');
      await this.fadeInVolume(1500);
      
      const totalTime = Date.now() - startTime;
      console.log(`[AudioService] ✅ [Sine-Crossfade v2.0-响应] 完成！(总耗时: ${totalTime}ms)`);
      
    } catch (error) {
      console.error('[AudioService] ❌ [响应优先] 失败:', error);
      this.currentBaseScene = prevScene;
      this.isFading = false;
      this.notifyListeners();
      throw error;
    } finally {
      this.isSwitchingScene = false;
      // 【🔒 锁安全】确保 isFading 在所有路径下都释放（防止后台切换时死锁）
      if (this.isFading) {
        console.warn('[AudioService] ⚠️ [switchSoundscape-finally] 检测到未释放的 fade 锁，强制释放');
        this.isFading = false;
      }
    }
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
      const RNFS = await import('@dr.pogodin/react-native-fs');
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
    
    const RNFS = await import('@dr.pogodin/react-native-fs');
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
    
    // 【资源复用】已下载的场景直接复用本地文件，不重复下载
    const isNoiseCancellation = audioAsset.category === 'noise_cancellation';
    
    console.log(`==========================================\n`);
    
    if (!isDownloaded) {
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
      // 【资源复用】新场景复用旧场景音频，直接返回 true
      const REUSE_IDS = ['manual_morning_forest', 'manual_serene_lakeside', 'manual_starlit_wilderness'];
      if (REUSE_IDS.includes(type)) {
        console.log(`[AudioService] isAssetReady: ${type} → 复用旧场景音频，直接返回 true`);
        return true;
      }

      // 1. 检查是否在 RESOURCE_MAP 中（远程资源）
      const { RESOURCE_MAP } = await import('../config/ResourceConfig');
      if (RESOURCE_MAP[type]) {
        // 远程资源：检查是否已下载
        return await isDownloaded(type);
      }

      // 2. 检查是否为本地场景资源
      const scene = SCENES.find(s => s.id === type);
      if (scene && scene.filename) {
        // 场景资源：优先检查本地文件是否存在
        const { getLocalPath } = await import('../constants/audioAssets');
        const RNFS = await import('@dr.pogodin/react-native-fs');
        const localPath = getLocalPath(scene.category, scene.filename);
        const fileExists = await RNFS.exists(localPath.replace('file://', ''));
        if (fileExists) {
          return true;
        }
        // 如果本地文件不存在，检查 Sound 实例是否已加载（兼容旧逻辑）
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

  /**
   * 【新增】预加载背景图片文件状态，避免RNFS.exists()异步问题
   * 在应用启动时调用，将所有场景的背景图片存在性缓存到内存中
   */
  public async preloadBackgroundAvailability(): Promise<void> {
    console.log('[AudioService] ====== 预加载背景图片文件状态开始 ======');
    
    // 【快速遍历】只检查 scenes.ts 中定义的基础场景，不处理动态组合场景
    const scenesToCheck = this.getAllSceneIds();
    
    for (const sceneId of scenesToCheck) {
      try {
        // 【同步版本】直接调用 isBackgroundImageAvailableSync
        const exists = this.isBackgroundImageAvailableSync(sceneId);
        
        // 【诊断】只输出非存在的情况，减少日志噪音
        if (!exists) {
          console.log(`[AudioService] ℹ️ 场景 ${sceneId} 无背景图（预期行为）`);
        }
      } catch (error: any) {
        console.error(`[AudioService] ❌ 检查场景 ${sceneId} 背景图失败:`, error?.message);
      }
    }
    
    console.log('[AudioService] ✅ 预加载背景图片文件状态完成，缓存大小:', this.backgroundImageCache.size);
  }

  /**
   * 【辅助】获取所有基础场景 ID
   */
  private getAllSceneIds(): string[] {
    // 【核心】从 scenes.ts 的 SCENES 导出中提取 ID
    return SCENES.map(scene => scene.id);
  }
}

/**
 * 【音频缓存清理】仅删除 /Documents/audio_resources/noise_reduction/ 子目录。
 * 用途：替换本地音源后，需删除旧缓存以触发重新下载（DownloaderService 检测到文件存在会跳过）。
 * 
 * ⚠️ v1.5.0 修复：不再删除整个 audio_resources 目录，避免误删其他场景音频。
 */
export async function clearAllAudioCache(): Promise<{ success: boolean; deletedFiles: number }> {
  const noiseDir = `${RNFS.DocumentDirectoryPath}/audio_resources/noise_reduction`;

  try {
    if (!(await RNFS.exists(noiseDir))) {
      console.log('[AudioService] 🧹 noise_reduction 目录不存在，无需清理');
      return { success: true, deletedFiles: 0 };
    }

    // 只删除 noise_reduction 子目录（RNFS.unlink 对目录会递归删除）
    await RNFS.unlink(noiseDir);
    console.log('[AudioService] 🧹 已删除 noise_reduction 目录');
    return { success: true, deletedFiles: 1 };
  } catch (e) {
    console.error('[AudioService] ❌ 清除音频缓存失败:', e);
    return { success: false, deletedFiles: 0 };
  }
}

// 具名导出封装（保持原有调用方式）
// 【Hermes Release + R8 修复】所有导出函数使用箭头函数，确保被 proguard 保留
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
// 【UI激活状态同步修复】具名导出 stopAllAmbientOnly，防止Hermes优化丢失
export const stopAllAmbientOnly = () => AudioService.getInstance().stopAllAmbientOnly();
export const togglePlayback = (scene: any) => AudioService.getInstance().togglePlayback(scene);
export const getAmbientVolumeById = (id: string) => AudioService.getInstance().getAmbientVolumeById(id);
export const toggleAmbience = (scene: any, targetState: boolean) => {
    try {
      console.error('[AudioService-EXPORT] 🔍 toggleAmbience called');
      const instance = AudioService.getInstance();
      console.error('[AudioService-EXPORT] 🔍 getInstance() returned:', typeof instance);
      console.error('[AudioService-EXPORT] 🔍 instance._isReady =', (instance as any)._isReady);
      console.error('[AudioService-EXPORT] 🔍 instance.setupPlayer type =', typeof (instance as any).setupPlayer);
    } catch (e) {
      console.error('[AudioService-EXPORT] 🔍 getInstance() 异常:', e);
    }
    return AudioService.getInstance().toggleAmbience(scene, targetState);
};
// ════════════════════════════════════════════════════════
// 【R8 终极修复】导出监听器注册函数 — 使用静态回调机制绕过方法名+属性名混淆
// ════════════════════════════════════════════════════════

// R8 混淆会同时改变方法和属性名，所以通过 instance.smallScenesListeners 访问 Set
// 也可能拿到 undefined（因为属性名被改了）。改为使用静态回调列表，完全不依赖实例属性。
let _smallScenesCallbacks: Array<(ids: string[]) => void> = [];
let _volumeCallbacks: Array<(vol: number) => void> = [];
let _timerCallbacks: Array<(remaining: number | null) => void> = [];

// 注册静态回调（导出函数直接操作，不经过实例）
export const addSmallScenesListener = (l: (ids: string[]) => void) => {
  _smallScenesCallbacks.push(l);
  return () => {
    const idx = _smallScenesCallbacks.indexOf(l);
    if (idx !== -1) _smallScenesCallbacks.splice(idx, 1);
  };
};

// 通知所有 smallScenes 监听器
export const notifyAllSmallScenesListeners = (ids: string[]) => {
  for (const cb of _smallScenesCallbacks) {
    try { cb(ids); } catch (e) { console.error('[AudioService] smallScenes callback error:', e); }
  }
};

// 【核心修复】让 AudioService 实例的 notifySmallScenes 在触发时，同时调用静态回调
// 这样即使 R8 混淆了方法名，只要方法体里的 this.smallScenesListeners.forEach 还在，
// 就能通过重写该方法的引用来桥接。
// 
// 实现方式：在 AudioService 类内部新增一个公开方法 _pushStaticCallbackSmallScenes，
// 由该类内部调用，外部导出函数负责绑定。
export const _registerInternalListeners = (service: AudioService) => {
  // 将静态回调桥接到实例：当实例需要通知时，同时触发静态回调
  (service as any)._pushStaticCallback = {
    smallScenes: (ids: string[]) => {
      for (const cb of _smallScenesCallbacks) {
        try { cb(ids); } catch (e) { console.error('[AudioService] smallScenes callback error:', e); }
      }
    },
    volume: (vol: number) => {
      for (const cb of _volumeCallbacks) {
        try { cb(vol); } catch (e) { console.error('[AudioService] volume callback error:', e); }
      }
    },
    timer: (remaining: number | null) => {
      for (const cb of _timerCallbacks) {
        try { cb(remaining); } catch (e) { console.error('[AudioService] timer callback error:', e); }
      }
    },
  };

  // 【关键】重写实例的 notifySmallScenes 方法，在原有通知后额外触发静态回调
  const originalNotify = (service as any).notifySmallScenes.bind(service);
  if (typeof originalNotify === 'function') {
    (service as any).notifySmallScenes = function() {
      // 先执行原始的通知逻辑
      originalNotify();
      // 再触发静态回调（确保外部订阅者也能收到）
      const ids = (service as any).activeSmallScenes 
        ? Array.from((service as any).activeSmallScenes) 
        : [];
      if (ids.length > 0) {
        (_pushStaticCallback?.smallScenes as any)?.(ids);
      }
    };
  }

  console.log('[AudioService] 📦 R8 静态回调桥接完成');
};

// 引用上级作用域的 _pushStaticCallback（在 _registerInternalListeners 中被赋值）
const _pushStaticCallback: {
  smallScenes?: (ids: string[]) => void;
  volume?: (vol: number) => void;
  timer?: (remaining: number | null) => void;
} = {};

export const addVolumeListener = (l: (vol: number) => void) => {
  _volumeCallbacks.push(l);
  return () => {
    const idx = _volumeCallbacks.indexOf(l);
    if (idx !== -1) _volumeCallbacks.splice(idx, 1);
  };
};

export const addSleepTimerListener = (l: (remaining: number | null) => void) => {
  _timerCallbacks.push(l);
  return () => {
    const idx = _timerCallbacks.indexOf(l);
    if (idx !== -1) _timerCallbacks.splice(idx, 1);
  };
};

// 【R8 修复】通过静态回调注册，不依赖实例方法
export const addSmallScenesListenerViaInstance = (l: (ids: string[]) => void) => {
  // 直接注册到静态回调（与 addSmallScenesListener 相同）
  return addSmallScenesListener(l);
};


export const getRealIsPlaying = () => AudioService.getInstance().getRealIsPlaying();
export const getVolume = () => AudioService.getInstance().getVolume();
export const setVolume = (volume: number) => AudioService.getInstance().setVolume(volume);
export const isAssetReady = (type: string) => AudioService.getInstance().isAssetReady(type);

export const setRecordShopLayerVolume = (layer: RecordShopLayer, volume: number) =>
  AudioService.getInstance().setRecordShopLayerVolume(layer, volume);
export const getRecordShopVolumes = () =>
  AudioService.getInstance().getRecordShopVolumes();

export const getSkipAutoEnvironmentDetection = () =>
  AudioService.getInstance().getSkipAutoEnvironmentDetection();

export default AudioService;