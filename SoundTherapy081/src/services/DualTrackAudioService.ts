/**
 * 【双轨主音频服务】实现真正的交叉淡入淡出（Crossfade）
 * 
 * 架构设计：
 * - 维护两个独立的 Sound 实例（Player A 和 Player B）
 * - 切换场景时，旧音频淡出，新音频淡入，无缝接力
 * - 使用 react-native-sound 实现真正的多实例并发播放
 */

import Sound from 'react-native-sound';
import { Platform, NativeModules } from 'react-native';
import { AUDIO_MAP, getDownloadUrl, getLocalPath } from '../constants/audioAssets';
import RNFS from 'react-native-fs';
import { Scene, SCENES } from '../constants/scenes';
import { OfflineService } from './OfflineService';
import TrackPlayer from 'react-native-track-player';
import SFXPlayer from './SFXPlayer';

// WakeLock 原生模块接口
interface WakeLockModule {
  acquire: () => void;
  release: () => void;
}

// 音频实例类型
interface AudioPlayer {
  sound: Sound | null;
  sceneId: string | null;
  isFading: boolean;
  isReady: boolean;
}

// 交叉淡入淡出配置
const CROSSFADE_DURATION = 800; // 800ms 交叉淡入淡出
const FADE_STEPS = 16; // 16步完成
const STEP_DURATION = CROSSFADE_DURATION / FADE_STEPS; // 每步50ms

class DualTrackAudioService {
  private static instance: DualTrackAudioService;
  
  // 双轨实例
  private playerA: AudioPlayer = { sound: null, sceneId: null, isFading: false, isReady: false };
  private playerB: AudioPlayer = { sound: null, sceneId: null, isFading: false, isReady: false };
  
  // 当前活跃的播放器（'A' | 'B'）
  private activePlayer: 'A' | 'B' = 'A';
  
  // 当前音量
  private currentVolume = 1.0;
  
  // 是否正在切换
  private isSwitching = false;
  
  // 当前场景
  private currentScene: Scene | null = null;
  
  // 播放状态
  private isPlayingState = false;
  
  // 监听器
  private listeners: Set<(state: { isPlaying: boolean; sceneId: string | null }) => void> = new Set();
  
  // 子音效监听器
  private smallScenesListeners: Set<(ids: string[]) => void> = new Set();
  
  // 音量监听器
  private volumeListeners: Set<(volume: number) => void> = new Set();
  
  // 活跃的子音效集合
  private activeSmallScenes: Set<string> = new Set();
  
  // SFXPlayer 实例
  private sfxPlayer: SFXPlayer = SFXPlayer.getInstance();
  
  // 子音效音量
  private ambientVolume = 1.0;
  
  // 初始化状态
  private isInitialized = false;
  
  // 【深海呼吸优化】循环平滑定时器
  private loopSmoothInterval: NodeJS.Timeout | null = null;
  
  // WakeLock 状态
  private wakeLockHeld = false;
  
  // 【LFO 深海呼吸控制器】
  private lfoInterval: NodeJS.Timeout | null = null;
  private lfoStartTime = 0;
  private lfoPeriod = 13000; // 13秒一次完整呼吸
  private lfoStepMs = 50; // 50ms 步进
  private lfoActive = false;
  
  // LFO 监听器（分发 progress 给 UI）
  private lfoListeners: Set<(progress: number, phase: 'inhale' | 'exhale') => void> = new Set();

  private constructor() {
    // 立即标记为已初始化，避免阻塞
    this.isInitialized = true;
    console.log('[DualTrackAudio] ✅ 服务实例已创建');
    
    // 异步初始化音频会话
    this.initializeAsync();
  }

  static getInstance(): DualTrackAudioService {
    if (!DualTrackAudioService.instance) {
      DualTrackAudioService.instance = new DualTrackAudioService();
    }
    return DualTrackAudioService.instance;
  }

