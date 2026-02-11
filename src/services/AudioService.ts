import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { State } from 'react-native-track-player';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';

// 显式 require 映射表，避免动态拼接
const AUDIO_REQUIRE_MAP: Record<string, any> = {
  'base/ocean.mp3': require('../assets/audio/base/ocean.mp3'),
  'base/forest.mp3': require('../assets/audio/base/forest.mp3'),
  'base/deep_sea.mp3': require('../assets/audio/base/deep_sea.mp3'),
  'base/morning_river.mp3': require('../assets/audio/base/morning_river.mp3'),
  'base/night_tribe.mp3': require('../assets/audio/base/night_tribe.mp3'),
  'base/rain_boat.mp3': require('../assets/audio/base/rain_boat.mp3'),
  'base/fire.mp3': require('../assets/audio/base/fire.mp3'),
  'base/summer_fireworks.m4a': require('../assets/audio/base/summer_fireworks.m4a'),
  'base/final_healing_rain.m4a': require('../assets/audio/base/final_healing_rain.m4a'),
  'base/liquid_peace.m4a': require('../assets/audio/base/liquid_peace.m4a'),
  'base/crystal_bowl.m4a': require('../assets/audio/base/crystal_bowl.m4a'),
  'base/alpha_wave.m4a': require('../assets/audio/base/alpha_wave.m4a'),
  'base/binaural_beat.mp3': require('../assets/audio/base/binaural_beat.mp3'),
  'fx/library_vibe.m4a': require('../assets/audio/fx/library_vibe.m4a'),
  'fx/zen_bowl.m4a': require('../assets/audio/fx/zen_bowl.m4a'),
  'interactive/white_noise.m4a': require('../assets/audio/interactive/white_noise.m4a'),
  'interactive/wind-chime.m4a': require('../assets/audio/interactive/wind-chime.m4a'),
  'interactive/breath.m4a': require('../assets/audio/interactive/breath.m4a'),
  'interactive/apple_crunch.m4a': require('../assets/audio/interactive/apple_crunch.m4a'),
  'interactive/match_strike.wav': require('../assets/audio/interactive/match_strike.wav'),
};

class AudioService {
  private static instance: AudioService;
  private soundObjects: Map<string, Audio.Sound> = new Map();
  private activeSmallScenes: Set<string> = new Set();
  private currentBaseScene: Scene | null = null;
  private listeners: Set<() => void> = new Set();
  private audioStateListeners: Set<(state: { id: string | null; state: State }) => void> = new Set();
  private smallScenesListeners: Set<(ids: string[]) => void> = new Set();
  private volumeListeners: Set<(vol: number) => void> = new Set();
  private timerListeners: Set<(remaining: number | null) => void> = new Set();
  private isSwitching = false;
  private ambientVolume = 1.0;
  private sleepEndTime: number | null = null;
  private initialSleepSeconds: number | null = null;
  private sleepTimer: any = null;

