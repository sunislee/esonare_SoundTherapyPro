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
import { SCENES, type Scene } from '../constants/scenes';
import ToastUtil from '../utils/ToastUtil';
import { HistoryService } from './HistoryService';
import { AUDIO_MANIFEST, REMOTE_RESOURCE_BASE_URL } from '../constants/audioAssets';
import { NotificationService } from './NotificationService';
import { DownloadService } from './DownloadService';
import EngineControl from '../constants/EngineControl';

const { NativeAudioModule } = NativeModules;
const nativeAudioEmitter = NativeAudioModule ? new NativeEventEmitter(NativeAudioModule) : null;

class AudioService {
  private static instance: AudioService;
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
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private meteringInterval: ReturnType<typeof setInterval> | null = null;
  private meteringListeners = new Set<(level: number) => void>();
  private mainVolume = 1.0;
  private ambientVolume = 0.4;
  
  // Ambient volumes per sound ID
  private ambientVolumes: Record<string, number> = {};

  // Unified State Management
  private currentAudioState: { id: string | null; state: State } = { id: null, state: State.None };
  private audioStateListeners = new Set<(state: { id: string | null; state: State }) => void>();

  // Ambient Layer
  private ambientSound: Sound | null = null;
  private ambientName: string | null = null;

  private interactiveSounds: Partial<Record<string, Sound>> = {};

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
   * 启动环境音混合 (包含自动下载逻辑)
   */
  public async startAmbientWithDownload(id: string): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] startAmbientWithDownload blocked: engine not allowed');
      return;
    }
    
    try {
      console.log('DEBUG: Entering Download Logic');
    
    // 检查资源状态
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    const remoteUrl = asset ? `${REMOTE_RESOURCE_BASE_URL}${asset.filename}` : '';
    
    console.log('DEBUG: Asset Config:', {
      id,
      remoteUrl,
      isRemote: !!remoteUrl
    });

    const localPath = await DownloadService.getLocalPath(id);
    
    if (localPath) {
      const canAccess = await this.checkFileAccess(localPath);
      if (canAccess) {
        console.log(`[AudioService] 资源就绪，直接加载: ${localPath}`);
        await this.loadTrack(localPath, 1); // 假设 1 是氛围音轨道
        await this.startMixing();
        return;
      }
    }

    // 资源不存在，触发下载
    console.log(`[AudioService] 资源缺失，开始下载: ${id}`);
    const downloadedPath = await DownloadService.downloadAudio(id, remoteUrl || ''); 
    
    if (downloadedPath) {
      await this.loadTrack(downloadedPath, 1);
      await this.startMixing();
    }
    } catch (e) {
      console.error('[AudioService] startAmbientWithDownload failed:', e);
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

  public async syncNativeStatus(): Promise<void> {
    if (!NativeAudioModule || !NativeAudioModule.getCurrentState) return;
    
    try {
      const state = await NativeAudioModule.getCurrentState();
      console.log('[AudioService] Native Status Sync:', state);
      
      if (state && state.id) {
        let tpState = State.None;
        switch (state.state) {
          case 'playing': tpState = State.Playing; break;
          case 'paused': tpState = State.Paused; break;
          case 'fading': tpState = State.Playing; break;
          case 'idle': tpState = State.None; break;
          default: tpState = State.None;
        }

        // 仅当状态不一致时更新，避免死循环或多余渲染
        if (this.currentAudioState.id !== state.id || this.currentAudioState.state !== tpState) {
          const found = SCENES.find(s => s.id === state.id);
          if (found) {
            this.currentScene = found;
          }
          this.updateAudioState(state.id, tpState);
        }
      }
    } catch (e) {
      console.warn('[AudioService] Failed to sync native status', e);
    }
  }

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

  public getCurrentState(): State {
    return this.currentAudioState.state;
  }

  public async setAmbient(id: string | null): Promise<void> {
    // 物理唯一性锁定：无论新 ID 是什么，先彻底杀死当前活跃实例
    if (this.ambientSound) {
      console.log(`[AudioService] 物理释放旧实例: ${this.ambientName}`);
      const oldSound = this.ambientSound;
      this.ambientSound = null; // 立即置空防止竞态
      oldSound.stop(() => {
        oldSound.release();
      });
    }

    if (!id) {
      this.ambientName = null;
      this.ambientVolume = 0;
      this.updateAudioState(null, State.Stopped); // 触发 UI 状态强刷
      this.emitVolume();
      return;
    }

    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) {
      console.warn(`[Ambient] Asset not found for id: ${id}`);
      return;
    }

    // 加载存储的音量
    const storedVol = await this.getStoredVolume(id);
    this.ambientVolume = storedVol;
    this.ambientName = id;
    this.ambientVolumes[id] = storedVol;
    this.emitVolume();

    const localPath = await DownloadService.getLocalPath(asset.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    const finalUrl = exists ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;

    console.log(`[AudioService] 物理启动唯一实例: ${id}, 音量: ${storedVol}`);

    return new Promise((resolve) => {
      const sound = new Sound(finalUrl, '', (error) => {
        if (error) {
          console.warn(`[Ambient] Load failed for ${id}:`, error);
          this.updateAudioState(null, State.Stopped);
          resolve();
          return;
        }
        
        // 双重检查：如果在加载过程中又触发了新的声音，释放当前这个
        if (this.ambientName !== id) {
          sound.release();
          resolve();
          return;
        }

        this.ambientSound = sound;
        sound.setNumberOfLoops(-1);
        sound.setVolume(this.ambientVolume);
        sound.play(() => {
          // 播放结束回调（循环模式通常不触发）
        });
        
        // 强刷 UI 状态：将当前环境音 ID 发送给监听者
        this.updateAudioState(id, State.Playing);
        resolve();
      });
    });
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

  public getAmbientVolume(): number {
      return this.ambientVolume;
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

      for (const key in this.interactiveSounds) {
        const sound = this.interactiveSounds[key];
        if (sound) {
          sound.stop();
          sound.release();
        }
      }
      this.interactiveSounds = {};

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
    const ALARM_SCENE: Scene = {
      id: 'morning-alarm',
      title: '清晨唤醒',
      audioUrl: '',
      audioFile: null,
      backgroundUrl: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8',
      primaryColor: '#F5A623',
      audioSource: 'life_fire_pure',
      baseVolume: 1.0,
      backgroundSource: { uri: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8' },
      category: 'Life'
    };

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
      
      console.log('🎵 [AudioService] loadAudio:', soundscape.id);
      
      let resolvedUri = '';
      
      // 优先检查本地下载
      const localPath = await DownloadService.getLocalPath(soundscape.id);
      let localFileValid = false;
      if (localPath) {
        try {
          // 物理校验文件是否存在
          localFileValid = await RNFS.exists(localPath);
          if (localFileValid) {
            resolvedUri = Platform.OS === 'android' ? `file://${localPath}` : localPath;
            console.log('📂 [AudioService] Using cached local file:', resolvedUri);
          }
        } catch (e) {
          console.warn('[AudioService] Local file check failed:', e);
        }
      }

      // 兜底：如果本地文件不存在或校验失败，降级使用 App 内置资源 (src/assets)
      if (!resolvedUri || !localFileValid) {
        console.log('📦 [AudioService] Local file missing or invalid, falling back to assets for:', soundscape.id);
        try {
          const resolved = Image.resolveAssetSource(soundscape.audioFile);
          resolvedUri = resolved?.uri ?? '';
          
          if (Platform.OS === 'android' && resolvedUri && !resolvedUri.includes('://')) {
            resolvedUri = `android.resource://com.soundtherapyapp/raw/${resolvedUri}`;
          }
          console.log('🔗 [AudioService] Asset Fallback URI:', resolvedUri);
        } catch (e) {
          console.error('❌ [AudioService] Fallback resolveAssetSource failed:', e);
        }
      }

      if (!resolvedUri) {
        const msg = 'loadAudio 失败: 无法解析场景音频资源';
        ToastUtil.error(msg);
        return;
      }

      // Add to history
      HistoryService.addToHistory(soundscape.id);

      // 提前触发状态更新，实现“即时上岛”视觉反馈
      this.updateAudioState(soundscape.id, autoPlay ? State.Playing : State.Paused);

      // 统一使用 TrackPlayer，抛弃 NativeAudioModule 原生控制
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: soundscape.id,
        url: resolvedUri,
        title: soundscape.title,
        artist: 'Sound Therapy',
        artwork: soundscape.backgroundUrl,
        isLiveStream: false,
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      await TrackPlayer.setVolume(1.0);

      if (autoPlay) {
        await TrackPlayer.play();
        // 强制音量回正：play 后 100ms 再次确保音量为 1.0
        setTimeout(() => {
          TrackPlayer.setVolume(1.0).catch(() => {});
          console.log('🔊 [AudioService] Volume correction executed: 1.0');
        }, 100);
      }

    } catch (e: any) {
      const message = (e && e.message) || String(e);
      
      const msg = 'loadAudio 失败: ' + message;
      ToastUtil.error(msg);
    }
  }

  public async switchSoundscape(newScene: Scene): Promise<void> {
    const now = Date.now();
    if (now - this.lastSwitchTime < 300) {
      return;
    }
    this.lastSwitchTime = now;
    this.isSwitching = true;

    try {
      await this.ensureSetup();
      
      // 暴力重置：如果是第一个音源 (brain_alpha_new)，强制物理停止并清除所有状态
      if (newScene.id === 'brain_alpha_new') {
        console.log('🔥 [AudioService] 针对第一个音源执行暴力重置');
        try {
          if (NativeModules.NativeAudioModule) {
            await NativeModules.NativeAudioModule.stop();
          }
        } catch (e) {}
        await TrackPlayer.reset();
      }

      this.currentScene = newScene; // 保存当前场景引用
      console.log('🔄 [AudioService] switchSoundscape:', newScene.id);

      // 提前触发状态更新，实现“即时上岛”视觉反馈
      this.updateAudioState(newScene.id, State.Playing);

      let resolvedUri = '';
      
      // 优先从 DocumentDir 加载已下载资源
      const localPath = await DownloadService.getLocalPath(newScene.id);
      let localFileValid = false;
      if (localPath) {
        try {
          localFileValid = await RNFS.exists(localPath);
          if (localFileValid) {
            resolvedUri = Platform.OS === 'android' ? `file://${localPath}` : localPath;
            console.log('📂 [AudioService] Using local downloaded resource:', resolvedUri);
          }
        } catch (e) {
          console.warn('[AudioService] Local file check failed (switch):', e);
        }
      }

      // 兜底：如果本地文件不存在，使用内置资源
      if (!resolvedUri || !localFileValid) {
        console.log('📦 [AudioService] Falling back to assets for scene:', newScene.id);
        try {
          const resolved = Image.resolveAssetSource(newScene.audioFile);
          resolvedUri = resolved?.uri ?? '';
          if (Platform.OS === 'android' && resolvedUri && !resolvedUri.includes('://')) {
            resolvedUri = `android.resource://com.soundtherapyapp/raw/${resolvedUri}`;
          }
          console.log('🔗 [AudioService] Asset Fallback URI (switch):', resolvedUri);
        } catch (e) {
          console.error('❌ [AudioService] Fallback resolveAssetSource failed (switch):', e);
        }
      }

      if (!resolvedUri) {
        ToastUtil.error('切换场景失败: 无法解析场景音频资源');
        return;
      }

      HistoryService.addToHistory(newScene.id);

      // 瞬时切换：reset 并加载新音源，跳过所有渐变
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: newScene.id,
        url: resolvedUri,
        title: newScene.title,
        artist: 'Sound Therapy',
        artwork: newScene.backgroundUrl,
        isLiveStream: false,
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      await TrackPlayer.setVolume(1.0);
      await TrackPlayer.play();
      
      // 强制音量回正：play 后 100ms 再次确保音量为 1.0
      setTimeout(() => {
        TrackPlayer.setVolume(1.0).catch(() => {});
        console.log('🔊 [AudioService] Volume correction executed (switch): 1.0');
      }, 100);
      
      this.volume = 1.0;
      this.emitVolume();
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      const msg = '切换场景失败: ' + message;
      ToastUtil.error(msg);
    } finally {
      this.isSwitching = false;
    }
  }

  private async fadeVolume(from: number, to: number, duration: number): Promise<void> {
    // 彻底销毁：函数体已清空
  }

  private async fadeInOutput(duration: number): Promise<void> {
    // 彻底销毁：函数体已清空
  }

  public async togglePlayback(): Promise<void> {
    const state = await TrackPlayer.getState();
    const activeTrack = await TrackPlayer.getActiveTrack();

    // 强化：如果状态是播放中，但没有 activeTrack（冷启动异常状态），强制重置并播放当前场景
    if (state === State.Playing && !activeTrack && this.currentScene) {
      console.log('⚠️ [AudioService] 状态冲突：正在播放但无轨道，触发强制重置');
      await this.forceResetAndPlay(this.currentScene);
      return;
    }

    if (state === State.Playing) {
      await this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * 强制重置并播放指定场景
   * 解决“按钮变了但没声音”的死循环问题
   */
  public async forceResetAndPlay(scene: Scene): Promise<void> {
    console.log('🚀 [AudioService] 执行强制重置播放:', scene.id);
    try {
      await this.ensureSetup();
      await TrackPlayer.reset();
      
      let resolvedUri = '';
      
      // 优先检查本地下载
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

      if (!resolvedUri || !localFileValid) {
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

  public async pause(): Promise<void> {
    await this.ensureSetup();
    try {
      if (this.ambientSound) {
        this.ambientSound.pause();
      }

      await TrackPlayer.pause();
      // 修复“暂停不更新”：强制更新 JS 层的播放状态为 Paused
      if (this.currentScene) {
        this.updateAudioState(this.currentScene.id, State.Paused);
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

  public playInteractive(id: string): void {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) {
      console.warn(`[Interactive] Asset not found for id: ${id}`);
      return;
    }

    DownloadService.getLocalPath(asset.id).then(localPath => {
      return localPath ? RNFS.exists(localPath).then(exists => ({ exists, localPath })) : Promise.resolve({ exists: false, localPath: '' });
    }).then(({ exists, localPath }) => {
      const finalUrl = exists ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;
      
      if (this.interactiveSounds[id]) {
        this.interactiveSounds[id]?.play();
        return;
      }

      const sound = new Sound(finalUrl, '', (error) => {
        if (error) {
          console.warn(`[Interactive] Load failed for ${id}:`, error);
          return;
        }
        this.interactiveSounds[id] = sound;
        sound.play();
      });
    });
  }
}

const audioServiceInstance = AudioService.getInstance();
export default audioServiceInstance;