  /**
   * 异步初始化音频会话
   */
  private async initializeAsync(): Promise<void> {
    try {
      console.log('[DualTrackAudio] 异步初始化音频会话...');
      
      // 设置音频类别
      Sound.setCategory('Playback');
      Sound.setMode('Default');
      
      console.log('[DualTrackAudio] ✅ 音频会话初始化完成');
    } catch (error) {
      console.error('[DualTrackAudio] ❌ 音频会话初始化失败:', error);
    }
  }

  /**
   * 获取音频源路径
   */
  private async getAudioSource(scene: Scene): Promise<string | number> {
    // 【Bellcoda 新场景】优先使用内置 res/raw 资源（字符串文件名）
    if (scene.audioFile && typeof scene.audioFile === 'string') {
      console.log('[DualTrackAudio] 📦 使用内置 res/raw 音频资源:', scene.id, scene.audioFile);
      return scene.audioFile;
    }

    const localPath = getLocalPath(scene.category, scene.filename);
    
    if (!localPath || typeof localPath !== 'string') {
      throw new Error('INVALID_LOCAL_PATH');
    }
    
    const isLocal = await RNFS.exists(localPath.replace('file://', ''));
    const isOffline = await OfflineService.isOfflineMode();
    
    let uri: string | null = null;
    if (isLocal) {
      uri = localPath;
    } else if (!isOffline) {
      const downloadUrls = getDownloadUrl(scene.id);
      if (!downloadUrls || downloadUrls.length === 0 || !downloadUrls[0]) {
        throw new Error('INVALID_REMOTE_URL');
      }
      uri = downloadUrls[0];
    }

    if (!uri || uri.includes('undefined') || uri.includes('null')) {
      throw new Error('INVALID_URI_FORMAT');
    }

    if (!uri) throw new Error('NO_AVAILABLE_SOURCE');
    
    return uri;
  }

  /**
   * 创建并加载音频（带预缓冲）
   */
  private async loadAudio(uri: string | number): Promise<Sound> {
    return new Promise((resolve, reject) => {
      // Android res/raw 资源：字符串文件名（如 'nature_moonlight'）
      // react-native-sound 在 Android 上会自动通过 getIdentifier(fileName, "raw", packageName) 查找
      const isRawResource = typeof uri === 'string' && !uri.startsWith('/') && !uri.startsWith('file:') && !uri.startsWith('http');
      const basePath = isRawResource ? '' : '';
      
      console.log('[DualTrackAudio] 🔍 loadAudio 参数:', { uri, type: typeof uri, isRawResource, basePath });
      
      const sound = new Sound(uri, basePath, (error) => {
        if (error) {
          console.error('[DualTrackAudio] ❌ 音频加载失败:', error);
          reject(error);
          return;
        }
        console.log('[DualTrackAudio] ✅ 音频加载成功，预缓冲完成', { isRawResource, duration: sound.getDuration() });
        resolve(sound);
      });
    });
  }

  /**
   * 淡入音频（0 → 1.0）
   */
  private async fadeIn(player: AudioPlayer): Promise<void> {
    if (!player.sound) return;
    
    player.isFading = true;
    
    for (let i = 0; i <= FADE_STEPS; i++) {
      if (!player.isFading) break;
      
      const volume = (i / FADE_STEPS) * this.currentVolume;
      player.sound.setVolume(volume);
      
      if (i < FADE_STEPS) {
        await new Promise(resolve => setTimeout(resolve, STEP_DURATION));
      }
    }
    
    player.isFading = false;
    console.log('[DualTrackAudio] ✅ 淡入完成');
  }

  /**
   * 慢速淡入音频（用于深海呼吸场景）
   * @param player 播放器
   * @param duration 淡入时长（ms）
   */
  private async slowFadeIn(player: AudioPlayer, duration: number): Promise<void> {
    if (!player.sound) return;
    
    player.isFading = true;
    
    const steps = 40; // 更多步数，更平滑
    const stepDuration = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      if (!player.isFading) break;
      
      const volume = (i / steps) * this.currentVolume;
      player.sound.setVolume(volume);
      
      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    }
    
