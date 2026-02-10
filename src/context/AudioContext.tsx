import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';
import { Scene } from '../constants/scenes';

interface AudioContextType {
  activeSoundId: string | null;
  playbackState: State;
  currentScene: Scene | null;
  currentBaseSceneId: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  activeSmallSceneIds: string[];
  remainingTime: number | null;
  initialRemaining: number | null;
  isTimerActive: boolean;
  ambientVolume: number;
  play: (scene?: Scene) => Promise<void>;
  pause: () => Promise<void>;
  togglePlayback: (scene: Scene) => Promise<void>;
  syncNativeStatus: () => Promise<void>;
  setSleepTimer: (minutes: number) => Promise<void>;
  clearSleepTimer: () => void;
  updateAmbientVolume: (volume: number) => void;
  setAmbient: (id: string | null) => Promise<void>;
  getAmbientVolumeById: (id: string) => number;
  toggleAmbience: (scene: Scene, fromSource: 'Floating Icon' | 'Bottom List') => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSoundId, setActiveSoundId] = useState<string | null>(AudioService.getCurrentBaseSceneId());
  const [playbackState, setPlaybackState] = useState<State>(AudioService.getCurrentState());
  const [currentScene, setCurrentScene] = useState<Scene | null>(AudioService.getCurrentScene());
  const [currentBaseSceneId, setCurrentBaseSceneId] = useState<string | null>(AudioService.getCurrentBaseSceneId());
  const [activeSmallSceneIds, setActiveSmallSceneIds] = useState<string[]>(AudioService.getActiveSmallSceneIds());
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [initialRemaining, setInitialRemaining] = useState<number | null>(AudioService.getInitialSleepSeconds());
  const [ambientVolume, setAmbientVolume] = useState<number>(AudioService.getAmbientVolume());

  // 初始化时尝试从 Service 同步一次状态
  useEffect(() => {
    const endTime = AudioService.getSleepEndTime();
    if (endTime) {
      const remain = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setRemainingTime(remain);
    }
  }, []);

  const isPlaying = playbackState === State.Playing;
  const isBuffering = playbackState === State.Buffering || playbackState === State.Loading;
  const isTimerActive = remainingTime !== null && remainingTime > 0;

  // Sync state from AudioService
  useEffect(() => {
    const unsubscribeState = AudioService.addAudioStateListener((state) => {
      setActiveSoundId(state.id);
      setPlaybackState(state.state);
      setCurrentScene(AudioService.getCurrentScene());
      setCurrentBaseSceneId(AudioService.getCurrentBaseSceneId());
      setActiveSmallSceneIds(AudioService.getActiveSmallSceneIds());
    });

    const unsubscribeSmallScenes = AudioService.addSmallScenesListener((ids) => {
      setActiveSmallSceneIds(ids);
    });

    const unsubscribeVolume = AudioService.addVolumeListener((vol) => {
      setAmbientVolume(vol);
    });

    const unsubscribeTimer = AudioService.addSleepTimerListener((remaining) => {
      setRemainingTime(remaining);
      // 如果 initialRemaining 为空且当前有剩余时间，说明是重入页面，尝试恢复初始时间
      if (remaining !== null && initialRemaining === null) {
        // 这里的逻辑可能需要更严谨，或者由 AudioService 直接提供 initialRemaining
        setInitialRemaining(AudioService.getInitialSleepSeconds());
      } else if (remaining === null) {
        setInitialRemaining(null);
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeSmallScenes();
      unsubscribeVolume();
      unsubscribeTimer();
    };
  }, [initialRemaining]);

  const updateAmbientVolume = useCallback((volume: number) => {
    AudioService.updateAmbientVolume(volume);
  }, []);

  const setAmbient = useCallback(async (id: string | null) => {
    if (id) {
      await AudioService.playAmbient(id);
    } else {
      await AudioService.stopAllAmbient();
    }
  }, []);

  const getAmbientVolumeById = useCallback((id: string) => {
    return AudioService.getAmbientVolumeById(id);
  }, []);

  const toggleAmbience = useCallback(async (scene: Scene, fromSource: 'Floating Icon' | 'Bottom List' = 'Floating Icon') => {
    await AudioService.toggleAmbience(scene);
  }, []);

  const play = useCallback(async (scene?: Scene) => {
    if (scene) {
      await AudioService.switchSoundscape(scene);
    } else {
      await AudioService.play();
    }
  }, []);

  const pause = useCallback(async () => {
    await AudioService.pause();
  }, []);

  const togglePlayback = useCallback(async (scene: Scene) => {
    await AudioService.togglePlayback(scene);
  }, []);

  const syncNativeStatus = useCallback(async () => {
    await AudioService.syncNativeStatus();
  }, []);

  const setSleepTimer = useCallback(async (minutes: number) => {
    await AudioService.setSleepTimer(minutes);
  }, []);

  const clearSleepTimer = useCallback(() => {
    AudioService.clearSleepTimer();
  }, []);

  return (
    <AudioContext.Provider
      value={{
        activeSoundId,
        playbackState,
        currentScene,
        currentBaseSceneId,
        isPlaying,
        isBuffering,
        activeSmallSceneIds,
        remainingTime,
        initialRemaining,
        isTimerActive,
        ambientVolume,
        play,
        pause,
        togglePlayback,
        syncNativeStatus,
        setSleepTimer,
        clearSleepTimer,
        updateAmbientVolume,
        setAmbient,
        getAmbientVolumeById,
        toggleAmbience,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
