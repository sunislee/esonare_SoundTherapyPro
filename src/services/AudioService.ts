import { Image, NativeEventEmitter, NativeModules, Platform } from 'react-native';

import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, {
  Capability,
  RepeatMode,
  AppKilledPlaybackBehavior,
  Event,
  State,
} from 'react-native-track-player';
import { SCENES, Scene } from '../constants/scenes';
import ToastUtil from '../utils/ToastUtil';
import { HistoryService } from './HistoryService';
import { AUDIO_MANIFEST, REMOTE_RESOURCE_BASE_URL, IS_GOOGLE_PLAY_VERSION } from '../constants/audioAssets';
import { NotificationService } from './NotificationService';
import { DownloadService } from './DownloadService';
import EngineControl from '../constants/EngineControl';

const { NativeAudioModule } = NativeModules;
const nativeAudioEmitter = NativeAudioModule ? new NativeEventEmitter(NativeAudioModule) : null;

class AudioService {
  private static instance: AudioService | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private isSwitching = false;
  private volume = 1;
  private volumeListeners = new Set<(volume: number) => void>();
  private sleepTimerInterval: ReturnType<typeof setInterval> | null = null;
  private sleepEndTime: number | null = null;
  private initialSleepSeconds: number | null = null;
  private sleepTimerListeners = new Set<(remaining: number | null) => void>();
  private sleepFadeEnabled = false;
  private sleepFadeStarted = false;
  
  private alarmTime: string | null = null;
  private alarmInterval: ReturnType<typeof setInterval> | null = null;
  private alarmListeners = new Set<(time: string | null) => void>();
  private lastSwitchTime = 0;
  private currentScene: Scene | null = null;
  private currentBaseSceneId: string | null = null;
  private isStateLocked = false; // 播放状态锁定开关
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private meteringInterval: ReturnType<typeof setInterval> | null = null;
  private meteringListeners = new Set<(level: number) => void>();
  private mainVolume = 1.0;
  private ambientVolume = 0.4;
  private _isPickingFile = false;
  
  // Ambient volumes per sound ID
  private ambientVolumes: Record<string, number> = {};

  // Unified State Management
  private currentAudioState: { id: string | null; state: State } = { id: null, state: State.None };
  private audioStateListeners = new Set<(state: { id: string | null; state: State }) => void>();
  private smallScenesListeners = new Set<(ids: string[]) => void>();

  // Ambient Layer (Small Scenes)
  private smallScenes = new Map<string, Sound>();
  private backgroundLayers = new Map<string, Sound>(); // 叠加背景音轨道 (听雨、夏夜、观海)
  private ambientSound: Sound | null = null; // Keep for compatibility if needed, but we'll use smallScenes
  private ambientName: string | null = null;

  private constructor() {
    // Enable Mix Mode (Ambient) to allow mixing with other apps or our own TrackPlayer
    (Sound as any).setCategory('Ambient', true);
    
    // Start metering simulation loop
    this.startMeteringSimulation();

    if (nativeAudioEmitter) {
      nativeAudioEmitter.addListener('onAudioStateChange', (event: any) => {
        const { id, state } = event;
        let tpState = State.None;
        switch (state) {
          case 'playing': tpState = State.Playing; break;
          case 'paused': tpState = State.Paused; break;
          case 'stopped': tpState = State.Stopped; break;
          case 'buffering': tpState = State.Buffering; break;
          case 'ended': tpState = State.Stopped; break;
          case 'idle': tpState = State.None; break;
          default: tpState = State.None;
        }
        
        // 核心同步逻辑：如果原生层发现有音频在播放，且 ID 与 JS 层不一致，强制修正
        if (tpState === State.Playing && id && this.currentAudioState.id !== id) {
          console.log(`[AudioService] 发现原生播放残留，强制同步 ID: ${id}`);
          // 查找对应的 Scene 对象以更新 currentScene
          const found = SCENES.find(s => s.id === id);
          if (found) {
            this.currentScene = found;
          }
        }
        
        this.updateAudioState(id, tpState);
      });
      nativeAudioEmitter.addListener('onAudioError', (event: any) => {
        // console.error('Native Audio Error:', event.error);
        ToastUtil.error('音频播放出错');
      });
    }
  }

  // --- Superpowered Logic Layer ---
  
  /**
   * Initialize the Superpowered Audio Engine
   */
  public async initializeSuperpowered(): Promise<boolean> {
    if (!NativeAudioModule || !NativeAudioModule.initialize) {
      console.warn('[AudioService] Superpowered Native Module not available, using Mock mode');
      return true;
    }
    try {
      return await NativeAudioModule.initialize(44100, 512);
    } catch (e) {
      console.error('[AudioService] Failed to initialize Superpowered', e);
      return true;
    }
  }

