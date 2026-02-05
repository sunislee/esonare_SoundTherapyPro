import { Platform, AppState, AppStateStatus, NativeEventEmitter, NativeModules } from 'react-native';
import i18n from '../i18n';
import Sound from 'react-native-sound';
import TrackPlayer, {
  Capability,
  RepeatMode,
  AppKilledPlaybackBehavior,
  Event,
  State,
} from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { AUDIO_MANIFEST, REMOTE_RESOURCE_BASE_URL } from '../constants/audioAssets';
import ToastUtil from '../utils/ToastUtil';

const { NativeAudioModule } = NativeModules;
const nativeAudioEmitter = NativeAudioModule ? new NativeEventEmitter(NativeAudioModule) : null;

interface AudioItem {
  id: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
  isLocal?: boolean;
}

interface PlaybackOptions {
  seamlessLoop?: boolean;
  volume?: number;
  fadeInDuration?: number;
}

class AudioManagerService {
  private static instance: AudioManagerService | null = null;
  private isInitialized = false;
  private appState: AppStateStatus = AppState.currentState;
  private activeAudioItems = new Map<string, Sound>();
  private backgroundPlaybackEnabled = true;
  private lastPlayedItem: AudioItem | null = null;
  private isAppInBackground = false;
  private volume = 1;
  private playbackListeners = new Set<(state: { id: string | null; state: State }) => void>();
  private currentState: { id: string | null; state: State } = { id: null, state: State.None };

  private appStateSubscription: { remove: () => void } | null = null;

  private constructor() {
    this.setupAppStateListener();
    this.setupAudioCategory();
  }

  private setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  private setupAudioCategory() {
    (Sound as any).setCategory('Ambient', true);
  }

  private handleAppStateChange(nextAppState: AppStateStatus) {
    if (this.appState === 'active' && nextAppState === 'background') {
      this.isAppInBackground = true;
      this.handleEnterBackground();
    } else if (this.appState === 'background' && nextAppState === 'active') {
      this.isAppInBackground = false;
      this.handleEnterForeground();
    }
    this.appState = nextAppState;
  }

  private async handleEnterBackground() {
    if (this.backgroundPlaybackEnabled) {
      console.log('[AudioManagerService] App entering background, continuing playback');
      // Ensure TrackPlayer continues playing in the background
      const currentState = await TrackPlayer.getState();
      if (currentState === State.Playing) {
        await this.ensureBackgroundPlayback();
      }
    } else {
      console.log('[AudioManagerService] App entering background, pausing playback');
      await this.pauseAll();
    }
  }