    player.isFading = false;
    console.log(`[DualTrackAudio] ✅ 慢速淡入完成（${duration}ms）`);
  }

  /**
   * 淡出音频（1.0 → 0）
   */
  private async fadeOut(player: AudioPlayer): Promise<void> {
    if (!player.sound) return;
    
    player.isFading = true;
    
    for (let i = FADE_STEPS; i >= 0; i--) {
      if (!player.isFading) break;
      
      const volume = (i / FADE_STEPS) * this.currentVolume;
      player.sound.setVolume(volume);
      
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, STEP_DURATION));
      }
    }
    
    player.isFading = false;
    console.log('[DualTrackAudio] ✅ 淡出完成');
  }

  /**
   * 停止并释放播放器
   */
  private async releasePlayer(player: AudioPlayer): Promise<void> {
    if (player.sound) {
      player.sound.stop();
      player.sound.release();
      player.sound = null;
    }
    player.sceneId = null;
    player.isReady = false;
  }

  /**
   * 彻底停掉 TrackPlayer 防止冲突
   */
  private async muteTrackPlayer(): Promise<void> {
    try {
      console.log('[DualTrackAudio] 🔇 停掉 TrackPlayer 防止冲突...');
      await TrackPlayer.setVolume(0);
      await TrackPlayer.pause();
      console.log('[DualTrackAudio] ✅ TrackPlayer 已静音');
    } catch (error) {
      console.warn('[DualTrackAudio] ⚠️ TrackPlayer 静音失败:', error);
    }
  }

  /**
   * 【深海呼吸优化】启动手动平滑循环
   * 使用原生 setNumberOfLoops(-1) 替代手动 seekTo，避免 Release 模式下 MediaPlayer 状态异常
   */
  private startDeepSeaLoop(sound: Sound): void {
    // 使用原生循环，但通过 EQ 和音量补偿来平滑循环点
    sound.setNumberOfLoops(-1);
    console.log('[DualTrackAudio] 🌊 深海呼吸场景：使用原生循环（已优化平滑度）');
  }

  /**
   * 【深海呼吸优化】停止手动循环
   */
  private stopDeepSeaLoop(): void {
    if (this.loopSmoothInterval) {
      clearInterval(this.loopSmoothInterval);
      this.loopSmoothInterval = null;
    }
  }

  /**
   * 获取 Sound 实例的当前位置（ms）
   */
  private getSoundPosition(sound: Sound): Promise<number> {
    return new Promise((resolve) => {
      sound.getCurrentPosition((pos) => {
        resolve(pos || 0);
      });
    });
  }

  /**
   * 【LFO 深海呼吸】启动 LFO 控制器
   * 用代码生成的波形覆盖素材自带的呼吸节奏
   */
  private startLFO(): void {
    this.stopLFO();
    this.lfoActive = true;
    this.lfoStartTime = Date.now();
    
    console.log('[DualTrackAudio] 🌊 LFO 深海呼吸控制器已启动，周期 13000ms');
    
    this.lfoInterval = setInterval(() => {
      if (!this.lfoActive) return;
      
      const elapsed = Date.now() - this.lfoStartTime;
      const cyclePos = (elapsed % this.lfoPeriod) / this.lfoPeriod; // 0..1 周期位置
      
      // sin 波形：-1..1，映射到呼吸相位
      const sinValue = Math.sin(cyclePos * Math.PI * 2);
      
      // 音量调制：0.4 + 0.6 * sinValue (映射到 0.4..1.0)
      const gainValue = 0.4 + 0.6 * ((sinValue + 1) / 2);
      
      // 相位判断：sin > 0 为吸气，sin < 0 为呼气
      const phase = sinValue >= 0 ? 'inhale' as const : 'exhale' as const;
      
      // 应用音量
      this.applyLFOVolume(gainValue);
      
      // 应用 EQ 动态映射
      this.applyLFOEQ(sinValue);
      
      // 分发 progress 给 UI
      this.notifyLFOListeners(cyclePos, phase);
    }, this.lfoStepMs);
  }
  
  /**
   * 【LFO 深海呼吸】停止 LFO 控制器
   */
  private stopLFO(): void {
    this.lfoActive = false;
    if (this.lfoInterval) {
      clearInterval(this.lfoInterval);
      this.lfoInterval = null;
    }
  }
  
  /**
   * 【LFO 音量调制】应用动态增益
   */
  private applyLFOVolume(gain: number): void {
    const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
    if (currentPlayer.sound && currentPlayer.sound.isLoaded() && !currentPlayer.isFading) {
      currentPlayer.sound.setVolume(gain * this.currentVolume);
    }
  }
  
  /**
   * 【LFO EQ 动态映射】
   * 吸气（sin > 0）：放开 2k-4kHz
   * 呼气（sin < 0）：大幅压低所有高频
   */
  private applyLFOEQ(sinValue: number): void {
    try {
      const { NativeEQ } = require('../modules/NativeEQ');
      if (!NativeEQ || typeof NativeEQ.setBandGain !== 'function') return;
      
      // sinValue: -1 (呼气底) .. +1 (吸气顶)
      const normalized = (sinValue + 1) / 2; // 0..1
      
      // 基础低通 + 动态调制
      // Band 0 (62Hz):  4 + 0 = 4
      // Band 1 (250Hz): 3 + 0 = 3
      // Band 2 (1kHz):  2 + 0 = 2
      // Band 3 (2kHz):  1 + normalized * 3 (吸气时放开到 +4)
      // Band 4 (4kHz):  0 + normalized * 2 (吸气时放到 +2)
      // Band 5 (8kHz): -2 + normalized * 2 (吸气时放到 0)
      // Band 6 (12kHz): -4 + normalized * 4 (吸气时放到 0)
      // Band 7 (16kHz): -6 + normalized * 6 (吸气时放到 0)
      const gains = [
        4,
        3,
        2,
        1 + normalized * 3,
        normalized * 2,
        -2 + normalized * 2,
        -4 + normalized * 4,
        -6 + normalized * 6,
      ];
      
      gains.forEach((gain, index) => {
        NativeEQ.setBandGain(index, gain);
      });
    } catch (e) {
      // 忽略 EQ 错误
    }
  }
  
  /**
   * 【LFO 监听器】添加 UI 监听
   */
  addLFOListener(listener: (progress: number, phase: 'inhale' | 'exhale') => void): () => void {
    this.lfoListeners.add(listener);
    return () => this.lfoListeners.delete(listener);
  }
  
  /**
   * 【LFO 监听器】通知所有 UI
   */
  private notifyLFOListeners(progress: number, phase: 'inhale' | 'exhale'): void {
    this.lfoListeners.forEach(l => l(progress, phase));
  }

  /**
   * 获取 WakeLock 防止 CPU 休眠
   */
  private acquireWakeLock(): void {
    if (this.wakeLockHeld) return;
    try {
      const { WakeLockModule } = NativeModules;
      if (WakeLockModule && typeof WakeLockModule.acquire === 'function') {
        WakeLockModule.acquire();
        this.wakeLockHeld = true;
        console.log('[DualTrackAudio] 🔒 WakeLock 已获取');
      }
    } catch (e) {
      console.error('[DualTrackAudio] ❌ WakeLock 获取失败:', e);
    }
  }

  /**
   * 释放 WakeLock
   */
  private releaseWakeLock(): void {
    if (!this.wakeLockHeld) return;
    try {
      const { WakeLockModule } = NativeModules;
      if (WakeLockModule && typeof WakeLockModule.release === 'function') {
        WakeLockModule.release();
        this.wakeLockHeld = false;
        console.log('[DualTrackAudio] 🔓 WakeLock 已释放');
      }
    } catch (e) {
      console.error('[DualTrackAudio] ❌ WakeLock 释放失败:', e);
    }
  }

  /**
   * 切换场景（双轨交叉淡入淡出）
   */
  async switchSoundscape(scene: Scene): Promise<void> {
    if (this.isSwitching) {
      console.warn('[DualTrackAudio] ⚠️ 正在切换，跳过');
      return;
    }
    
    this.isSwitching = true;
    console.log('[DualTrackAudio] 🎵 开始切换场景:', scene.id);
    
    // 【深海呼吸优化】检测是否为深海场景
    const isDeepSea = scene.id === 'nature_deep_sea' || scene.id.includes('deep_sea');
    
    try {
      // 步骤0：切换场景时，安全地停止所有交互音
      this.activeSmallScenes.forEach(id => {
        try {
          this.sfxPlayer.stop(`small_${id}`);
        } catch (e) { /* 忽略单个停止失败 */ }
      });
      this.activeSmallScenes.clear();
      this.notifySmallScenes();
      
      // 步骤1：彻底停掉 TrackPlayer 防止两套音频引擎打架
      await this.muteTrackPlayer();
      
      // 【状态恢复】切换出深海场景时，重置播放速率、EQ 和 LFO
      if (!isDeepSea && this.currentScene) {
        const wasDeepSea = this.currentScene.id === 'nature_deep_sea' || this.currentScene.id.includes('deep_sea');
        if (wasDeepSea) {
          console.log('[DualTrackAudio] 🔄 切换出深海场景：重置播放速率、EQ 和 LFO');
          this.stopLFO();
          try {
            const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
            if (currentPlayer.sound) {
              currentPlayer.sound.setSpeed(1.0);
            }
          } catch (e) {
            console.error('[DualTrackAudio] ❌ 播放速率重置失败:', e);
          }
          try {
            const { NativeEQ } = require('../modules/NativeEQ');
            if (NativeEQ && typeof NativeEQ.setBandGain === 'function') {
              const flatGains = [0, 0, 0, 0, 0, 0, 0, 0];
              flatGains.forEach((gain, index) => {
                NativeEQ.setBandGain(index, gain);
              });
              console.log('[DualTrackAudio] 🔄 非深海场景：EQ 已重置为平坦');
            }
          } catch (e) {
            console.error('[DualTrackAudio] ❌ EQ 重置失败:', e);
          }
        }
      }
      
      // 获取音频源
      const uri = await this.getAudioSource(scene);
      
      // 确定当前播放器和下一个播放器
      const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
      const nextPlayer = this.activePlayer === 'A' ? this.playerB : this.playerA;
      
      // 步骤1：预加载新音频到下一个播放器（带预缓冲）
      console.log('[DualTrackAudio] 📦 预加载新音频（预缓冲期）...');
      const newSound = await this.loadAudio(uri);
      
      // 关键：先设置音量为0，防止爆音
      newSound.setVolume(0);
      nextPlayer.sound = newSound;
      nextPlayer.sceneId = scene.id;
      nextPlayer.isReady = true;
      
      // 【LFO 深海呼吸】不修改播放速率，改用 LFO 调制
      if (isDeepSea) {
        console.log('[DualTrackAudio] 🌊 深海呼吸场景：使用 LFO 调制（不改变播放速率）');
      }
      
      // 步骤2：新音频先开始播放（静音状态）
      console.log('[DualTrackAudio] ▶️ 新音频静音播放...');
      newSound.play();
      
      // 【WakeLock】深海场景播放时获取 WakeLock，防止 CPU 休眠
      if (isDeepSea) {
        this.acquireWakeLock();
      }
      
      // 【深海呼吸优化】使用原生循环（已通过 EQ 优化平滑度）
      if (isDeepSea) {
        console.log('[DualTrackAudio] 🌊 深海呼吸场景：启用原生循环');
        newSound.setNumberOfLoops(-1);
        this.startDeepSeaLoop(newSound);
      } else {
        newSound.setNumberOfLoops(-1);
      }
      
      // 【状态同步补丁】新音频开始播放的瞬间，立即更新 isPlaying 状态
      this.isPlayingState = true;
      
      // 【全联动修复】立即更新 currentScene 和 currentBaseSceneId，让 UI 瞬间响应
      this.currentScene = scene;
      
      // 立即通知 UI 更新（背景图、标题、播放按钮）
      this.notifyListeners();
      
      // 步骤3：确认新音频已 Ready 后，再开始淡出旧音频
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms 预缓冲
      
      // 【深海呼吸优化】应用低通滤波 EQ
      if (isDeepSea) {
        try {
          const { NativeEQ } = require('../modules/NativeEQ');
          if (NativeEQ && typeof NativeEQ.setBandGain === 'function') {
            const lowPassGains = [4, 3, 2, 1, 0, -2, -4, -6];
            lowPassGains.forEach((gain, index) => {
              NativeEQ.setBandGain(index, gain);
            });
            console.log('[DualTrackAudio] 🌊 深海呼吸低通滤波 EQ 已应用');
          }
        } catch (e) {
          console.warn('[DualTrackAudio] ⚠️ 深海呼吸低通滤波 EQ 应用失败:', e);
        }
      }
      
      // 步骤4：同时启动淡入淡出（真正的并发）
      // 【LFO 深海呼吸】延长淡入时间至 2000ms，淡入完成后启动 LFO
      if (isDeepSea) {
        console.log('[DualTrackAudio] 🌊 深海呼吸场景：延长淡入时间至 2000ms');
        await this.fadeOut(currentPlayer);
        await this.slowFadeIn(nextPlayer, 2000);
        // 淡入完成后启动 LFO 调制
        this.startLFO();
      } else {
        console.log('[DualTrackAudio] 🎚️ 启动 800ms 交叉淡入淡出...');
        const fadeOutPromise = this.fadeOut(currentPlayer);
        const fadeInPromise = this.fadeIn(nextPlayer);
        await Promise.all([fadeOutPromise, fadeInPromise]);
      }
      
      // 步骤5：释放旧播放器
      console.log('[DualTrackAudio] 🗑️ 释放旧播放器...');
      await this.releasePlayer(currentPlayer);
      
      // 步骤6：切换活跃播放器
      this.activePlayer = this.activePlayer === 'A' ? 'B' : 'A';
      
      // 步骤7：再次通知 UI 更新状态（确保最终状态同步）
      this.notifyListeners();
      
      console.log('[DualTrackAudio] ✅ 场景切换完成');
    } catch (error) {
      console.error('[DualTrackAudio] ❌ 场景切换失败:', error);
      throw error;
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * 暂停播放
   */
  async pause(): Promise<void> {
    try {
      const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
      if (currentPlayer.sound) {
        currentPlayer.sound.pause();
        this.isPlayingState = false;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[DualTrackAudio] ❌ pause 异常:', error);
    }
  }

  /**
   * 恢复播放
   */
  async play(): Promise<void> {
    try {
      const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
      if (currentPlayer.sound) {
        currentPlayer.sound.play();
        this.isPlayingState = true;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[DualTrackAudio] ❌ play 异常:', error);
    }
  }

  /**
   * 停止所有子音效（不影响场景音）
   */
  async stopAllAmbient(): Promise<void> {
    this.sfxPlayer.stopAll();
    this.activeSmallScenes.clear();
    this.notifySmallScenes();
  }

  /**
   * 停止所有音频（场景音+子音效）
   */
  async stopAll(): Promise<void> {
    this.stopLFO();
    this.releaseWakeLock();
    await this.releasePlayer(this.playerA);
    await this.releasePlayer(this.playerB);
    this.stopAllAmbient();
    this.currentScene = null;
    this.isPlayingState = false;
    this.notifyListeners();
  }

  /**
   * 获取当前场景
   */
  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  /**
   * 获取当前基础场景 ID（兼容旧接口）
   */
  getCurrentBaseSceneId(): string | null {
    return this.currentScene?.id || null;
  }

  /**
   * 获取播放状态
   */
  isPlaying(): boolean {
    return this.isPlayingState;
  }

  /**
   * 获取当前状态字符串（兼容旧接口）
   */
  getCurrentState(): string {
    return this.isPlayingState ? 'playing' : 'paused';
  }

  /**
   * 获取活跃小场景 ID 列表
   */
  getActiveSmallSceneIds(): string[] {
    return Array.from(this.activeSmallScenes);
  }

  /**
   * 获取环境音量
   */
  getAmbientVolume(): number {
    return this.ambientVolume;
  }

  /**
   * 获取初始睡眠秒数（兼容旧接口）
   */
  getInitialSleepSeconds(): number | null {
    return null;
  }

  /**
   * 获取睡眠结束时间（兼容旧接口）
   */
  getSleepEndTime(): number | null {
    return null;
  }

  /**
   * 服务是否已准备好（兼容旧接口）
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 添加子音效监听器
   */
  addSmallScenesListener(listener: (ids: string[]) => void): () => void {
    this.smallScenesListeners.add(listener);
    return () => this.smallScenesListeners.delete(listener);
  }

  /**
   * 添加音量监听器
   */
  addVolumeListener(listener: (volume: number) => void): () => void {
    this.volumeListeners.add(listener);
    return () => this.volumeListeners.delete(listener);
  }

  /**
   * 通知子音效监听器
   */
  private notifySmallScenes(): void {
    const ids = Array.from(this.activeSmallScenes);
    this.smallScenesListeners.forEach(l => l(ids));
  }

  /**
   * 通知音量监听器
   */
  private notifyVolume(): void {
    this.volumeListeners.forEach(l => l(this.ambientVolume));
  }

  /**
   * 播放子音效（互动音效）
   */
  async playAmbient(id: string): Promise<void> {
    const scene = SCENES.find(s => s.id === id);
    if (!scene || !scene.filename) {
      console.error('[DualTrackAudio] ❌ 子音效场景未找到:', id);
      return;
    }
    
    const uri = AUDIO_MAP[scene.filename];
    if (!uri) {
      console.error('[DualTrackAudio] ❌ 子音效资源未找到:', scene.filename);
      return;
    }
    
    const soundId = `small_${id}`;
    
    try {
      // 优先使用本地路径
      const localPath = getLocalPath(scene.category, scene.filename);
      const pathToUse = localPath || uri;
      console.log('[DualTrackAudio] 🎵 通过 SFXPlayer 播放子音效:', soundId, 'path:', pathToUse);
      
      await this.sfxPlayer.play(pathToUse, soundId);
      
      this.activeSmallScenes.add(id);
      this.notifySmallScenes();
    } catch (error) {
      console.error('[DualTrackAudio] ❌ playAmbient 失败:', error);
      throw error;
    }
  }

  /**
   * 停止单个子音效
   */
  stopAmbient(id: string): void {
    const soundId = `small_${id}`;
    this.sfxPlayer.stop(soundId);
    this.activeSmallScenes.delete(id);
    this.notifySmallScenes();
  }

  /**
   * 停止所有子音效
   */
  async stopAllAmbient(): Promise<void> {
    this.sfxPlayer.stopAll();
    this.activeSmallScenes.clear();
    this.notifySmallScenes();
  }

  /**
   * 切换子音效
   */
  async toggleAmbience(scene: Scene, targetState: boolean): Promise<void> {
    if (targetState) {
      await this.playAmbient(scene.id);
    } else {
      this.stopAmbient(scene.id);
    }
  }

  /**
   * 获取音量（按 ID）
   */
  getAmbientVolumeById(id: string): number {
    return this.ambientVolume;
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, volume));
    this.notifyVolume();
    
    const currentPlayer = this.activePlayer === 'A' ? this.playerA : this.playerB;
    if (currentPlayer.sound && !currentPlayer.isFading) {
      currentPlayer.sound.setVolume(this.currentVolume);
    }
  }

  /**
   * 添加音频状态监听器（兼容旧接口）
   */
  addAudioStateListener(listener: (state: { id: string | null; state: string }) => void): () => void {
    const wrapper = (dualState: { isPlaying: boolean; sceneId: string | null }) => {
      listener({
        id: dualState.sceneId,
        state: dualState.isPlaying ? 'playing' : 'paused'
      });
    };
    this.listeners.add(wrapper as any);
    return () => this.listeners.delete(wrapper as any);
  }

  /**
   * 添加音量监听器（兼容旧接口）
   */
  addVolumeListener(listener: (vol: number) => void): () => void {
    return () => {};
  }

  /**
   * 添加监听器
   */
  addListener(listener: (state: { isPlaying: boolean; sceneId: string | null }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    const state = {
      isPlaying: this.isPlayingState,
      sceneId: this.currentScene?.id || null
    };
    
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[DualTrackAudio] ❌ 监听器执行失败:', error);
      }
    });
  }
}

export { DualTrackAudioService };
