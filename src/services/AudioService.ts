import { Audio } from 'expo-av';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { State } from 'react-native-track-player';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { AUDIO_MAP, DEFAULT_FALLBACK_SOURCE, getDownloadUrl, getLocalPath } from '../constants/audioAssets';
import RNFS from 'react-native-fs';
import { NotificationService } from './NotificationService';
import { OfflineService } from './OfflineService';

class AudioService {
  private static instance: AudioService;
  private soundObjects: Map<string, Audio.Sound> = new Map();
  private activeSmallScenes: Set<string> = new Set();
  private currentBaseScene: Scene | null = null;
  private listeners: Set<() => void> = new Set();
  private audioStateListeners: Set<(state: { id: string | null; state: State }) => void> = new Set();
  private loadingListeners: Set<(state: { id: string | null; loading: boolean }) => void> = new Set();
  private smallScenesListeners: Set<(ids: string[]) => void> = new Set();
  private volumeListeners: Set<(vol: number) => void> = new Set();
  private timerListeners: Set<(remaining: number | null) => void> = new Set();
  private isSwitching = false;
  private ambientVolume = 1.0;
  private sleepEndTime: number | null = null;
  private initialSleepSeconds: number | null = null;
  private sleepTimer: any = null;
  private loadingSceneId: string | null = null;
  private loadingTimeout: any = null;
  private loadingTimeoutMs = 20000;

  private constructor() {
    // 监听 AppState 变化
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private appState: AppStateStatus = 'active';
  private pendingSetup = false;

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log(`[AudioService] AppState changed: ${this.appState} -> ${nextAppState}`);
    this.appState = nextAppState;
    
    // 如果应用回到前台且有挂起的初始化请求，立即执行
    if (nextAppState === 'active' && this.pendingSetup) {
      console.log('[AudioService] 应用回到前台，执行挂起的初始化');
      this.pendingSetup = false;
      this.performSetup();
    }
  };

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  // --- 状态获取方法 ---
  private isActuallyPlaying = false;

  isPlaying(): boolean {
    return this.isActuallyPlaying;
  }

  getCurrentState(): State {
    return this.isActuallyPlaying ? State.Playing : State.Paused;
  }

  async setupPlayer() {
    try {
      console.log('[AudioService] ====== 开始设置音频模式 ======');
      console.log(`[AudioService] 当前 AppState: ${this.appState}`);
      
      // 【关键】检查是否在后台，如果是则挂起初始化
      if (this.appState !== 'active') {
        console.log('[AudioService] ⚠️ 应用在后台，挂起初始化直到回到前台');
        this.pendingSetup = true;
        return;
      }
      
      await this.performSetup();
    } catch (e) {
      console.error('[AudioService] ❌ Failed to setup audio mode', e);
      console.error('[AudioService] Error stack:', e.stack);
      throw e;
    }
  }
  