  private async handleEnterForeground() {
    console.log('[AudioManagerService] App entering foreground');
    // Restore playback state
    if (this.lastPlayedItem) {
      const currentState = await TrackPlayer.getState();
      if (currentState === State.Paused) {
        await TrackPlayer.play();
      }
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
        waitForBuffer: true,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause],
      });

      this.setupTrackPlayerListeners();
      this.isInitialized = true;
      console.log('[AudioManagerService] Initialized successfully');
    } catch (error) {
      console.error('[AudioManagerService] Initialization failed:', error);
      throw error;
    }
  }

  private setupTrackPlayerListeners() {
    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      this.updatePlaybackState(this.lastPlayedItem?.id || null, event.state);
    });

    TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
      console.error('[AudioManagerService] Playback error:', error);
      ToastUtil.error(i18n.t('error.audio_playback_error'));
    });
  }

  private updatePlaybackState(id: string | null, state: State) {
    if (this.currentState.id !== id || this.currentState.state !== state) {
      this.currentState = { id, state };
      this.playbackListeners.forEach(listener => listener(this.currentState));
    }
  }

  public async loadAudio(id: string, options: PlaybackOptions = {}): Promise<void> {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) {
      throw new Error(`Audio asset not found for id: ${id}`);
    }

    await this.initialize();

    let resolvedUrl = '';
    const localPath = await this.getLocalPath(id);
    const localFileValid = localPath ? await RNFS.exists(localPath) : false;

    if (localFileValid && localPath) {
      resolvedUrl = Platform.OS === 'android' ? `file://${localPath}` : localPath;
    } else {
      resolvedUrl = `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`;
    }

    if (Platform.OS === 'android' && resolvedUrl.startsWith('https://')) {
      resolvedUrl = resolvedUrl.replace('https://', 'http://');
    }

    const audioItem: AudioItem = {
      id,
      url: resolvedUrl,
      title: asset.title,
      artist: 'Sound Therapy',
      isLocal: localFileValid,
    };

    await this.playAudio(audioItem, options);
  }

  public async playAudio(audioItem: AudioItem, options: PlaybackOptions = {}): Promise<void> {
    try {
      await this.stopAll();

      if (options.seamlessLoop || Platform.OS === 'ios') {
        await this.playWithTrackPlayer(audioItem, options);
      } else {
        await this.playWithSoundModule(audioItem, options);
      }

      this.lastPlayedItem = audioItem;
    } catch (error) {
      console.error('[AudioManagerService] Play audio failed:', error);
      throw error;
    }
  }

  private async playWithTrackPlayer(audioItem: AudioItem, options: PlaybackOptions = {}): Promise<void> {
    await TrackPlayer.reset();

    await TrackPlayer.add({
      id: audioItem.id,
      url: audioItem.url,
      title: audioItem.title,
      artist: audioItem.artist || 'Sound Therapy',
      artwork: audioItem.artwork,
    });

    await TrackPlayer.setVolume(options.volume || this.volume);
    await TrackPlayer.setRepeatMode(RepeatMode.Track);

    await new Promise<void>((resolve) => {
      const listener = TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
        if (state.state === State.Ready) {
          listener.remove();
          resolve();
        }
      });
      setTimeout(() => {
        listener.remove();
        resolve();
      }, 5000);
    });

    await TrackPlayer.play();
    this.updatePlaybackState(audioItem.id, State.Playing);
  }

  private async playWithSoundModule(audioItem: AudioItem, options: PlaybackOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const sound = new Sound(audioItem.url, '', (error) => {
        if (error) {
          console.error('[AudioManagerService] Sound load failed:', error);
          reject(error);
          return;
        }

        sound.setNumberOfLoops(options.seamlessLoop ? -1 : 0);
        sound.setVolume(options.volume || this.volume);
        sound.play((success) => {
          if (!success) {
            console.warn('[AudioManagerService] Playback failed');
            reject(new Error('Playback failed'));
          } else {
            this.activeAudioItems.set(audioItem.id, sound);
            this.updatePlaybackState(audioItem.id, State.Playing);
            resolve();
          }
        });
      });
    });
  }

  public async pauseAll(): Promise<void> {
    try {
      const trackPlayerState = await TrackPlayer.getState();
      if (trackPlayerState === State.Playing) {
        await TrackPlayer.pause();
        this.updatePlaybackState(this.lastPlayedItem?.id || null, State.Paused);
      }

      this.activeAudioItems.forEach((sound) => {
        sound.pause();
      });
    } catch (error) {
      console.error('[AudioManagerService] Pause failed:', error);
    }
  }

  public async resumeAll(): Promise<void> {
    try {
      const trackPlayerState = await TrackPlayer.getState();
      if (trackPlayerState === State.Paused) {
        await TrackPlayer.play();
        this.updatePlaybackState(this.lastPlayedItem?.id || null, State.Playing);
      }

      this.activeAudioItems.forEach((sound) => {
        sound.play();
      });
    } catch (error) {
      console.error('[AudioManagerService] Resume failed:', error);
    }
  }

  public async stopAll(): Promise<void> {
    try {
      await TrackPlayer.reset();

      this.activeAudioItems.forEach((sound, id) => {
        sound.stop();
        sound.release();
        this.activeAudioItems.delete(id);
      });

      this.updatePlaybackState(null, State.Stopped);
    } catch (error) {
      console.error('[AudioManagerService] Stop failed:', error);
    }
  }

  public async setVolume(volume: number): Promise<void> {
    const finalVolume = Math.max(0, Math.min(1, volume));
    this.volume = finalVolume;

    try {
      await TrackPlayer.setVolume(finalVolume);

      this.activeAudioItems.forEach((sound) => {
        sound.setVolume(finalVolume);
      });

      await AsyncStorage.setItem('@audio_manager_volume', String(finalVolume));
    } catch (error) {
      console.error('[AudioManagerService] Set volume failed:', error);
    }
  }

  public async getVolume(): Promise<number> {
    try {
      const storedVolume = await AsyncStorage.getItem('@audio_manager_volume');
      if (storedVolume) {
        this.volume = parseFloat(storedVolume);
      }
    } catch (error) {
      console.error('[AudioManagerService] Get volume failed:', error);
    }
    return this.volume;
  }

  public setBackgroundPlaybackEnabled(enabled: boolean): void {
    this.backgroundPlaybackEnabled = enabled;
    if (!enabled && this.isAppInBackground) {
      this.pauseAll().catch(console.error);
    }
  }

  public isBackgroundPlaybackEnabled(): boolean {
    return this.backgroundPlaybackEnabled;
  }

  public async getLocalPath(audioId: string): Promise<string | null> {
    try {
      const storedPath = await AsyncStorage.getItem(`@local_audio_path_${audioId}`);
      if (storedPath) {
        const exists = await RNFS.exists(storedPath);
        if (exists) {
          return storedPath;
        }
      }
      // Try to find default storage path
      const defaultPath = `${RNFS.DocumentDirectoryPath}/audio/${audioId}.mp3`;
      const exists = await RNFS.exists(defaultPath);
      if (exists) {
        return defaultPath;
      }
      return null;
    } catch (error) {
      console.error('[AudioManagerService] Get local path failed:', error);
      return null;
    }
  }

  private async ensureBackgroundPlayback(): Promise<void> {
    try {
      const currentState = await TrackPlayer.getState();
      if (currentState === State.Playing) {
        // Ensure background playback permissions are set
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
        });
      }
    } catch (error) {
      console.error('[AudioManagerService] Ensure background playback failed:', error);
    }
  }

  public addPlaybackListener(listener: (state: { id: string | null; state: State }) => void): () => void {
    this.playbackListeners.add(listener);
    listener(this.currentState);
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  public getCurrentState(): { id: string | null; state: State } {
    return this.currentState;
  }

  public async dispose(): Promise<void> {
    try {
      await this.stopAll();
      this.appStateSubscription?.remove();
    } catch (error) {
      console.error('[AudioManagerService] Dispose failed:', error);
    }
  }

  public static getInstance(): AudioManagerService {
    if (!AudioManagerService.instance) {
      AudioManagerService.instance = new AudioManagerService();
    }
    return AudioManagerService.instance;
  }
}

export default AudioManagerService;