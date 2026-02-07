import { Image, NativeEventEmitter, NativeModules, Platform } from 'react-native';

import i18n from '../i18n';
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
  private sleepTimerFinishedListeners = new Set<() => void>();
  private sleepFadeEnabled = false;
  private sleepFadeStarted = false;
  
  private alarmTime: string | null = null;
  private alarmInterval: ReturnType<typeof setInterval> | null = null;
  private alarmListeners = new Set<(time: string | null) => void>();
  private lastSwitchTime = 0;
  private currentScene: Scene | null = null;
  private currentBaseSceneId: string | null = null;
  private isStateLocked = false;
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
  private backgroundLayers = new Map<string, Sound>();
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
        
        // Sync logic: if native layer is playing and ID mismatch, force sync
        if (tpState === State.Playing && id && this.currentAudioState.id !== id) {
          console.log(`[AudioService] Native playback detected, forcing sync ID: ${id}`);
          // Find corresponding Scene object to update currentScene
          const found = SCENES.find(s => s.id === id);
          if (found) {
            this.currentScene = found;
          }
        }
        
        this.updateAudioState(id, tpState);
      });
      nativeAudioEmitter.addListener('onAudioError', (event: any) => {
        // console.error('Native Audio Error:', event.error);
        ToastUtil.error(i18n.t('player.error.audio_playback_error'));
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
   * Start ambient mixing (includes auto-download and retry)
   */
  public async startAmbientWithDownload(id: string, retries = 3): Promise<void> {
    if (!EngineControl.isAllowed()) {
      console.warn('[AudioService] startAmbientWithDownload blocked: engine not allowed');
      return;
    }
    
    let attempt = 0;
    while (attempt < retries) {
      try {
        console.log(`[AudioService] Attempting to load ambient (Attempt ${attempt + 1}/${retries}): ${id}`);
        
        // Check asset status
        const asset = AUDIO_MANIFEST.find(a => a.id === id);
        if (!asset) {
          throw new Error(`Asset config not found for ID: ${id}`);
        }
        
        const remoteUrl = `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;
        const localPath = await DownloadService.getLocalPath(id);
        
        let targetPath = localPath;
        
        // 1. Check local resource
        if (localPath) {
          const canAccess = await this.checkFileAccess(localPath);
          if (canAccess) {
            console.log(`[AudioService] Resource ready, loading: ${localPath}`);
          } else {
            // 2. Resource missing, trigger download
            console.log(`[AudioService] Resource missing or corrupted, starting download: ${id}`);
            const downloadedPath = await DownloadService.downloadAudio(id, remoteUrl);
            if (!downloadedPath) {
              throw new Error('Download failed');
            }
            targetPath = downloadedPath;
          }
        } else {
          throw new Error('Unable to get local path');
        }

        // 3. Load to native engine (Track 1 reserved for main ambience)
        if (!targetPath) {
          throw new Error('Invalid target path');
        }
        const success = await this.loadTrack(targetPath, 1);
        if (success) {
          await this.startMixing();
          console.log(`[AudioService] Ambient loaded and playing successfully: ${id}`);
          return; // Success
        } else {
          throw new Error('Native load failed');
        }
        
      } catch (e) {
        attempt++;
        console.error(`[AudioService] Attempt ${attempt} failed:`, e);
        if (attempt >= retries) {
          ToastUtil.error(i18n.t('player.error.ambient_load_failed'));
        } else {
          // Exponential backoff
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
   * Register metering listener (0.0 - 1.0)
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
    // Every 60ms produce a metering fluctuation, smoother
    this.meteringInterval = setInterval(() => {
      if (this.currentAudioState.state === State.Playing) {
        // Use sine wave overlay with random noise to simulate natural music energy
        phase += 0.2;
        const sineWave = Math.sin(phase) * 0.15;
        const randomVariation = Math.random() * 0.15;
        
        // Map to 0.1 - 0.4 increment interval
        const level = 0.2 + sineWave + randomVariation;
        
        this.meteringListeners.forEach(listener => listener(Math.max(0, Math.min(0.5, level))));
      } else {
        // Stop energy when not playing
        this.meteringListeners.forEach(listener => listener(0));
      }
    }, 60);
  }

  private updateAudioState(id: string | null, state: State) {
    // State lock logic: if switchSoundscape is in progress, intercept non-Error pause signals
    if (this.isStateLocked && state === State.Paused) {
      console.log('🛡️ [AudioService] State locked, intercepting external/auto-pause signal');
      return;
    }

    // Only update if changed
    if (this.currentAudioState.id !== id || this.currentAudioState.state !== state) {
        this.currentAudioState = { id, state };
        this.audioStateListeners.forEach(l => l(this.currentAudioState));

        // Sync notification state
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
      // Delay 500ms to set to false, ensure lifecycle events trigger first
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
   * Play small scene sound effect
   */
  private async playSmallScene(scene: Scene): Promise<void> {
    const asset = AUDIO_MANIFEST.find(a => a.id === scene.id);
    if (!asset) return;

    // Get volume
    const storedVol = await this.getStoredVolume(scene.id);
    const volume = storedVol || 0.4;
    this.ambientVolumes[scene.id] = volume;

    const localPath = await DownloadService.getLocalPath(scene.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    
    const finalUrl = (exists && localPath) ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;

    // Android remote playback URL patch: force http and disable https
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

      // Android specific config: disable SSL verification, allow mixed content
      const soundOptions = Platform.OS === 'android' ? {
        streaming: true,
        loadIncrementally: true,
      } : {};

      const sound = new Sound(safeUrl, '', (error) => {
        if (error) {
          console.warn(`[SmallScene] Load failed for ${scene.id}:`, error, 'URL:', safeUrl);
          
          // Retry with original URL if https error
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
   * Extract Sound loaded processing logic
   */
  private async handleSoundLoaded(sound: Sound, scene: Scene, resolve: () => void) {
    const storedVol = await this.getStoredVolume(scene.id);
    const volume = storedVol || 0.4;
    
    // Ensure seamless loop: optimized for remote .m4a
    sound.setNumberOfLoops(-1);
    if (Platform.OS === 'android') {
      sound.setSpeed(1.0);
    }
    sound.setVolume(0); // Fade in from 0
    sound.play((success) => {
      if (!success) {
        console.warn(`[SmallScene] Playback failed for ${scene.id}`);
      }
    });
    
    this.smallScenes.set(scene.id, sound);
    this.emitSmallScenes();
    
    // Execute fade in
    this.fadeSound(sound, volume, 1000).catch(() => {});
    
    // Compatibility settings
    if (!this.ambientSound) {
      this.ambientSound = sound;
      this.ambientName = scene.id;
      this.ambientVolume = volume;
    }
    
    resolve();
  }

  /**
   * Toggle logic: distinguish between large and small scenes
   */
  /**
   * Smoothly adjust react-native-sound volume
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
   * Smoothly adjust TrackPlayer volume
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
   * Unified toggle ambience method
   * @param scene scene object
   * @param fromSource source identifier
   */
  public async toggleAmbience(scene: Scene, fromSource: 'Floating Icon' | 'Bottom List' = 'Bottom List'): Promise<void> {
    console.log(`🎵 [Ambience Sync] Playing: ${scene.id} from Source: ${fromSource}`);
    
    // Refresh activeSmallSceneIds to sync UI state
    this.emitSmallScenes();
    
    // Distinguish between SmallScene and Background Layer
    const backgroundLayerIds = ['interactive_rain', 'life_summer', 'interactive_ocean', 'life_fireplace'];
    
    if (backgroundLayerIds.includes(scene.id)) {
      return this.toggleBackgroundLayer(scene);
    }
    
    return this.toggleScene(scene);
  }

  /**
   * Toggle background layer
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
      this.smallScenes.delete(scene.id); // Sync state
      this.emitSmallScenes();
    } else {
      console.log('🚀 [AudioService] Starting background layer:', scene.id);
      // Reuse playSmallScene logic but store in backgroundLayers with retry
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
    const volume = storedVol || 0.5; // Default volume for background layer is slightly higher
    this.ambientVolumes[scene.id] = volume;

    const localPath = await DownloadService.getLocalPath(scene.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    
    // Forced hardcoded URL logic
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
      
      // Android specific configuration: Disable SSL verification, allow mixed content
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
        sound.setVolume(0.1); // Initial volume not 0
        sound.play();
        
        console.log(`🎵 [AudioService] BackgroundLayer Sound playing: ${scene.id} at volume 0.1, starting fade to ${volume}`);
        
        this.backgroundLayers.set(scene.id, sound);
        this.smallScenes.set(scene.id, sound); // Sync UI state
        this.emitSmallScenes();
        
        this.fadeSound(sound, volume, 1500).catch(() => {});
        resolve();
      });
    });
  }

  public async toggleScene(scene: Scene): Promise<void> {
    if (scene.isBaseScene) {
      // Base scene logic
      const state = await TrackPlayer.getState();
      const activeTrack = await TrackPlayer.getActiveTrack();
      
      if (state === State.Playing && activeTrack?.id === scene.id) {
        // If playing current base scene, smooth pause
        console.log('Pause base scene:', scene.id);
        await this.fadeTrackPlayer(0, 800);
        await this.pause();
      } else if (activeTrack?.id === scene.id) {
        // If track is already current scene but paused, resume directly
        console.log('Resume base scene:', scene.id);
        await this.play();
        await this.fadeTrackPlayer(1.0, 1000);
      } else {
        // Start new base scene: No longer force stop all small scenes, support global ambience coexistence
        console.log('Starting new base scene:', scene.id);
        
        // If current TrackPlayer is playing, fade out first
        const currentState = await TrackPlayer.getState();
        if (currentState === State.Playing) {
          await this.fadeTrackPlayer(0, 500);
        }

        // Only pause TrackPlayer, keep smallScenes (ambience sounds)
        await TrackPlayer.pause();
        await TrackPlayer.reset();

        this.currentBaseSceneId = scene.id;
        
        // Start new base scene and play directly
        await this.switchSoundscape(scene, true);
      }
    } else {
      // Small scene logic
      const existingSound = this.smallScenes.get(scene.id);
      if (existingSound) {
        // Already playing, fade out and stop
        console.log('Fading out small scene:', scene.id);
        await this.fadeSound(existingSound, 0, 800);
        existingSound.stop();
        existingSound.release();
        this.smallScenes.delete(scene.id);
        this.emitSmallScenes();
        
        if (this.ambientName === scene.id) {
          this.ambientSound = null;
          this.ambientName = null;
        }
        // Stopping small scene doesn't interfere with main scene state
      } else {
        // Not playing, start with fade in
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

    // 1. Force clear old handle to avoid overlapping sounds
    if (this.ambientSound) {
      console.log('🔴 PHYSICAL_DEBUG: FINAL_NUCLEAR_FIX - Destroying old ambient sound');
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }
    
    // 2. Ambient sound no longer forces main player to stop
    console.log('🔊 [AudioService] setAmbient: Playing ambient alongside main scene');

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

    // Independent volume memory recovery
    const storedVol = await this.getStoredVolume(id);
    this.ambientVolume = storedVol;
    this.ambientName = id;
    this.ambientVolumes[id] = storedVol;
    this.emitVolume();

    const localPath = await DownloadService.getLocalPath(asset.id);
    const exists = localPath ? await RNFS.exists(localPath) : false;
    const finalUrl = exists ? (Platform.OS === 'android' ? `file://${localPath}` : localPath) : `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;

    // Real-time log monitoring
    console.log('🔴 PHYSICAL_DEBUG: Releasing old sound and creating NEW one for ID:', id);

    return new Promise((resolve) => {
      const sound = new Sound(finalUrl, '', (error) => {
        if (error) {
          console.warn(`[Ambient] Load failed for ${id}:`, error);
          // Don't interfere with main state
          resolve();
          return;
        }
        
        // Double check: confirm no new play command issued after load complete
        if (this.ambientName !== id) {
          console.log('🔴 PHYSICAL_DEBUG: Concurrent load detected, releasing stale sound:', id);
          sound.release();
          resolve();
          return;
        }

        this.ambientSound = sound;
        // Ensure seamless loop playback: optimized for remote .m4a
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
   * Physically force release all ambient sound instances
   */
  public async forceReleaseAllAmbient(): Promise<void> {
    console.log('🔴 PHYSICAL_DEBUG: FINAL_NUCLEAR_FIX - forceReleaseAllAmbient');
    
    // Force sync destruction
    if (this.ambientSound) {
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }
    
    this.ambientName = null;
  }

  /**
   * Play ambient sound (alias for unified interface)
   */
  public async playAmbient(id: string): Promise<void> {
    await this.forceReleaseAllAmbient();
    return this.setAmbient(id);
  }

  public updateAmbientVolume(volume: number) {
    // Defensive check
    let finalVolume = volume < 0.01 ? 0 : Math.max(0.001, volume);
    
    // Throttle: skip if volume change is minimal
    if (Math.abs(this.ambientVolume - finalVolume) < 0.005 && finalVolume !== 0 && finalVolume !== 1) {
      return;
    }
    
    this.ambientVolume = finalVolume;
    
    if (this.ambientName) {
      this.ambientVolumes[this.ambientName] = finalVolume;
      // Async save
      AsyncStorage.setItem(`@ambient_volume_${this.ambientName}`, String(finalVolume)).catch(() => {});
    }

    // Sync to native audio instance
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
    // Force block: disable all auto volume ducking
    // const targetVolume = isDucking ? 0.2 : this.volume;
    // TrackPlayer.setVolume(targetVolume).catch(() => {});
  }

  /**
   * Completely destroy audio service and release all resources
   */
  public async dispose(): Promise<void> {
    console.log('[AudioService] Disposing all resources...');
    try {
      // 1. Stop all timers
      if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
      if (this.alarmInterval) clearInterval(this.alarmInterval);
      if (this.fadeInterval) clearInterval(this.fadeInterval);
      if (this.meteringInterval) clearInterval(this.meteringInterval);
      
      this.sleepTimerInterval = null;
      this.alarmInterval = null;
      this.fadeInterval = null;
      this.meteringInterval = null;

      // 2. Stop and release audio instances
      if (this.ambientSound) {
        this.ambientSound.stop();
        this.ambientSound.release();
        this.ambientSound = null;
      }

      // 3. Stop native mixing engine
      await this.stopMixing();
      
      // 4. Clear listeners
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
   * Set main scene volume
   */
  public setMainVolume(volume: number) {
    // Defensive check: if volume < 0.01, set to 0. Otherwise use 0.001 as safety floor.
    let finalVolume = volume < 0.01 ? 0 : Math.max(0.001, volume);
    
    // Throttle: skip if volume change is minimal, reduce frequency of native module calls
    if (Math.abs(this.mainVolume - finalVolume) < 0.005 && finalVolume !== 0) {
      return;
    }
    
    this.mainVolume = finalVolume;
    
    // Async call to native module to avoid blocking JS thread
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
   * Linear volume to decibels (simplified version)
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

    ToastUtil.success(i18n.t('player.timer.set_success', { minutes }));

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
        // Isolation: comment out all fadeOutStop calls
        // this.fadeOutStop(remaining * 1000).catch(() => {});
      }

      if (remaining !== null && remaining <= 0) {
        this.clearSleepTimer(); // Stop timer first
        if (!this.sleepFadeEnabled) {
          try {
            // Isolation: comment out all fadeOutStop calls
            // await this.fadeOutStop(3000);
            await this.pause();
          } catch (e) {}
        }
        ToastUtil.info(i18n.t('player.timer.finished'));
        this.sleepTimerFinishedListeners.forEach(l => l());
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
    ToastUtil.success(i18n.t('alarm_msg.set_success', { time }));
  }

  public cancelAlarm() {
    this.alarmTime = null;
    this.emitAlarm();
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    ToastUtil.info(i18n.t('alarm_msg.cancelled'));
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
        console.log(`[AudioService] Alarm triggered at ${current}`);
        this.triggerAlarm();
      }
    }, 1000);
  }

  private async triggerAlarm() {
    const ALARM_SCENE = new Scene({
      id: 'morning-alarm',
      title: i18n.t('alarm_msg.morning_title'),
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
      ToastUtil.success(i18n.t('alarm_msg.morning_msg'));
    } catch (e) {
      console.error('[AudioService] Alarm trigger failed', e);
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

  public addSleepTimerFinishedListener(listener: () => void): () => void {
    this.sleepTimerFinishedListeners.add(listener);
    return () => {
      this.sleepTimerFinishedListeners.delete(listener);
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
          // console.log('📡 NativeAudioModule interface list:', Object.keys(NativeModules.NativeAudioModule || {}));
        }
        // Double check initialization before calling setupPlayer
        try {
          await TrackPlayer.setupPlayer({ 
            autoHandleInterruptions: true,
            waitForBuffer: false, // Disable buffer waiting to reduce startup latency
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
          3000, // Reduced timeout
          'updateOptions'
        );

        // Delay notification service initialization to reduce startup latency
        setTimeout(() => {
          NotificationService.setup().catch(console.error);
        }, 1000);

        // Delay URL validation to reduce startup latency
        setTimeout(() => {
          console.log('🚀 [URL VALIDATION] Current Source:', IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE');
          const oceanUrl = `${REMOTE_RESOURCE_BASE_URL}base/ocean.mp3`;
          const matchUrl = `${REMOTE_RESOURCE_BASE_URL}interactive/match_strike.wav`;
          console.log('🔗 [VERIFY] nature_ocean:', oceanUrl);
          console.log('🔗 [VERIFY] interactive_match:', matchUrl);
        }, 2000);

        // Initialization: clear all ambient sound residues
        await this.forceReleaseAllAmbient();

        this.isInitialized = true;

        // Remove error auto-reconnect logic to avoid infinite loops
        TrackPlayer.addEventListener(Event.PlaybackError, async (error) => {
          // console.error('Playback Error detected:', error);
          // try {
          //   await this.setupPlayer();
          // } catch (reInitError) {
          //   console.error('Failed to re-initialize after error:', reInitError);
          // }
        });

        // Seal: remove all side effects triggered by PlaybackState listeners
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
      
      // 1. Priority check for local download
      const localPath = await DownloadService.getLocalPath(soundscape.id);
      let localFileValid = false;
      if (localPath) {
        try {
          localFileValid = await RNFS.exists(localPath);
          if (localFileValid) {
            // Force URL format: use file:/// (three slashes)
            resolvedUri = `file://${localPath}`; 
            console.log('📂 [AudioService] Using cached local file (forced prefix):', resolvedUri);
          }
        } catch (e) {
          console.warn('[AudioService] Local file check failed:', e);
        }
      }

      // 2. Fallback: if local file missing or validation fails, use remote URL from scenes.ts
      if (!resolvedUri || !localFileValid) {
        console.log('🌐 [AudioService] Local file missing, using remote URL:', soundscape.audioUrl);
        resolvedUri = soundscape.audioUrl;
      }

      // 3. Ultimate Fallback: if remote URL missing, try finding filename in AUDIO_MANIFEST
      if (!resolvedUri) {
        console.log('📦 [AudioService] Remote URL missing, falling back to manifest for:', soundscape.id);
        const manifestItem = AUDIO_MANIFEST.find(item => item.id === soundscape.id);
        if (manifestItem) {
          resolvedUri = `${REMOTE_RESOURCE_BASE_URL}${manifestItem.filename}`;
          console.log('🔗 [AudioService] Reconstructed URL from manifest:', resolvedUri);
        }
      }

      // 4. Built-in resource fallback
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
        const msg = i18n.t('error.load_audio_failed');
        ToastUtil.error(msg);
        return;
      }

      // Add to history
      HistoryService.addToHistory(soundscape.id);

      // Use TrackPlayer uniformly, discard NativeAudioModule original control
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

      await TrackPlayer.setVolume(1.0); // Must setVolume(1.0) immediately after add
      await TrackPlayer.setRepeatMode(RepeatMode.Track);

      if (autoPlay) {
        // Wait for bottom layer to be ready (PlaybackState)
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

        await TrackPlayer.setVolume(1.0); // Ensure full volume at play moment
        await TrackPlayer.play();
        
        // Set state to Playing now
        this.updateAudioState(soundscape.id, State.Playing);

        // Hardcore log: verify final volume value
        const currentVol = await TrackPlayer.getVolume();
        console.log('🔈 [FINAL CHECK] Player Volume is:', currentVol);

        // Silence monitoring (anti-clumsy design)
        if (currentVol === 0) {
          console.error('❌ [SILENCE ALERT] Player volume is ZERO! User won\'t hear anything.');
          ToastUtil.error(i18n.t('error.system_mute'));
        }

        // Forced volume correction: ensure volume is 1.0 again 100ms after play
        setTimeout(() => {
          TrackPlayer.setVolume(1.0).catch(() => {});
          console.log('🔊 [AudioService] Volume correction executed: 1.0');
        }, 100);
      } else {
        // If not auto-playing, set to Paused
        this.updateAudioState(soundscape.id, State.Paused);
      }

    } catch (e: any) {
      const message = (e && e.message) || String(e);
      const msg = i18n.t('error.load_audio_failed_with_msg', { message });
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
    this.isStateLocked = true; // Force lock state to prevent external pause interference during loading

    // 1. Enter loading state
    console.log(`🚀 [AudioService] switchSoundscape START: ${newScene.id}, autoPlay: ${autoPlay}`);
    this.updateAudioState(newScene.id, State.Loading);

    try {
      await this.ensureSetup();
      
      this.currentScene = newScene; 
      this.currentBaseSceneId = newScene.id;

      // Add to history
      HistoryService.addToHistory(newScene.id);

      let resolvedUri = '';
      
      // 2. Local resource positioning
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

      // 3. Physical reset of the player
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
        // 4. Critical: Wait for OnPrepared (State.Ready)
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
          }, 8000); // Extended timeout to 8s
        });

        // 5. Physical start
        await TrackPlayer.play();
        
        // 6. Unlock and update state after success
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
      ToastUtil.error(i18n.t('error.switch_failed'));
    } finally {
      this.isSwitching = false;
      this.isStateLocked = false;
    }
  }

  private async fadeVolume(from: number, to: number, duration: number): Promise<void> {
    // Destroyed: Function body cleared
  }

  private async fadeInOutput(duration: number): Promise<void> {
    // Destroyed: Function body cleared
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
    try {
      // 只有在初始化完成后才尝试同步，避免冷启动时的 unhandled promise rejection
      if (!this.isInitialized) {
        // console.log('[AudioService] Skipping syncNativeStatus: Player not initialized');
        return;
      }
      const state = await TrackPlayer.getPlaybackState();
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (activeTrack) {
        this.updateAudioState(activeTrack.id as string, state.state);
      }
    } catch (e) {
      // 静默处理同步错误，防止崩溃
      // console.warn('[AudioService] syncNativeStatus failed:', e);
    }
  }

  /**
   * Force reset and play specific scene
   * Resolves the infinite loop issue where "button changed but no sound"
   */
  public async forceResetAndPlay(scene: Scene): Promise<void> {
    console.log('🚀 [AudioService] Executing force reset and play:', scene.id, 'URL:', scene.audioUrl);
    try {
      await this.ensureSetup();
      await TrackPlayer.reset();
      
      let resolvedUri = '';
      
      // 1. Priority check for local download
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

      // 2. Fallback: use remote URL
      if (!resolvedUri || !localFileValid) {
        console.log('🌐 [AudioService] Local file missing (force), using remote URL:', scene.audioUrl);
        resolvedUri = scene.audioUrl;
      }

      // 3. Ultimate Fallback: use built-in assets
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
        throw new Error(i18n.t('error.resolve_failed'));
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
      await TrackPlayer.setVolume(1.0); // Force full volume
      await TrackPlayer.play();
      
      // Force volume correction
      setTimeout(() => {
        TrackPlayer.setVolume(1.0).catch(() => {});
        console.log('🔊 [AudioService] Volume correction executed (forceReset): 1.0');
      }, 100);
      
      this.currentScene = scene;
      this.updateAudioState(scene.id, State.Playing);
      ToastUtil.success(i18n.t('actions.restored'));
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      console.error('❌ [AudioService] forceResetAndPlay failed:', message);
      ToastUtil.error(i18n.t('error.reset_failed_with_msg', { message }));
    }
  }

  public async play(): Promise<void> {
    await this.ensureSetup();
    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (activeTrack) {
        console.log('Final Audio URL (play):', activeTrack.url);
      }
      
      // Enhance cold start: if no activeTrack during play, it means it's not loaded, force load current scene
      if (!activeTrack && this.currentScene) {
      console.log('⚠️ [AudioService] No active track during play, trying to load current scene:', this.currentScene.id);
        await this.loadAudio(this.currentScene, true);
        return;
      }

      if (this.ambientSound) {
        this.ambientSound.play((success) => {
             if (!success) console.log('Ambient playback failed');
        });
      }

      await TrackPlayer.play();
      // Force volume correction: ensure volume is 1.0 again 100ms after play
      setTimeout(() => {
        TrackPlayer.setVolume(1.0).catch(() => {});
        console.log('🔊 [AudioService] Volume correction executed (play): 1.0');
      }, 100);
      // Force update playback state
      if (this.currentScene) {
        this.updateAudioState(this.currentScene.id, State.Playing);
      }
    } catch (e: any) {
      const message = (e && e.message) || String(e);
      const msg = i18n.t('error.play_failed_with_msg', { message });
      ToastUtil.error(msg);
    }
  }

  /**
   * Stop all sounds (Main scene + Ambient layers)
   * Physical level stop, ensure no residues
   */
  public async stopAll(): Promise<void> {
    console.log('🛑 [AudioService] stopAll triggered: Clearing all sounds');
    await this.ensureSetup();
    try {
      // 1. Stop ambient layers (Native Sound)
      this.stopAllAmbient();

      // 2. Physical reset TrackPlayer (Main scene)
      await TrackPlayer.reset();
      
      this.updateAudioState(null, State.Stopped);
    } catch (e) {
      console.error('[AudioService] stopAll failed:', e);
    }
  }

  /**
   * Stop all ambient layers
   */
  public stopAllAmbient(): void {
    console.log('🔇 [AudioService] Stopping all ambient layers');
    
    // Stop mixing layer (NativeAudioModule)
    if (NativeAudioModule && NativeAudioModule.stopMixing) {
      NativeAudioModule.stopMixing().catch(() => {});
    }

    // Stop legacy compatibility objects
    if (this.ambientSound) {
      this.ambientSound.stop();
      this.ambientSound.release();
      this.ambientSound = null;
    }

    // Stop and clean up small scenes/background layers (react-native-sound)
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
   * Get real playback state of bottom layer (Physical check)
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
    // Print stack trace to track what triggered the pause
    const stack = new Error().stack;
    console.log(stack);

    await this.ensureSetup();
    try {
      if (this.ambientSound) {
        this.ambientSound.pause();
      }

      await TrackPlayer.pause();
      console.log('DEBUG: PHYSICAL PAUSE EXECUTED');
      // Fix "pause not updating": force update JS layer playback state to Paused
      if (this.currentScene) {
        // Temporarily unlock to allow state update
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
      const msg = i18n.t('error.pause_failed_with_msg', { message });
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
      console.log('🔊 [AudioService] TrackPlayer volume synced:', this.volume);
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
    // Destroyed: Function body cleared
  }

  public async pauseWithFadeOut(): Promise<void> {
    // Isolated: direct pause
    await this.pause();
  }

  public async stop(): Promise<void> {
    await this.ensureSetup();
    try {
      if (this.ambientSound) {
        this.ambientSound.stop();
      }
      await TrackPlayer.reset(); // reset is more thorough than stop, can directly destroy notification bar
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

// Export singleton instance as default export, which is the most common pattern in React Native
// So that import AudioService from './AudioService' gets the instance that can be called directly
const instance = AudioService.getInstance();

// Also to prevent require().default getting the class in some environments, we do an extreme compatibility:
// Make the instance itself have a default property pointing to itself
(instance as any).default = instance;

export default instance;
export { AudioService };
