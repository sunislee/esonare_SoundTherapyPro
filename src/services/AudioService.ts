import { Audio } from 'expo-av';
import { State } from 'react-native-track-player';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';

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
  isPlaying(): boolean {
    return this.soundObjects.size > 0;
  }

  getCurrentState(): State {
    return this.isPlaying() ? State.Playing : State.Paused;
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

  async loadAudio() {
    // 预加载逻辑，expo-av 可以在 playScene 时动态加载
    // 这里保持接口兼容
    console.log('[AudioService] loadAudio called (placeholder)');
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
    return () => this.audioStateListeners.delete(listener);
  }

  addSmallScenesListener(listener: (ids: string[]) => void) {
    this.smallScenesListeners.add(listener);
    return () => this.smallScenesListeners.delete(listener);
  }

  addVolumeListener(listener: (vol: number) => void) {
    this.volumeListeners.add(listener);
    return () => this.volumeListeners.delete(listener);
  }

  addSleepTimerListener(listener: (remaining: number | null) => void) {
    this.timerListeners.add(listener);
    return () => this.timerListeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
    const currentState = this.getCurrentState();
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
      if (this.soundObjects.has(scene.id)) return;

      const { sound } = await Audio.Sound.createAsync(
        scene.audioFile,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.soundObjects.set(scene.id, sound);
    } catch (error) {
      console.error(`[AudioService] Error playing scene ${scene.id}:`, error);
    }
  }

  async stopScene(sceneId: string) {
    const sound = this.soundObjects.get(sceneId);
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      this.soundObjects.delete(sceneId);
    }
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

      // 2. 联动激活逻辑：如果是呼吸类场景，强制激活 8 个互动按钮
      const isBreathScene = scene.id.includes('breath') || (scene.title && scene.title.includes('呼吸'));
      if (isBreathScene) {
        console.log('[AudioService] Auto-activating 8 interactive buttons for breath context');
        for (const smallId of SMALL_SCENE_IDS) {
          const smallScene = SCENES.find(s => s.id === smallId);
          if (smallScene) {
            await this.toggleAmbience(smallScene, true);
          }
        }
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
    this.notifyListeners();
  }

  async stopAll() {
    for (const sceneId of this.soundObjects.keys()) {
      await this.stopScene(sceneId);
    }
    this.activeSmallScenes.clear();
    this.currentBaseScene = null;
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