  /**
   * 启动环境音混合 (包含自动下载逻辑与重试机制)
   */
  public async startAmbientWithDownload(id: string, retries = 3): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] startAmbientWithDownload blocked: engine not allowed');
      return;
    }
    
    let attempt = 0;
    while (attempt < retries) {
      try {
        console.log(`[AudioService] 尝试加载环境音 (尝试 ${attempt + 1}/${retries}): ${id}`);
        
        // 检查资源状态
        const asset = AUDIO_MANIFEST.find(a => a.id === id);
        if (!asset) {
          throw new Error(`未找到 ID 为 ${id} 的资源配置`);
        }
        
        const remoteUrl = `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;
        const localPath = await DownloadService.getLocalPath(id);
        
        let targetPath = localPath;
        
        // 1. 检查本地资源
        if (localPath) {
          const canAccess = await this.checkFileAccess(localPath);
          if (canAccess) {
            console.log(`[AudioService] 资源就绪，直接加载: ${localPath}`);
          } else {
            // 2. 资源不存在，触发下载
            console.log(`[AudioService] 资源缺失或损坏，开始下载: ${id}`);
            const downloadedPath = await DownloadService.downloadAudio(id, remoteUrl);
            if (!downloadedPath) {
              throw new Error('下载失败');
            }
            targetPath = downloadedPath;
          }
        } else {
          throw new Error('无法获取本地路径');
        }

        // 3. 加载到原生引擎 (轨道 1 预留给主氛围音)
        if (!targetPath) {
          throw new Error('目标路径无效');
        }
        const success = await this.loadTrack(targetPath, 1);
        if (success) {
          await this.startMixing();
          console.log(`[AudioService] 环境音加载并播放成功: ${id}`);
          return; // 成功后退出
        } else {
          throw new Error('原生加载失败');
        }
        
      } catch (e) {
        attempt++;
        console.error(`[AudioService] 第 ${attempt} 次尝试失败:`, e);
        if (attempt >= retries) {
          ToastUtil.error(`环境音加载失败，请检查网络`);
        } else {
          // 指数退避重试
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  /**
   * Load an audio track for mixing
   */
  public async loadTrack(filePath: string, trackId: number): Promise<boolean> {
    if (!NativeAudioModule || !NativeAudioModule.loadAudioFile) {
      console.log(`[AudioService] Mock: Loaded track ${trackId} from ${filePath}`);
      return true;
    }
    try {
      return await NativeAudioModule.loadAudioFile(filePath, trackId);
    } catch (e) {
      console.error(`[AudioService] Failed to load track ${trackId}`, e);
      return true;
    }
  }

  /**
   * Start the mixing process
   */
  public async startMixing(): Promise<void> {
    if (!NativeAudioModule || !NativeAudioModule.startMixing) {
      console.log('[AudioService] Mock: Started mixing');
      this.updateAudioState(this.currentAudioState.id, State.Playing);
      return;
    }
    try {
      await NativeAudioModule.startMixing();
    } catch (e) {
      console.error('[AudioService] Failed to start mixing', e);
    }
  }

  /**
   * Stop the mixing process
   */
  public async stopMixing(): Promise<void> {
    if (!NativeAudioModule || !NativeAudioModule.stopMixing) {
      console.log('[AudioService] Mock: Stopped mixing');
      this.updateAudioState(this.currentAudioState.id, State.Paused);
      return;
    }
    try {
      await NativeAudioModule.stopMixing();
    } catch (e) {
      console.error('[AudioService] Failed to stop mixing', e);
    }
  }

  /**
   * Set volume for a specific track (dB)
   */
  public async setTrackVolume(trackId: number, volumeDb: number): Promise<void> {
    if (!NativeAudioModule || !NativeAudioModule.setVolume) {
      console.log(`[AudioService] Mock: Set track ${trackId} volume to ${volumeDb}`);
      return;
    }
    try {
      await NativeAudioModule.setVolume(trackId, volumeDb);
    } catch (e) {
      console.error(`[AudioService] Failed to set volume for track ${trackId}`, e);
    }
  }

  /**
   * Set master volume (dB)
   */
  public async setMasterVolume(volumeDb: number): Promise<void> {
    if (!NativeAudioModule || !NativeAudioModule.setMasterVolume) {
      console.log(`[AudioService] Mock: Set master volume to ${volumeDb}`);
      return;
    }
    try {
      await NativeAudioModule.setMasterVolume(volumeDb);
    } catch (e) {
      console.error('[AudioService] Failed to set master volume', e);
    }
  }

  /**
   * Check if a local file exists and is accessible for Native layer
   */
  public async checkFileAccess(filePath: string): Promise<boolean> {
    if (!NativeAudioModule || !NativeAudioModule.checkFileAccess) {
      return false;
    }
    try {
      return await NativeAudioModule.checkFileAccess(filePath);
    } catch (e) {
      console.error('[AudioService] Failed to check file access', e);
      return false;
    }
  }

  /**
   * Apply low pass filter to a track
   */
  public async setLowPass(trackId: number, frequency: number, enabled: boolean): Promise<void> {
    if (!NativeAudioModule) return;
    try {
      // Note: Removed check for specific methods to avoid interface mismatch during transition
      if (NativeAudioModule.enableLowPassFilter) {
        await NativeAudioModule.enableLowPassFilter(trackId, enabled);
      }
      if (enabled && NativeAudioModule.setLowPassFilter) {
        await NativeAudioModule.setLowPassFilter(trackId, frequency);
      }
    } catch (e) {
      console.error(`[AudioService] Failed to apply filter to track ${trackId}`, e);
    }
  }

  // --- End Superpowered Logic Layer ---

  public addAudioStateListener(listener: (state: { id: string | null; state: State }) => void): () => void {
    this.audioStateListeners.add(listener);
    listener(this.currentAudioState);
    return () => {
      this.audioStateListeners.delete(listener);
    };
  }

  /**
   * 注册音量能量监听器 (0.0 - 1.0)
   */
  public addMeteringListener(listener: (level: number) => void) {
    this.meteringListeners.add(listener);
    return () => {
      this.meteringListeners.delete(listener);
    };
  }

  private startMeteringSimulation() {
    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
    }

    let phase = 0;
    // 每 60ms 产生一次能量波动数据，更平滑
    this.meteringInterval = setInterval(() => {
      if (this.currentAudioState.state === State.Playing) {
        // 使用正弦波叠加随机噪声，模拟更自然的音乐能量起伏
        phase += 0.2;
        const sineWave = Math.sin(phase) * 0.15;
        const randomVariation = Math.random() * 0.15;
        
        // 映射到 0.1 - 0.4 的增量区间
        const level = 0.2 + sineWave + randomVariation;
        
        this.meteringListeners.forEach(listener => listener(Math.max(0, Math.min(0.5, level))));
      } else {
        // 停止播放时能量归零
        this.meteringListeners.forEach(listener => listener(0));
      }
    }, 60);
  }

  private updateAudioState(id: string | null, state: State) {
    // 状态锁定逻辑：如果在 switchSoundscape 期间收到非 Error 的暂停信号，直接拦截
    if (this.isStateLocked && state === State.Paused) {
      console.log('🛡️ [AudioService] 状态锁定中，拦截外部/自动暂停信号');
      return;
    }

    // Only update if changed
    if (this.currentAudioState.id !== id || this.currentAudioState.state !== state) {
        this.currentAudioState = { id, state };
        this.audioStateListeners.forEach(l => l(this.currentAudioState));

        // 同步通知栏状态
        if (this.currentScene) {
          NotificationService.updateNotification(this.currentScene, state).catch(() => {});
        }
    }
  }

  public getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  public isPlaying(): boolean {
    return this.currentAudioState.state === State.Playing;
  }

  public setPickingFile(isPicking: boolean) {
    if (isPicking) {
      this._isPickingFile = true;
    } else {
      // 延迟 500ms 设为 false，确保生命周期事件先触发完
      setTimeout(() => {
        this._isPickingFile = false;
        console.log('[AudioService] isPickingFile set to false');
      }, 500);
    }
  }

  public isPickingFile(): boolean {
    return this._isPickingFile;
  }

  public getCurrentBaseSceneId(): string | null {
    return this.currentBaseSceneId;
  }

  public getAssetById(id: string) {
    return AUDIO_MANIFEST.find(a => a.id === id);
  }

  /**
   * 播放小场景音效
   */
  private async playSmallScene(scene: Scene): Promise<void> {
    const asset = AUDIO_MANIFEST.find(a => a.id === scene.id);
    if (!asset) return;

    // 获取音量
    const storedVol = await this.getStoredVolume(scene.id);
    const volume = storedVol || 0.4;
    this.ambientVolumes[scene.id] = volume;

    const localPath = await DownloadService.getLocalPath(scene.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    
    const finalUrl = (exists && localPath) ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;

    // Android 远程播放地址补丁：强制使用 http 协议并关闭 https
    const safeUrl = (Platform.OS === 'android' && !exists && finalUrl && finalUrl.startsWith('https://')) 
      ? finalUrl.replace('https://', 'http://') 
      : finalUrl;

    console.log(`🔊 [AudioService] playSmallScene: ${scene.id}, URL: ${safeUrl}`);

    return new Promise((resolve) => {
      if (!safeUrl) {
        console.warn(`[AudioService] No valid URL for scene: ${scene.id}`);
        resolve();
        return;
      }

      // Android 专用配置：关闭 SSL 验证，允许混合内容
      const soundOptions = Platform.OS === 'android' ? {
        streaming: true,
        loadIncrementally: true,
      } : {};

      const sound = new Sound(safeUrl, '', (error) => {
        if (error) {
          console.warn(`[SmallScene] Load failed for ${scene.id}:`, error, 'URL:', safeUrl);
          
          // 如果是 https 导致的错误且尚未尝试 http，自动重试
          if (Platform.OS === 'android' && !exists && safeUrl && safeUrl.startsWith('http://') && finalUrl && !finalUrl.startsWith('http://')) {
             console.log(`[AudioService] Retrying ${scene.id} with original URL: ${finalUrl}`);
             const retrySound = new Sound(finalUrl, '', (retryError) => {
               if (retryError) {
                 console.warn(`[SmallScene] Final Load failed for ${scene.id}:`, retryError);
                 resolve();
               } else {
                 this.handleSoundLoaded(retrySound, scene, resolve);
               }
             });
          } else {
            resolve();
          }
          return;
        }
        
        this.handleSoundLoaded(sound, scene, resolve);
      });
    });
  }

  /**
   * 提取 Sound 加载后的处理逻辑
   */
  private async handleSoundLoaded(sound: Sound, scene: Scene, resolve: () => void) {
    const storedVol = await this.getStoredVolume(scene.id);
    const volume = storedVol || 0.4;
    
    // 确保无缝循环播放：针对远程 .m4a 优化
    sound.setNumberOfLoops(-1);
    if (Platform.OS === 'android') {
      sound.setSpeed(1.0);
    }
    sound.setVolume(0); // 从 0 开始淡入
    sound.play((success) => {
      if (!success) {
        console.warn(`[SmallScene] Playback failed for ${scene.id}`);
      }
    });
    
    this.smallScenes.set(scene.id, sound);
    this.emitSmallScenes();
    
    // 执行淡入
    this.fadeSound(sound, volume, 1000).catch(() => {});
    
    // 兼容性设置
    if (!this.ambientSound) {
      this.ambientSound = sound;
      this.ambientName = scene.id;
      this.ambientVolume = volume;
    }
    
    resolve();
  }

  /**
   * 核心 Toggle 逻辑：区分大场景和小场景
   */
  /**
   * 平滑调整 react-native-sound 的音量
   */
  private fadeSound(sound: Sound, targetVolume: number, duration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      const startVolume = (sound as any)._volume || 0;
      const steps = 16;
      const interval = duration / steps;
      const stepValue = (targetVolume - startVolume) / steps;
      let currentStep = 0;

      const timer = setInterval(() => {
        currentStep++;
        const newVol = startVolume + stepValue * currentStep;
        sound.setVolume(Math.max(0, Math.min(1, newVol)));

        if (currentStep >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  }

  /**
   * 平滑调整 TrackPlayer 的音量
   */
  private async fadeTrackPlayer(targetVolume: number, duration: number = 800): Promise<void> {
    const steps = 16;
    const interval = duration / steps;
    const currentVolume = await TrackPlayer.getVolume();
    const stepValue = (targetVolume - currentVolume) / steps;

    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, interval));
      const newVol = currentVolume + stepValue * i;
      await TrackPlayer.setVolume(Math.max(0, Math.min(1, newVol)));
    }
  }

  /**
   * 统一切换氛围音（小场景）的方法，支持同步日志
   * @param scene 场景对象
   * @param fromSource 调用来源标识（用于日志）
   */
  public async toggleAmbience(scene: Scene, fromSource: 'Floating Icon' | 'Bottom List' = 'Bottom List'): Promise<void> {
    console.log(`🎵 [Ambience Sync] Playing: ${scene.id} from Source: ${fromSource}`);
    
    // 强制刷新 activeSmallSceneIds，确保 UI 状态同步
    this.emitSmallScenes();
    
    // 区分短音效(SmallScene)与叠加背景音(Background Layer)
    // 将 围炉 (life_fireplace) 也加入背景层，以获得更好的混音和重试逻辑
    const backgroundLayerIds = ['interactive_rain', 'life_summer', 'interactive_ocean', 'life_fireplace'];
    
    if (backgroundLayerIds.includes(scene.id)) {
      return this.toggleBackgroundLayer(scene);
    }
    
    return this.toggleScene(scene);
  }

  /**
   * 切换叠加背景音 (听雨、夏夜、观海)
   */
  private async toggleBackgroundLayer(scene: Scene): Promise<void> {
    const existingSound = this.backgroundLayers.get(scene.id);
    console.log(`[AudioService] toggleBackgroundLayer: ${scene.id}, currentlyActive: ${!!existingSound}`);
    
    if (existingSound) {
      console.log('⏹️ [AudioService] Fading out background layer:', scene.id);
      await this.fadeSound(existingSound, 0, 800);
      existingSound.stop();
      existingSound.release();
      this.backgroundLayers.delete(scene.id);
      this.smallScenes.delete(scene.id); // 同步状态
      this.emitSmallScenes();
    } else {
      console.log('🚀 [AudioService] Starting background layer:', scene.id);
      // 复用 playSmallScene 的加载逻辑，但存入 backgroundLayers，并增加重试逻辑
      await this.playBackgroundLayerWithRetry(scene);
    }
  }

  private async playBackgroundLayerWithRetry(scene: Scene, retryCount = 0): Promise<void> {
    try {
      await this.playBackgroundLayer(scene);
    } catch (error) {
      if (retryCount < 1) {
        console.log(`🔄 [AudioService] BackgroundLayer load failed, retrying in 2s... (${scene.id})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.playBackgroundLayerWithRetry(scene, retryCount + 1);
      }
      console.error(`❌ [AudioService] BackgroundLayer final load failed: ${scene.id}`, error);
    }
  }

  private async playBackgroundLayer(scene: Scene): Promise<void> {
    const asset = AUDIO_MANIFEST.find(a => a.id === scene.id);
    if (!asset) return;

    const storedVol = await this.getStoredVolume(scene.id);
    const volume = storedVol || 0.5; // 背景层默认音量稍高
    this.ambientVolumes[scene.id] = volume;

    const localPath = await DownloadService.getLocalPath(scene.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    
    // 强制硬编码 URL 逻辑
    let finalUrl = '';
    const hardcodedUrls: Record<string, string> = {
      'interactive_ocean': `${REMOTE_RESOURCE_BASE_URL}base/ocean.mp3`,
      'life_summer': `${REMOTE_RESOURCE_BASE_URL}base/summer_fireworks.m4a`,
      'interactive_rain': `${REMOTE_RESOURCE_BASE_URL}base/final_healing_rain.m4a`,
      'life_fireplace': `${REMOTE_RESOURCE_BASE_URL}base/fire.mp3`
    };

    if (hardcodedUrls[scene.id]) {
      finalUrl = hardcodedUrls[scene.id];
      console.log(`[AudioService] Using hardcoded URL for ${scene.id}: ${finalUrl}`);
    } else {
      finalUrl = (exists && localPath) ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;
    }

    const safeUrl = (Platform.OS === 'android' && !exists && finalUrl && finalUrl.startsWith('https://')) 
      ? finalUrl.replace('https://', 'http://') 
      : finalUrl;

    return new Promise((resolve, reject) => {
      console.log(`[AudioService] Initializing Sound for BackgroundLayer: ${scene.id}, URL: ${safeUrl}`);
      
      // Android 专用配置：关闭 SSL 验证，允许混合内容
      const soundOptions = Platform.OS === 'android' ? {
        streaming: true,
        loadIncrementally: true,
      } : {};

      const sound = new Sound(safeUrl, '', (error) => {
        if (error) {
          console.warn(`[BackgroundLayer] Load failed: ${scene.id}`, error);
          reject(error);
          return;
        }
        
        console.log(`✅ [AudioService] BackgroundLayer Sound loaded successfully: ${scene.id}`);
        sound.setNumberOfLoops(-1);
        sound.setVolume(0.1); // 初始音量不为 0
        sound.play();
        
        console.log(`🎵 [AudioService] BackgroundLayer Sound playing: ${scene.id} at volume 0.1, starting fade to ${volume}`);
        
        this.backgroundLayers.set(scene.id, sound);
        this.smallScenes.set(scene.id, sound); // 为了让 UI 状态同步
        this.emitSmallScenes();
        
        this.fadeSound(sound, volume, 1500).catch(() => {});
        resolve();
      });
    });
  }

  public async toggleScene(scene: Scene): Promise<void> {
    if (scene.isBaseScene) {
      // 大场景逻辑
      const state = await TrackPlayer.getState();
      const activeTrack = await TrackPlayer.getActiveTrack();
      
      if (state === State.Playing && activeTrack?.id === scene.id) {
        // 如果正在播放当前大场景，则平滑暂停
        console.log('⏸️ [AudioService] Fading out base scene:', scene.id);
        await this.fadeTrackPlayer(0, 800);
        await this.pause();
      } else if (activeTrack?.id === scene.id) {
        // 如果轨道已经是当前场景，只是暂停了，那就直接继续播放
        console.log('▶️ [AudioService] Resuming base scene:', scene.id);
        await this.play();
        await this.fadeTrackPlayer(1.0, 1000);
      } else {
        // 开启新大场景：不再强制停止所有小场景，支持全局氛围共存
        console.log('🚀 [AudioService] Starting new base scene:', scene.id);
        
        // 如果当前有 TrackPlayer 在播放，先淡出
        const currentState = await TrackPlayer.getState();
        if (currentState === State.Playing) {
          await this.fadeTrackPlayer(0, 500);
        }

        // 仅停止 TrackPlayer，保留 smallScenes (氛围音)
        await TrackPlayer.pause();
        await TrackPlayer.reset();

        this.currentBaseSceneId = scene.id;
        
        // 开启新大场景并直接播放（取消渐变，确保声音第一时间响起）
        await this.switchSoundscape(scene, true);
        // await this.fadeTrackPlayer(1.0, 1000); 暂时封印渐变，响应用户“响起来”的指令
      }
    } else {
      // 小场景逻辑
      const existingSound = this.smallScenes.get(scene.id);
      if (existingSound) {
        // 已在播放，则淡出后停止
        console.log('⏹️ [AudioService] Fading out small scene:', scene.id);
        await this.fadeSound(existingSound, 0, 800);
        existingSound.stop();
        existingSound.release();
        this.smallScenes.delete(scene.id);
        this.emitSmallScenes();
        
        if (this.ambientName === scene.id) {
          this.ambientSound = null;
          this.ambientName = null;
        }
        // 小场景停止时不干扰主场景状态
        /*
        const tpState = await TrackPlayer.getState();
        if (this.smallScenes.size === 0 && tpState !== State.Playing) {
          this.updateAudioState(null, State.Stopped);
        }
        */
      } else {
        // 未在播放，则开启（带淡入）
        await this.playSmallScene(scene);
      }
    }
  }

  public addSmallScenesListener(listener: (ids: string[]) => void): () => void {
    this.smallScenesListeners.add(listener);
    listener(Array.from(this.smallScenes.keys()));
    return () => {
      this.smallScenesListeners.delete(listener);
    };
  }

  private emitSmallScenes() {
    const ids = Array.from(this.smallScenes.keys());
    this.smallScenesListeners.forEach((l) => l(ids));
  }

  public getActiveSmallSceneIds(): string[] {
    return Array.from(this.smallScenes.keys());
  }

  public getCurrentState(): State {
    return this.currentAudioState.state;
  }

  public async setAmbient(id: string | null): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] setAmbient blocked: engine not allowed');
      return;
    }

    // 1. 暴力同步清理旧句柄，不留任何叠音空间
    if (this.ambientSound) {
      console.log('🔴 PHYSICAL_DEBUG: FINAL_NUCLEAR_FIX - Destroying old ambient sound');
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }
    
    // 2. 环境音不再强制停掉主播放器，支持共存
    console.log('🔊 [AudioService] setAmbient: Playing ambient alongside main scene');
    // await TrackPlayer.pause(); // 移除互斥逻辑

    if (!id || id === 'none') {
      this.ambientName = null;
      this.ambientVolume = 0;
      this.emitVolume();
      return;
    }

    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) {
      console.warn(`[Ambient] Asset not found for id: ${id}`);
      return;
    }

    // 独立音量记忆恢复
    const storedVol = await this.getStoredVolume(id);
    this.ambientVolume = storedVol;
    this.ambientName = id;
    this.ambientVolumes[id] = storedVol;
    this.emitVolume();

    const localPath = await DownloadService.getLocalPath(asset.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    const finalUrl = exists ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;

    // 实时日志监控
    console.log('🔴 PHYSICAL_DEBUG: Releasing old sound and creating NEW one for ID:', id);

    return new Promise((resolve) => {
      const sound = new Sound(finalUrl, '', (error) => {
        if (error) {
          console.warn(`[Ambient] Load failed for ${id}:`, error);
          // 不再干扰主状态
          // this.updateAudioState(null, State.Stopped);
          resolve();
          return;
        }
        
        // 双重保险：加载完成后再次确认没有新的播放指令下达
        if (this.ambientName !== id) {
          console.log('🔴 PHYSICAL_DEBUG: Concurrent load detected, releasing stale sound:', id);
          sound.release();
          resolve();
          return;
        }

        this.ambientSound = sound;
        // 确保无缝循环播放：针对远程 .m4a 优化
        sound.setNumberOfLoops(-1);
        if (Platform.OS === 'android') {
          sound.setSpeed(1.0);
        }
        sound.setVolume(this.ambientVolume);
        sound.play((success) => {
          if (!success) console.warn(`[Ambient] Playback failed for ${id}`);
        });
        
        resolve();
      });
    });
  }

  /**
   * 物理层面强行释放所有环境音实例
   */
  public async forceReleaseAllAmbient(): Promise<void> {
    console.log('🔴 PHYSICAL_DEBUG: FINAL_NUCLEAR_FIX - forceReleaseAllAmbient');
    
    // 强制同步销毁
    if (this.ambientSound) {
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }
    
    this.ambientName = null;
  }

  /**
   * 播放环境音 (别名，用于统一接口)
   */
  public async playAmbient(id: string): Promise<void> {
    await this.forceReleaseAllAmbient();
    return this.setAmbient(id);
  }

  public updateAmbientVolume(volume: number) {
    // Defensive check
    let finalVolume = volume < 0.01 ? 0 : Math.max(0.001, volume);
    
    // 节流处理：音量变化极小时跳过
    if (Math.abs(this.ambientVolume - finalVolume) < 0.005 && finalVolume !== 0 && finalVolume !== 1) {
      return;
    }
    
    this.ambientVolume = finalVolume;
    
    if (this.ambientName) {
      this.ambientVolumes[this.ambientName] = finalVolume;
      // 异步保存
      AsyncStorage.setItem(`@ambient_volume_${this.ambientName}`, String(finalVolume)).catch(() => {});
    }

    // 同步给原生音频实例
    if (this.ambientSound) {
      this.ambientSound.setVolume(finalVolume);
    }
    
    this.emitVolume();
  }

  public getAmbientVolumeById(id: string): number {
    return this.ambientVolumes[id] ?? 0.4;
  }

  public async getStoredVolume(name: string): Promise<number> {
      try {
          const savedVol = await AsyncStorage.getItem(`@ambient_volume_${name}`);
          return savedVol ? parseFloat(savedVol) : 0.4;
      } catch {
          return 0.4;
      }
  }

  public async refreshNotification() {
    if (this.currentScene) {
      await NotificationService.updateNotification(this.currentScene, this.currentAudioState.state);
    }
  }

  private updateDucking(isDucking: boolean) {
    // 暴力阻断：禁用所有自动音量调节（Ducking）
    // const targetVolume = isDucking ? 0.2 : this.volume;
    // TrackPlayer.setVolume(targetVolume).catch(() => {});
  }

  /**
   * 彻底销毁音频服务，释放所有资源
   */
  public async dispose(): Promise<void> {
    console.log('[AudioService] Disposing all resources...');
    try {
      // 1. 停止所有定时器
      if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
      if (this.alarmInterval) clearInterval(this.alarmInterval);
      if (this.fadeInterval) clearInterval(this.fadeInterval);
      if (this.meteringInterval) clearInterval(this.meteringInterval);
      
      this.sleepTimerInterval = null;
      this.alarmInterval = null;
      this.fadeInterval = null;
      this.meteringInterval = null;

      // 2. 停止并释放音频实例
      if (this.ambientSound) {
        this.ambientSound.stop();
        this.ambientSound.release();
        this.ambientSound = null;
      }

      // 3. 停止原生混合引擎
      await this.stopMixing();
      
      // 4. 清理监听器
      this.volumeListeners.clear();
      this.sleepTimerListeners.clear();
      this.alarmListeners.clear();
      this.meteringListeners.clear();
      this.audioStateListeners.clear();

      console.log('[AudioService] Disposal complete.');
    } catch (e) {
      console.error('[AudioService] Error during disposal:', e);
    }
  }

  /**
   * 设置主场景音量
   */
  public setMainVolume(volume: number) {
    // Defensive check: if volume < 0.01, set to 0. Otherwise use 0.001 as safety floor.
    let finalVolume = volume < 0.01 ? 0 : Math.max(0.001, volume);
    
    // 节流处理：音量变化极小时跳过，减少原生模块调用频率
    if (Math.abs(this.mainVolume - finalVolume) < 0.005 && finalVolume !== 0) {
      return;
    }
    
    this.mainVolume = finalVolume;
    
    // 异步调用原生模块，防止阻塞 JS 线程
    const dbValue = this.linearToDb(this.mainVolume);
    setTimeout(() => {
      this.setTrackVolume(0, dbValue).catch(async () => {
        if (this.mainVolume === 0) {
          await this.setTrackVolume(0, this.linearToDb(0.0001));
        }
      });
    }, 0);
  }

  /**
   * 线性音量转分贝 (简易版)
   */
  private linearToDb(linear: number): number {
    if (linear <= 0) return -100;
    return 20 * Math.log10(linear);
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
      console.log('--- [CRITICAL] NEW AUDIOSERVICE INSTANCE CREATED: ' + Math.random() + ' ---');
    }
    return AudioService.instance;
  }

  public async setSleepTimer(minutes: number): Promise<void> {
    this.clearSleepTimer();

    if (minutes <= 0) return;

    this.initialSleepSeconds = minutes * 60;
    try {
      const fadePref = await AsyncStorage.getItem('@fade_out_enabled');
      this.sleepFadeEnabled = fadePref === 'true';
    } catch (e) {
      this.sleepFadeEnabled = false;
    }
    this.sleepFadeStarted = false;

    const durationMs = minutes * 60 * 1000;
    this.sleepEndTime = Date.now() + durationMs;
    
    // Initial emit
    this.emitSleepTimer();

    ToastUtil.success(`定时器已设置：${minutes}分钟后停止播放`);

    // Start heartbeat interval
    this.sleepTimerInterval = setInterval(async () => {
      const remaining = this.getRemainingSeconds();
      
      this.emitSleepTimer();

      if (
        remaining !== null &&
        remaining > 0 &&
        this.sleepFadeEnabled &&
        remaining <= 30 &&
        !this.sleepFadeStarted
      ) {
        this.sleepFadeStarted = true;
        // 隔离：注释掉所有 fadeOutStop 调用
        // this.fadeOutStop(remaining * 1000).catch(() => {});
      }

      if (remaining !== null && remaining <= 0) {
        this.clearSleepTimer(); // Stop timer first
        if (!this.sleepFadeEnabled) {
          try {
            // 隔离：注释掉所有 fadeOutStop 调用
            // await this.fadeOutStop(3000);
            await this.pause();
          } catch (e) {}
        }
        ToastUtil.info('定时结束，已停止播放');
      }
    }, 1000);
  }

  public clearSleepTimer(): void {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    this.sleepFadeStarted = false;
    this.sleepEndTime = null;
    this.initialSleepSeconds = null;
    this.emitSleepTimer();
  }

  public getInitialSleepSeconds(): number | null {
    return this.initialSleepSeconds;
  }

  public getSleepEndTime(): number | null {
    return this.sleepEndTime;
  }

  public setAlarm(time: string) {
    this.alarmTime = time;
    this.emitAlarm();
    this.startAlarmCheck();
    ToastUtil.success(`闹钟已设置: ${time}`);
  }

  public cancelAlarm() {
    this.alarmTime = null;
    this.emitAlarm();
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    ToastUtil.info('闹钟已取消');
  }

  public getAlarmTime(): string | null {
    return this.alarmTime;
  }

  public addAlarmListener(listener: (time: string | null) => void): () => void {
    this.alarmListeners.add(listener);
    listener(this.alarmTime);
    return () => {
      this.alarmListeners.delete(listener);
    };
  }

  private emitAlarm() {
    this.alarmListeners.forEach((l) => l(this.alarmTime));
  }

  private startAlarmCheck() {
    if (this.alarmInterval) clearInterval(this.alarmInterval);
    this.alarmInterval = setInterval(() => {
      if (!this.alarmTime) return;
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const current = `${h}:${m}`;
      const seconds = now.getSeconds();
      
      if (current === this.alarmTime && seconds === 0) {
        this.triggerAlarm();
      }
    }, 1000);
  }

  private async triggerAlarm() {
    const ALARM_SCENE = new Scene({
      id: 'morning-alarm',
      title: '清晨唤醒',
      audioUrl: '',
      audioFile: null,
      backgroundUrl: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8',
      primaryColor: '#F5A623',
      audioSource: 'life_fire_pure',
      baseVolume: 1.0,
      backgroundSource: { uri: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8' },
      category: 'Life',
      isBaseScene: true
    });

    try {
      await this.switchSoundscape(ALARM_SCENE);
      ToastUtil.success('早安！新的一天开始了');
      // 触发后是否自动取消？通常闹钟是每天的，这里暂时保留
    } catch (e) {
      console.error('Alarm trigger failed', e);
    }
  }

  private getRemainingSeconds(): number | null {
    if (!this.sleepEndTime) return null;
    return Math.max(0, Math.ceil((this.sleepEndTime - Date.now()) / 1000));
  }

  public addSleepTimerListener(listener: (remaining: number | null) => void): () => void {
    this.sleepTimerListeners.add(listener);
    // Initial emission
    const remaining = this.getRemainingSeconds();
    listener(remaining);
    
    return () => {
      this.sleepTimerListeners.delete(listener);
    };
  }

  private emitSleepTimer() {
    const remaining = this.getRemainingSeconds();
    this.sleepTimerListeners.forEach((listener) => listener(remaining));
  }

  private async ensureSetup(): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] Engine not allowed yet, skipping setup');
      return;
    }
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      try {
        if (Platform.OS === 'android') {
          // console.log('📡 [检查] NativeAudioModule 接口列表:', Object.keys(NativeModules.NativeAudioModule || {}));
        }
        // Double check initialization before calling setupPlayer
        try {
          await TrackPlayer.setupPlayer({ 
            autoHandleInterruptions: true,
            waitForBuffer: true,
          });
        } catch (setupError: any) {
          // If player is already initialized, we can ignore this error
          // The error message can vary, so we check for common substrings
          const msg = setupError.message || "";
          if (msg.includes('already initialized') || msg.includes('already been initialized')) {
            // console.log('[AudioService] TrackPlayer already initialized, skipping setup');
          } else {
            throw setupError;
          }
        }

        await this.withTimeout(
          TrackPlayer.updateOptions({
            android: {
              appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
            },
            capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
            compactCapabilities: [Capability.Play, Capability.Pause],
          }),
          5000,
          'updateOptions'
        );

        // 初始化通知服务
        await NotificationService.setup();

        // 自动化 URL 验证 (GitHub/Gitee 双源巡检)
        console.log('🚀 [URL VALIDATION] Current Source:', IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE');
        const oceanUrl = `${REMOTE_RESOURCE_BASE_URL}base/ocean.mp3`;
        const matchUrl = `${REMOTE_RESOURCE_BASE_URL}interactive/match_strike.wav`;
        console.log('🔗 [VERIFY] nature_ocean:', oceanUrl);
        console.log('🔗 [VERIFY] interactive_match:', matchUrl);

        // 止损隔离：初始化时强行清空所有环境音残留
        await this.forceReleaseAllAmbient();

        this.isInitialized = true;

        // 封印：移除错误自动重连逻辑，避免死循环
        TrackPlayer.addEventListener(Event.PlaybackError, async (error) => {
          // console.error('Playback Error detected:', error);
          // ToastUtil.error('播放出错，正在尝试重连');
          // try {
          //   await this.setupPlayer();
          // } catch (reInitError) {
          //   console.error('Failed to re-initialize after error:', reInitError);
          // }
        });

        // 封印：移除所有 PlaybackState 监听触发的副作用
        // TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
        //   if (Platform.OS !== 'android') {
        //      const state = (event as any).state;
        //      this.updateAudioState(this.currentAudioState.id, state);
        //   }
        // });
      } catch (e) {
        console.error('TrackPlayer setup failed or timed out:', e);
        // Do not set initialized to true if failed
        throw e;
      }
    })();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Audio Timeout: ${operationName} exceeded ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([
      promise.then((result) => {
        clearTimeout(timeoutHandle);
        return result;
      }),
      timeoutPromise,
    ]);
  }

  public async setupPlayer(): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] setupPlayer blocked: engine not allowed');
      return;
    }
    this.isInitialized = false;
    this.initPromise = null;
    await this.ensureSetup();
  }

  public async loadAudio(initialSoundscape?: Scene, autoPlay: boolean = true): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] loadAudio blocked: engine not allowed');
      return;
    }
    
    try {
      await this.ensureSetup();
      this.clearActiveFade();
      
      const soundscape = initialSoundscape || SCENES[0];
      
      this.currentScene = soundscape; 
      this.currentBaseSceneId = soundscape.id;
      
      console.log('🎵 [AudioService] loadAudio:', soundscape.id, 'URL:', soundscape.audioUrl);
      
      let resolvedUri = '';
      
      // 1. 优先检查本地下载
      const localPath = await DownloadService.getLocalPath(soundscape.id);
      let localFileValid = false;
      if (localPath) {
        try {
          localFileValid = await RNFS.exists(localPath);
          if (localFileValid) {
            // 强制 URL 格式：使用 file:/// (三个斜杠)
            resolvedUri = `file://${localPath}`; 
            console.log('📂 [AudioService] Using cached local file (forced prefix):', resolvedUri);
          }
        } catch (e) {
          console.warn('[AudioService] Local file check failed:', e);
        }
      }

      // 2. 兜底：如果本地文件不存在或校验失败，使用 scenes.ts 中定义的远程 URL
      if (!resolvedUri || !localFileValid) {
        console.log('🌐 [AudioService] Local file missing, using remote URL:', soundscape.audioUrl);
        resolvedUri = soundscape.audioUrl;
      }

      // 3. 极度兜底：如果远程 URL 也没有，尝试从 AUDIO_MANIFEST 中寻找 filename 并拼接
      if (!resolvedUri) {
        console.log('📦 [AudioService] Remote URL missing, falling back to manifest for:', soundscape.id);
        const manifestItem = AUDIO_MANIFEST.find(item => item.id === soundscape.id);
        if (manifestItem) {
          resolvedUri = `${REMOTE_RESOURCE_BASE_URL}${manifestItem.filename}`;
          console.log('🔗 [AudioService] Reconstructed URL from manifest:', resolvedUri);
        }
      }

      // 4. 内置资源兜底
      if (!resolvedUri) {
        console.log('📦 [AudioService] Reconstructed URL missing, falling back to assets for:', soundscape.id);
        try {
          const resolved = Image.resolveAssetSource(soundscape.audioFile);
          resolvedUri = resolved?.uri ?? '';
          
          if (Platform.OS === 'android' && resolvedUri && !resolvedUri.includes('://')) {
            resolvedUri = `android.resource://com.soundtherapyapp/raw/${resolvedUri}`;
          }
        } catch (e) {
          console.error('❌ [AudioService] Fallback resolveAssetSource failed:', e);
        }
      }

      if (!resolvedUri) {
        console.error('CRITICAL: No URL found for scene:', soundscape.id);
        const msg = 'loadAudio 失败: 无法解析场景音频资源';
        ToastUtil.error(msg);
        return;
      }

      // Add to history
      HistoryService.addToHistory(soundscape.id);

      // 统一使用 TrackPlayer，抛弃 NativeAudioModule 原生控制
      await TrackPlayer.reset();
      console.log('Final Audio URL (loadAudio):', resolvedUri);
      await TrackPlayer.add({
        id: soundscape.id,
        url: resolvedUri,
        title: soundscape.title,
        artist: 'Sound Therapy',
        artwork: soundscape.backgroundUrl,
        isLiveStream: false,
      });

      await TrackPlayer.setVolume(1.0); // 必须在 add 后紧跟 setVolume(1.0)
      await TrackPlayer.setRepeatMode(RepeatMode.Track);

      if (autoPlay) {
        // 等待底层就绪 (PlaybackState)
        await new Promise<void>((resolve) => {
          const listener = TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
            if (state.state === State.Ready) {
              console.log('✅ [AudioService] TrackPlayer Ready (loadAudio)');
              listener.remove();
              resolve();
            }
          });
          setTimeout(() => {
            listener.remove();
            resolve();
          }, 5000);
        });

        await TrackPlayer.setVolume(1.0); // 确保 play 瞬间是满音量
        await TrackPlayer.play();
        
        // 此时才设为 Playing
        this.updateAudioState(soundscape.id, State.Playing);

        // 硬核日志：验证最终音量数值
        const currentVol = await TrackPlayer.getVolume();
        console.log('🔈 [FINAL CHECK] Player Volume is:', currentVol);

        // 静音监测 (防呆设计)
        if (currentVol === 0) {
          console.error('❌ [SILENCE ALERT] Player volume is ZERO! User won\'t hear anything.');
          ToastUtil.error('监测到系统静音，请检查音量');
        }

        // 强制音量回正：play 后 100ms 再次确保音量为 1.0
        setTimeout(() => {
          TrackPlayer.setVolume(1.0).catch(() => {});
          console.log('🔊 [AudioService] Volume correction executed: 1.0');
        }, 100);
      } else {
        // 如果不自动播放，设为 Paused
        this.updateAudioState(soundscape.id, State.Paused);
      }

    } catch (e: any) {
      const message = (e && e.message) || String(e);
      
      const msg = 'loadAudio 失败: ' + message;
      ToastUtil.error(msg);
    }
  }

  public async switchSoundscape(newScene: Scene, autoPlay: boolean = true): Promise<void> {
    const now = Date.now();
    if (now - this.lastSwitchTime < 300) {
      console.log('🛡️ [AudioService] switchSoundscape ignored: debounced');
      return;
    }
    this.lastSwitchTime = now;
    this.isSwitching = true;
    this.isStateLocked = true; // 强制锁定状态，防止加载过程中的外部暂停干扰

    // 1. 进入加载态
    console.log(`🚀 [AudioService] switchSoundscape START: ${newScene.id}, autoPlay: ${autoPlay}`);
    this.updateAudioState(newScene.id, State.Loading);

    try {
      await this.ensureSetup();
      
      this.currentScene = newScene; 
      this.currentBaseSceneId = newScene.id;

      let resolvedUri = '';
      
      // 2. 本地资源定位
      const localPath = await DownloadService.getLocalPath(newScene.id);
      let localFileValid = false;
      if (localPath) {
        localFileValid = await RNFS.exists(localPath);
        if (localFileValid) {
          resolvedUri = `file://${localPath}`;
          console.log('📂 [AudioService] switch: Using local file:', resolvedUri);
        }
      }

      if (!resolvedUri) {
        console.log('🌐 [AudioService] switch: Using remote URL:', newScene.audioUrl);
        resolvedUri = newScene.audioUrl;
      }

      // 3. 物理重置播放器
      await TrackPlayer.reset();
      
      await TrackPlayer.add({
        id: newScene.id,
        url: resolvedUri,
        title: newScene.title,
        artist: 'Sound Therapy Pro',
        artwork: newScene.backgroundUrl,
      });

      await TrackPlayer.setVolume(1.0);
      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      
      if (autoPlay) {
        // 4. 关键：等待 OnPrepared (State.Ready)
        console.log('⌛ [AudioService] Waiting for Player Ready...');
        await new Promise<void>((resolve) => {
          const listener = TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
            console.log(`📡 [AudioService] PlaybackState Changed: ${state.state}`);
            if (state.state === State.Ready) {
              console.log('✅ [AudioService] Player Ready, starting playback');
              listener.remove();
              resolve();
            }
          });
          setTimeout(() => {
            listener.remove();
            resolve();
          }, 8000); // 延长超时时间到 8s
        });

        // 5. 物理起播
        await TrackPlayer.play();
        
        // 6. 成功后再解锁并更新状态
        this.isStateLocked = false; 
        this.updateAudioState(newScene.id, State.Playing);
      } else {
        this.isStateLocked = false;
        this.updateAudioState(newScene.id, State.Paused);
      }
      
      console.log(`🎵 [AudioService] switchSoundscape SUCCESS: ${newScene.id}`);
      
      this.volume = 1.0;
      this.emitVolume();
    } catch (e: any) {
      this.isStateLocked = false;
      this.isSwitching = false;
      console.error('❌ [AudioService] switchSoundscape FAILED:', e);
      this.updateAudioState(newScene.id, State.Error);
      ToastUtil.error('切换场景失败');
    } finally {
      this.isSwitching = false;
      this.isStateLocked = false;
    }
  }

  private async fadeVolume(from: number, to: number, duration: number): Promise<void> {
    // 彻底销毁：函数体已清空
  }

  private async fadeInOutput(duration: number): Promise<void> {
    // 彻底销毁：函数体已清空
  }

  public async togglePlayback(scene: Scene): Promise<void> {
    await this.ensureSetup();
    const state = await TrackPlayer.getPlaybackState();
    const isCurrentPlaying = state.state === State.Playing && this.currentBaseSceneId === scene.id;

    if (isCurrentPlaying) {
      await this.pause();
    } else {
      if (this.currentBaseSceneId === scene.id) {
        await this.play();
      } else {
        await this.switchSoundscape(scene);
      }
    }
  }

  public async syncNativeStatus(): Promise<void> {
    const state = await TrackPlayer.getPlaybackState();
    const activeTrack = await TrackPlayer.getActiveTrack();
    if (activeTrack) {
      this.updateAudioState(activeTrack.id as string, state.state);
    }
  }

  /**
   * 强制重置并播放指定场景
   * 解决“按钮变了但没声音”的死循环问题
   */
  public async forceResetAndPlay(scene: Scene): Promise<void> {
    console.log('🚀 [AudioService] 执行强制重置播放:', scene.id, 'URL:', scene.audioUrl);
    try {
      await this.ensureSetup();
      await TrackPlayer.reset();
      
      let resolvedUri = '';
      
      // 1. 优先检查本地下载
      const localPath = await DownloadService.getLocalPath(scene.id);
      let localFileValid = false;
      if (localPath) {
        try {
          localFileValid = await RNFS.exists(localPath);
          if (localFileValid) {
            resolvedUri = Platform.OS === 'android' ? `file://${localPath}` : localPath;
          }
        } catch (e) {}
      }

      // 2. 兜底：使用远程 URL
      if (!resolvedUri || !localFileValid) {
        console.log('🌐 [AudioService] Local file missing (force), using remote URL:', scene.audioUrl);
        resolvedUri = scene.audioUrl;
      }

      // 3. 极度兜底：使用内置资源
      if (!resolvedUri) {
        try {
          const resolved = Image.resolveAssetSource(scene.audioFile);
          resolvedUri = resolved?.uri ?? '';
          if (Platform.OS === 'android' && resolvedUri && !resolvedUri.includes('://')) {
            resolvedUri = `android.resource://com.soundtherapyapp/raw/${resolvedUri}`;
          }
        } catch (e) {}
      }

      if (!resolvedUri) {
        throw new Error('无法解析音频资源');
      }

      console.log('Final Audio URL (force):', resolvedUri);
      await TrackPlayer.add({
        id: scene.id,
        url: resolvedUri,
        title: scene.title,
        artist: 'Sound Therapy',
        artwork: scene.backgroundUrl,
        isLiveStream: false,
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      await TrackPlayer.setVolume(1.0); // 强制满格
      await TrackPlayer.play();
      
      // 强制音量回正
      setTimeout(() => {
        TrackPlayer.setVolume(1.0).catch(() => {});
        console.log('🔊 [AudioService] Volume correction executed (forceReset): 1.0');
      }, 100);
      
      this.currentScene = scene;
      this.updateAudioState(scene.id, State.Playing);
      ToastUtil.success('已恢复播放');
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      console.error('❌ [AudioService] forceResetAndPlay 失败:', message);
      ToastUtil.error('重置播放失败: ' + message);
    }
  }

  public async play(): Promise<void> {
    await this.ensureSetup();
    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (activeTrack) {
        console.log('Final Audio URL (play):', activeTrack.url);
      }
      
      // 强化冷启动：如果 play 时没有 activeTrack，说明没加载好，强制加载当前场景
      if (!activeTrack && this.currentScene) {
        console.log('⚠️ [AudioService] Play 时无轨道，尝试加载当前场景:', this.currentScene.id);
        await this.loadAudio(this.currentScene, true);
        return;
      }

      if (this.ambientSound) {
        this.ambientSound.play((success) => {
             if (!success) console.log('Ambient playback failed');
        });
      }

      await TrackPlayer.play();
      // 强制音量回正：play 后 100ms 再次确保音量为 1.0
      setTimeout(() => {
        TrackPlayer.setVolume(1.0).catch(() => {});
        console.log('🔊 [AudioService] Volume correction executed (play): 1.0');
      }, 100);
      // 强制更新播放状态
      if (this.currentScene) {
        this.updateAudioState(this.currentScene.id, State.Playing);
      }
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      const msg = '播放失败: ' + message;
      ToastUtil.error(msg);
    }
  }

  /**
   * 停止所有声音（主场景 + 环境音层）
   * 物理级停止，确保没有任何残留
   */
  public async stopAll(): Promise<void> {
    console.log('🛑 [AudioService] stopAll triggered: Clearing all sounds');
    await this.ensureSetup();
    try {
      // 1. 停止环境音层 (Native Sound)
      this.stopAllAmbient();

      // 2. 物理重置 TrackPlayer (主场景)
      await TrackPlayer.reset();
      
      this.updateAudioState(null, State.Stopped);
    } catch (e) {
      console.error('[AudioService] stopAll failed:', e);
    }
  }

  /**
   * 停止所有环境音层
   */
  public stopAllAmbient(): void {
    console.log('🔇 [AudioService] Stopping all ambient layers');
    
    // 停止混合层 (NativeAudioModule)
    if (NativeAudioModule && NativeAudioModule.stopMixing) {
      NativeAudioModule.stopMixing().catch(() => {});
    }

    // 停止旧版兼容对象
    if (this.ambientSound) {
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }

    // 停止并清理小场景/背景层 (react-native-sound)
    this.backgroundLayers.forEach((sound, id) => {
      console.log(`- Releasing background layer: ${id}`);
      sound.stop();
      sound.release();
    });
    this.backgroundLayers.clear();

    this.smallScenes.forEach((sound, id) => {
      console.log(`- Releasing small scene: ${id}`);
      sound.stop();
      sound.release();
    });
    this.smallScenes.clear();
    
    this.emitSmallScenes();
  }

  /**
   * 获取底层播放器真实状态 (物理级检查)
   */
  public async getRealIsPlaying(): Promise<boolean> {
    try {
      await this.ensureSetup();
      const state = await TrackPlayer.getPlaybackState();
      return state.state === State.Playing || state.state === State.Buffering;
    } catch (e) {
      return false;
    }
  }

  public async pause(): Promise<void> {
    console.log('⏸️ [AudioService] pause called. Stack Trace:');
    // 打印调用栈以追踪是谁触发了暂停
    const stack = new Error().stack;
    console.log(stack);

    await this.ensureSetup();
    try {
      if (this.ambientSound) {
        this.ambientSound.pause();
      }

      await TrackPlayer.pause();
      console.log('DEBUG: PHYSICAL PAUSE EXECUTED');
      // 修复“暂停不更新”：强制更新 JS 层的播放状态为 Paused
      if (this.currentScene) {
        // 临时解锁以允许状态更新
        const wasLocked = this.isStateLocked;
        if (wasLocked) {
          this.isStateLocked = false;
        }
        this.updateAudioState(this.currentScene.id, State.Paused);
        if (wasLocked) {
          this.isStateLocked = true;
        }
      }
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      const msg = '暂停失败: ' + message;
      ToastUtil.error(msg);
    }
  }

  private clearActiveFade() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }

  public async setVolume(value: number): Promise<void> {
    this.clearActiveFade();
    // Defensive check: if value < 0.01, set to 0. Otherwise use 0.001 as safety floor.
    let finalVolume = value < 0.01 ? 0 : Math.max(0.001, value);
    this.volume = finalVolume;
    this.emitVolume();
    try {
      await TrackPlayer.setVolume(this.volume);
      console.log('🔊 [AudioService] TrackPlayer 音量已同步:', this.volume);
    } catch (e) {
      // Fallback for native failure at 0
      if (this.volume === 0) {
        await TrackPlayer.setVolume(0.0001);
      }
    }
  }

  public async playWithFadeIn(): Promise<void> {
    await this.play();
  }

  public async fadeOutStop(duration: number = 2000): Promise<void> {
    // 彻底销毁：函数体已清空
  }

  public async pauseWithFadeOut(): Promise<void> {
    // 隔离：直接暂停
    await this.pause();
  }

  public async stop(): Promise<void> {
    await this.ensureSetup();
    try {
      if (this.ambientSound) {
        this.ambientSound.stop();
      }
      await TrackPlayer.reset(); // reset 比 stop 更彻底，能直接销毁通知栏
      this.updateAudioState(null, State.Stopped);
    } catch (e) {
      console.error('[AudioService] Stop failed:', e);
    }
  }

  public async getCurrentActiveTrack(): Promise<any> {
    try {
      await this.ensureSetup();
      return await TrackPlayer.getActiveTrack();
    } catch (e) {
      return null;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlayerInitialized(): boolean {
    return this.isInitialized;
  }

  public addVolumeListener(listener: (volume: number) => void): () => void {
    this.volumeListeners.add(listener);
    try {
      listener(this.volume);
    } catch {}
    return () => {
      this.volumeListeners.delete(listener);
    };
  }

  private emitVolume() {
    this.volumeListeners.forEach((l) => {
      try {
        l(this.volume);
      } catch {}
    });
  }

  public getAmbientVolume(): number {
      return this.ambientVolume;
  }
}

// 导出单例实例作为默认导出，这是 React Native 中最常用的模式
// 这样 import AudioService from './AudioService' 得到的就是可以直接调用的实例
const instance = AudioService.getInstance();

// 同时为了防止某些环境下 require().default 拿到的是类，我们做一个极端的兼容：
// 让实例本身也带有一个 default 属性指向自己
(instance as any).default = instance;

export default instance;
export { AudioService };