  private async performSetup() {
    console.log('[AudioService] 执行实际初始化...');
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: 1,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: 1,
      playThroughEarpieceAndroid: false,
    });
    console.log('[AudioService] ✅ 音频模式设置完成');
    
    console.log('[AudioService] 调用 NotificationService.setup()');
    await NotificationService.setup();
    console.log('[AudioService] ✅ NotificationService 初始化完成');
    console.log('[AudioService] ====== 音频服务启动完成 ======');
  }

  async loadAudio(scene: Scene, shouldPlay: boolean = false) {
    try {
      if (!scene || !scene.filename) {
        console.error(`[AudioService] loadAudio: Scene or filename is null`);
        return;
      }

      if (this.soundObjects.has(scene.id)) return;

      const isDeepSea = scene.id.includes('deep_sea') || scene.filename.includes('deep_sea');
      console.log(`[AudioService] Preloading scene: ${scene.id} (shouldPlay: ${shouldPlay})`);
      
      const localPath = getLocalPath(scene.category, scene.filename);
      const isLocal = await RNFS.exists(localPath.replace('file://', ''));
      const sources = isLocal ? [{ uri: localPath }] : getDownloadUrl(scene.id).map(url => ({ uri: url }));

      // 静默处理：加载音频源
      console.log(`[AudioService] Loading source for ${scene.filename}: ${isLocal ? 'Local Cache' : 'Remote URL'}`);
      let sound: Audio.Sound | null = null;
      let lastError: any = null;
      for (const source of sources) {
        try {
          const result = await this.createSoundWithTimeout(source, shouldPlay);
          sound = result.sound;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!sound) {
        throw lastError ?? new Error('LOAD_FAILED');
      }
      this.soundObjects.set(scene.id, sound);
      if (shouldPlay) {
        this.isActuallyPlaying = true;
        this.notifyListeners();
      }
    } catch (e: any) {
      const fallbackSource = AUDIO_MAP[scene.filename] || DEFAULT_FALLBACK_SOURCE;
      if (scene?.id?.includes('deep_sea') || scene?.filename?.includes('deep_sea')) {
        console.log('[DeepSeaDebug][AudioService] loadAudio fallback', {
          id: scene?.id,
          filename: scene?.filename,
          fallback: Boolean(fallbackSource)
        });
      }
      if (fallbackSource) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            fallbackSource,
            { shouldPlay: shouldPlay, isLooping: true, volume: this.ambientVolume }
          );
          this.soundObjects.set(scene.id, sound);
          if (shouldPlay) {
            this.isActuallyPlaying = true;
            this.notifyListeners();
          }
          return;
        } catch (fallbackError: any) {
          console.error(`[AudioService] Fallback preload failed: ${scene.id}`, {
            error: fallbackError.message,
            stack: fallbackError.stack,
          });
        }
      }
      console.error(`[AudioService] 🚨 PRELOAD FAILED: ${scene.id}. File: ${scene.filename}`, {
        error: e.message,
        stack: e.stack,
        source: fallbackSource
      });
    }
  }

  async syncNativeStatus() {
    // expo-av 状态同步通常通过 addAudioStateListener 实现
    // 这里提供一个手动同步的空实现以保持接口兼容
    this.notifyListeners();
  }

  async setSleepTimer(minutes: number) {
    this.clearSleepTimer();
    const seconds = minutes * 60;
    this.initialSleepSeconds = seconds;
    this.sleepEndTime = Date.now() + seconds * 1000;

    this.sleepTimer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((this.sleepEndTime! - Date.now()) / 1000));
      this.timerListeners.forEach(l => l(remaining));

      if (remaining <= 0) {
        this.clearSleepTimer();
        this.stopAll();
        this.triggerFinished();
      }
    }, 1000);

    this.notifyListeners();
  }

  clearSleepTimer() {
    if (this.sleepTimer) {
      clearInterval(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.sleepEndTime = null;
    this.initialSleepSeconds = null;
    this.timerListeners.forEach(l => l(null));
  }

  getCurrentScene(): Scene | null {
    return this.currentBaseScene;
  }

  getAmbientVolume(): number {
    return this.ambientVolume;
  }

  getVolume(): number {
    return this.ambientVolume;
  }

  getAmbientVolumeById(_: string): number {
    return this.ambientVolume;
  }

  getSleepEndTime(): number | null {
    return this.sleepEndTime;
  }

  getInitialSleepSeconds(): number | null {
    return this.initialSleepSeconds;
  }

  // --- 监听器管理 ---
  addListener(listener: () => void) {
    this.listeners.add(listener);
  }

  removeListener(listener: () => void) {
    this.listeners.delete(listener);
  }

  addAudioStateListener(listener: (state: { id: string | null; state: State }) => void) {
    this.audioStateListeners.add(listener);
    return () => { this.audioStateListeners.delete(listener); };
  }

  addLoadingListener(listener: (state: { id: string | null; loading: boolean }) => void) {
    this.loadingListeners.add(listener);
    return () => { this.loadingListeners.delete(listener); };
  }

  addSmallScenesListener(listener: (ids: string[]) => void) {
    this.smallScenesListeners.add(listener);
    return () => { this.smallScenesListeners.delete(listener); };
  }

  addVolumeListener(listener: (vol: number) => void) {
    this.volumeListeners.add(listener);
    return () => { this.volumeListeners.delete(listener); };
  }

  addSleepTimerListener(listener: (remaining: number | null) => void) {
    this.timerListeners.add(listener);
    return () => { this.timerListeners.delete(listener); };
  }

  private finishedListeners = new Set<() => void>();

  addSleepTimerFinishedListener(listener: () => void) {
    this.finishedListeners.add(listener);
    return () => { this.finishedListeners.delete(listener); };
  }

  private triggerFinished() {
    this.finishedListeners.forEach(l => l());
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
    const currentState = this.getCurrentState();
    console.log(`[AudioService] Notifying listeners: state=${currentState}, id=${this.getCurrentBaseSceneId()}`);
    this.audioStateListeners.forEach(l => l({ id: this.getCurrentBaseSceneId(), state: currentState }));
    this.smallScenesListeners.forEach(l => l(this.getActiveSmallSceneIds()));
    
    if (this.currentBaseScene) {
      NotificationService.updateNotification(this.currentBaseScene, currentState).catch(() => {});
      NotificationService.updatePlaybackState(this.isActuallyPlaying).catch(() => {});
    }
  }

  private notifyLoading(loading: boolean, id: string | null) {
    this.loadingListeners.forEach(l => l({ id, loading }));
  }

  private startLoadingTimeout(sceneId: string) {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }
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

  private async createSoundWithTimeout(source: any, shouldPlay: boolean) {
    return new Promise<{ sound: Audio.Sound }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), this.loadingTimeoutMs);
      Audio.Sound.createAsync(
        source,
        { shouldPlay, isLooping: true, volume: this.ambientVolume }
      ).then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  getActiveSmallSceneIds(): string[] {
    return Array.from(this.activeSmallScenes);
  }

  getCurrentBaseSceneId(): string | null {
    return this.currentBaseScene?.id || null;
  }

  async playScene(scene: Scene, options?: { triggerLoading?: boolean }) {
    const shouldTriggerLoading = options?.triggerLoading !== false;
    try {
      if (!scene || !scene.filename) {
        console.error(`[AudioService] Scene or filename is null for ${scene?.id}`);
        return;
      }

      if (shouldTriggerLoading && this.loadingSceneId !== scene.id) {
        this.loadingSceneId = scene.id;
        this.notifyLoading(true, scene.id);
        this.startLoadingTimeout(scene.id);
      }

      const finishLoading = () => {
        if (!shouldTriggerLoading) return;
        if (this.loadingSceneId !== scene.id) return;
        this.loadingSceneId = null;
        this.clearLoadingTimeout();
        this.notifyLoading(false, scene.id);
      };

      const handlePlaybackStart = (status: any) => {
        if (!status || !status.isLoaded) return;
        if (status.isPlaying) {
          this.isActuallyPlaying = true;
          // Use setImmediate to avoid blocking the main thread
          setImmediate(() => {
            this.notifyListeners();
          });
          finishLoading();
        }
      };

      if (this.soundObjects.has(scene.id)) {
        const sound = this.soundObjects.get(scene.id);
        if (sound) {
          sound.setOnPlaybackStatusUpdate(handlePlaybackStart);
          await sound.playAsync();
          const status = await sound.getStatusAsync();
          handlePlaybackStart(status);
        }
        return;
      }

      const isDeepSea = scene.id.includes('deep_sea') || scene.filename.includes('deep_sea');
      const localPath = getLocalPath(scene.category, scene.filename);
      const isLocal = await RNFS.exists(localPath.replace('file://', ''));
      
      // 离线模式检测
      const isOffline = await OfflineService.isOfflineMode();
      const localValid = isLocal ? await OfflineService.validateAsset(scene.id) : false;
      
      // 离线模式下，如果本地文件无效，直接报错
      if (isOffline && !localValid) {
        console.error(`[AudioService] 离线模式无法播放: ${scene.id}, 本地文件不存在或损坏`);
        throw new Error('OFFLINE_NO_LOCAL_FILE');
      }
      
      // 构建播放源：优先本地，其次远程
      const sources: { uri: string }[] = [];
      if (localValid) {
        sources.push({ uri: localPath });
      }
      if (!isOffline) {
        const remoteUrls = getDownloadUrl(scene.id).map(url => ({ uri: url }));
        sources.push(...remoteUrls);
      }

      if (isDeepSea) {
        console.log('[DeepSeaDebug][AudioService] playScene source', {
          id: scene.id,
          filename: scene.filename,
          isLocal,
          localValid,
          isOffline,
          source: sources[0]?.uri
        });
      }
      console.log(`[AudioService] Loading and playing scene ${scene.id} from ${localValid ? 'Local Cache' : (isOffline ? 'Offline - No Source' : 'Remote URL')}`);

      if (sources.length === 0) {
        throw new Error('NO_AVAILABLE_SOURCE');
      }

      let sound: Audio.Sound | null = null;
      let lastError: any = null;
      for (const source of sources) {
        try {
          const result = await this.createSoundWithTimeout(source, true);
          sound = result.sound;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!sound) {
        throw lastError ?? new Error('LOAD_FAILED');
      }
      this.soundObjects.set(scene.id, sound);
      sound.setOnPlaybackStatusUpdate(handlePlaybackStart);
      const status = await sound.getStatusAsync();
      handlePlaybackStart(status);
    } catch (error: any) {
      const fallbackSource = AUDIO_MAP[scene.filename] || DEFAULT_FALLBACK_SOURCE;
      if (scene?.id?.includes('deep_sea') || scene?.filename?.includes('deep_sea')) {
        console.log('[DeepSeaDebug][AudioService] playScene fallback', {
          id: scene?.id,
          filename: scene?.filename,
          fallback: Boolean(fallbackSource)
        });
      }
      if (fallbackSource) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            fallbackSource,
            { shouldPlay: true, isLooping: true, volume: this.ambientVolume }
          );
          this.soundObjects.set(scene.id, sound);
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.isPlaying) {
              this.isActuallyPlaying = true;
              this.notifyListeners();
              if (shouldTriggerLoading && this.loadingSceneId === scene.id) {
                this.loadingSceneId = null;
                this.notifyLoading(false, scene.id);
              }
            }
          });
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.isPlaying) {
            this.isActuallyPlaying = true;
            this.notifyListeners();
            if (shouldTriggerLoading && this.loadingSceneId === scene.id) {
              this.loadingSceneId = null;
              this.notifyLoading(false, scene.id);
            }
          }
          return;
        } catch (fallbackError: any) {
          console.error(`[AudioService] Fallback play failed: ${scene.id}`, {
            filename: scene.filename,
            error: fallbackError.message,
          });
        }
      }
      // 离线模式特殊错误处理
      if (error.message === 'OFFLINE_NO_LOCAL_FILE') {
        console.error(`[AudioService] 离线模式错误: ${scene.id} 未下载到本地`);
        // 可以在这里触发全局事件，让 UI 层显示提示
      } else {
        console.error(`[AudioService] CRITICAL: Failed to play scene ${scene.id}.`, {
          filename: scene.filename,
          error: error.message,
        });
      }
      
      if (shouldTriggerLoading && this.loadingSceneId === scene.id) {
        this.loadingSceneId = null;
        this.clearLoadingTimeout();
        this.notifyLoading(false, scene.id);
      }
      
      // 重新抛出错误，让调用方处理
      throw error;
    }
  }

  async pause() {
    try {
      console.log('[AudioService] Pausing all sounds');
      for (const [id, sound] of this.soundObjects.entries()) {
        try {
          if (sound) {
            const status = await sound.getStatusAsync();
            if (status.isLoaded) {
              await sound.pauseAsync();
            }
          }
        } catch (err) {
          console.warn(`[AudioService] Failed to pause sound ${id}:`, err);
        }
      }
      this.isActuallyPlaying = false;
      this.notifyListeners();
    } catch (e) {
      console.error('[AudioService] Global pause error:', e);
    }
  }

  async play() {
    try {
      console.log('[AudioService] Resuming all sounds');
      if (this.soundObjects.size === 0 && this.currentBaseScene) {
        await this.playScene(this.currentBaseScene, { triggerLoading: true });
      } else {
        for (const [id, sound] of this.soundObjects.entries()) {
          try {
            if (sound) {
              const status = await sound.getStatusAsync();
              if (status.isLoaded) {
                await sound.playAsync();
              }
            }
          } catch (err) {
            console.warn(`[AudioService] Failed to play sound ${id}:`, err);
          }
        }
      }
      this.isActuallyPlaying = true;
      this.notifyListeners();
    } catch (e) {
      console.error('[AudioService] Global play error:', e);
    }
  }

  async stop() {
    await this.stopAll();
  }

  async getRealIsPlaying(): Promise<boolean> {
    for (const sound of this.soundObjects.values()) {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        return true;
      }
    }
    return false;
  }

  async stopScene(sceneId: string) {
    try {
      const sound = this.soundObjects.get(sceneId);
      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            await sound.stopAsync();
            await sound.unloadAsync();
          }
        } catch (err) {
          console.warn(`[AudioService] Error stopping sound ${sceneId}:`, err);
        } finally {
          this.soundObjects.delete(sceneId);
        }
      }
      if (this.soundObjects.size === 0) {
        this.isActuallyPlaying = false;
      }
    } catch (e) {
      console.error(`[AudioService] stopScene failed for ${sceneId}:`, e);
    }
  }

  // --- 核心优化位置 ---
  async switchSoundscape(scene: Scene) {
    if (this.isSwitching) return;
    this.isSwitching = true;

    console.log(`[AudioService] Switching to soundscape: ${scene.id} (${scene.title})`);
    const previousScene = this.currentBaseScene;

    try {
      this.currentBaseScene = scene;
      // Use setImmediate to avoid blocking the main thread
      setImmediate(() => {
        this.notifyListeners();
      });

      // 1. 停止当前所有音频并清空激活列表
      if (this.loadingSceneId !== scene.id) {
        this.loadingSceneId = scene.id;
        this.notifyLoading(true, scene.id);
        this.startLoadingTimeout(scene.id);
      }
      await this.stopAll({ keepBaseScene: true });
      this.activeSmallScenes.clear();

      // 2. 联动激活逻辑：如果是呼吸类场景，仅同步状态但不播放音效，实现“开场静默”
      const isBreathScene = scene.id?.includes('breath');
      if (isBreathScene) {
        console.log('[AudioService] Breath context detected. Ensuring interaction sounds are silent on start.');
        this.activeSmallScenes.clear(); 
      }

      // 3. 设置并播放新的主场景
      await this.playScene(scene, { triggerLoading: true });
      
      // Use setImmediate to avoid blocking the main thread
      setImmediate(() => {
        this.notifyListeners();
      });
    } catch (e) {
      console.error(`[AudioService] switchSoundscape failed for ${scene?.id}:`, e);
      this.currentBaseScene = previousScene;
      // Use setImmediate to avoid blocking the main thread
      setImmediate(() => {
        this.notifyListeners();
      });
    } finally {
      this.isSwitching = false;
    }
  }

  async toggleAmbience(scene: Scene, forceState?: boolean) {
    try {
      const isCurrentlyActive = this.activeSmallScenes.has(scene.id);
      const targetState = forceState !== undefined ? forceState : !isCurrentlyActive;

      if (isCurrentlyActive === targetState) return;

      if (targetState) {
        this.activeSmallScenes.add(scene.id);
        await this.playScene(scene, { triggerLoading: false });
      } else {
        this.activeSmallScenes.delete(scene.id);
        await this.stopScene(scene.id);
      }
      this.notifyListeners();
    } catch (e) {
      console.error(`[AudioService] toggleAmbience failed for ${scene?.id}:`, e);
    }
  }

  async togglePlayback(scene: Scene) {
    try {
      if (this.currentBaseScene?.id === scene.id && this.isActuallyPlaying) {
        await this.pause();
      } else {
        await this.switchSoundscape(scene);
      }
    } catch (e) {
      console.error(`[AudioService] togglePlayback failed for ${scene?.id}:`, e);
    }
  }

  async stopAll(options?: { keepBaseScene?: boolean }) {
    try {
      const sceneIds = Array.from(this.soundObjects.keys());
      for (const sceneId of sceneIds) {
        await this.stopScene(sceneId);
      }
      this.activeSmallScenes.clear();
      if (!options?.keepBaseScene) {
        this.currentBaseScene = null;
      }
      this.isActuallyPlaying = false;
      
      if (!options?.keepBaseScene) {
        NotificationService.hideNotification().catch(() => {});
      }
      
      setImmediate(() => {
        this.notifyListeners();
      });
    } catch (e) {
      console.error('[AudioService] stopAll failed:', e);
    }
  }

  updateAmbientVolume(volume: number) {
    this.ambientVolume = volume;
    this.volumeListeners.forEach(l => l(volume));
    // 实际应用中可能需要调整所有 soundObjects 的音量
    this.soundObjects.forEach(async (sound) => {
      try {
        await sound.setVolumeAsync(volume);
      } catch (e) {
        console.warn('[AudioService] Failed to set volume', e);
      }
    });
  }

  setVolume(volume: number) {
    this.updateAmbientVolume(volume);
  }

  async playAmbient(id: string) {
    const scene = SCENES.find(s => s.id === id);
    if (scene) {
      await this.toggleAmbience(scene, true);
    }
  }

  async stopAllAmbient() {
    const activeIds = Array.from(this.activeSmallScenes);
    for (const id of activeIds) {
      const scene = SCENES.find(s => s.id === id);
      if (scene) {
        await this.toggleAmbience(scene, false);
      }
    }
  }
}

export default AudioService.getInstance();