  private constructor() {}

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
    // expo-av 不需要像 TrackPlayer 那样复杂的 setup
    // 这里仅作为接口对齐，并确保音频模式正确
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // InterruptionModeIOS.DoNotMix
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: 1, // InterruptionModeAndroid.DoNotMix
        playThroughEarpieceAndroid: false,
      });
      console.log('[AudioService] Player setup completed (Expo AV mode)');
    } catch (e) {
      console.error('[AudioService] Failed to setup audio mode', e);
    }
  }

  async loadAudio(scene: Scene, shouldPlay: boolean = false) {
    try {
      if (!scene || !scene.filename) {
        console.error(`[AudioService] loadAudio: Scene or filename is null`);
        return;
      }

      if (this.soundObjects.has(scene.id)) return;

      console.log(`[AudioService] Preloading scene: ${scene.id} (shouldPlay: ${shouldPlay})`);
      
      const source = AUDIO_REQUIRE_MAP[scene.filename];

      if (!source) {
        const errorMsg = `[AudioService] No audio source mapping found for filename: "${scene.filename}" in SCENE: ${scene.id}`;
        console.warn(errorMsg);
        return;
      }

      // 获取 require 的原始路径信息（如果可能）
      const assetInfo = typeof source === 'number' ? `Asset ID: ${source}` : 'Resolved Source';
      console.log(`[AudioService] Loading source for ${scene.filename}: ${assetInfo}`);

      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: shouldPlay, isLooping: true, volume: this.ambientVolume }
      );
      this.soundObjects.set(scene.id, sound);
      if (shouldPlay) {
        this.isActuallyPlaying = true;
        this.notifyListeners();
      }
    } catch (e: any) {
      const source = AUDIO_REQUIRE_MAP[scene.filename];
      console.error(`[AudioService] 🚨 PRELOAD FAILED: ${scene.id}. File: ${scene.filename}`, {
        error: e.message,
        stack: e.stack,
        source: source
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
  }

  getActiveSmallSceneIds(): string[] {
    return Array.from(this.activeSmallScenes);
  }

  getCurrentBaseSceneId(): string | null {
    return this.currentBaseScene?.id || null;
  }

  async playScene(scene: Scene) {
    try {
      if (!scene || !scene.filename) {
        console.error(`[AudioService] Scene or filename is null for ${scene?.id}`);
        return;
      }

      if (this.soundObjects.has(scene.id)) {
        const sound = this.soundObjects.get(scene.id);
        await sound?.playAsync();
        return;
      }

      const source = AUDIO_REQUIRE_MAP[scene.filename];

      // Defensive check for source
      if (!source) {
        throw new Error(`Invalid audio source for scene ${scene.id} (file: ${scene.filename}). Mapping missing in AUDIO_REQUIRE_MAP.`);
      }

      console.log(`[AudioService] Loading and playing scene ${scene.id} from mapping: ${scene.filename}`);

      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: true, isLooping: true, volume: this.ambientVolume }
      );
      this.soundObjects.set(scene.id, sound);
      this.isActuallyPlaying = true;
      this.notifyListeners();
    } catch (error: any) {
      const source = AUDIO_REQUIRE_MAP[scene.filename];
      console.error(`[AudioService] CRITICAL: Failed to play scene ${scene.id}.`, {
        filename: scene.filename,
        error: error.message,
        source: source
      });
      console.warn(`[AudioService] 🚨 FILE ERROR: The audio file "${scene.filename}" failed to load! Check if it's 0-byte or corrupted in android/app/src/main/assets/audio/`);
    }
  }

  async pause() {
    console.log('[AudioService] Pausing all sounds');
    for (const sound of this.soundObjects.values()) {
      await sound.pauseAsync();
    }
    this.isActuallyPlaying = false;
    this.notifyListeners();
  }

  async play() {
    console.log('[AudioService] Resuming all sounds');
    if (this.soundObjects.size === 0 && this.currentBaseScene) {
      await this.playScene(this.currentBaseScene);
    } else {
      for (const sound of this.soundObjects.values()) {
        await sound.playAsync();
      }
    }
    this.isActuallyPlaying = true; // 强制设为 true，既然已经执行了 play
    this.notifyListeners();
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
    const sound = this.soundObjects.get(sceneId);
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      this.soundObjects.delete(sceneId);
    }
    if (this.soundObjects.size === 0) {
      this.isActuallyPlaying = false;
    }
    // 不要在这里调用 notifyListeners，因为 stopScene 经常被 stopAll 批量调用，
    // 为了性能和避免 UI 抖动，我们让调用者决定何时通知。
    // 但如果这是单次调用，或者调用者没有后续通知，这里还是得加个保险。
    // 观察发现 switchSoundscape 和 toggleAmbience 都会在调用后补 notifyListeners。
  }

  // --- 核心优化位置 ---
  async switchSoundscape(scene: Scene) {
    if (this.isSwitching) return;
    this.isSwitching = true;
    
    console.log(`[AudioService] Switching to soundscape: ${scene.id} (${scene.title})`);
    
    try {
      // 1. 停止当前所有音频并清空激活列表
      await this.stopAll();
      this.activeSmallScenes.clear();

      // 2. 联动激活逻辑：如果是呼吸类场景，仅同步状态但不播放音效，实现“开场静默”
      const isBreathScene = scene.id === 'nature_deep_sea' || scene.id === 'nature_misty_forest' || scene.id.includes('breath');
      if (isBreathScene) {
        console.log('[AudioService] Breath context detected. Ensuring interaction sounds are silent on start.');
        // 按照用户要求，初始化时不自动播放任何互动音效
        this.activeSmallScenes.clear(); 
      }

      // 3. 设置并播放新的主场景
      this.currentBaseScene = scene;
      await this.playScene(scene);
      
      this.notifyListeners();
    } finally {
      this.isSwitching = false;
    }
  }

  async toggleAmbience(scene: Scene, forceState?: boolean) {
    const isCurrentlyActive = this.activeSmallScenes.has(scene.id);
    const targetState = forceState !== undefined ? forceState : !isCurrentlyActive;

    if (isCurrentlyActive === targetState) return;

    if (targetState) {
      this.activeSmallScenes.add(scene.id);
      await this.playScene(scene);
    } else {
      this.activeSmallScenes.delete(scene.id);
      await this.stopScene(scene.id);
    }
    // playScene/stopScene 内部已经调用了 notifyListeners，但这里为了确保 smallScenesListeners 触发，再补一次
    this.notifyListeners();
  }

  async togglePlayback(scene: Scene) {
    if (this.currentBaseScene?.id === scene.id && this.isActuallyPlaying) {
      await this.pause();
    } else {
      await this.switchSoundscape(scene);
    }
  }

  async stopAll() {
    for (const sceneId of this.soundObjects.keys()) {
      await this.stopScene(sceneId);
    }
    this.activeSmallScenes.clear();
    this.currentBaseScene = null;
    this.isActuallyPlaying = false;
    this.notifyListeners();
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