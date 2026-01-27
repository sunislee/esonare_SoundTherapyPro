import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';
import { Scene } from '../constants/scenes';

interface AudioContextType {
  activeSoundId: string | null;
  playbackState: State;
  currentScene: Scene | null;
  isPlaying: boolean;
  isBuffering: boolean;
  remainingTime: number | null;
  initialRemaining: number | null;
  isTimerActive: boolean;
  play: (scene?: Scene) => Promise<void>;
  pause: () => Promise<void>;
  togglePlayback: (scene: Scene) => Promise<void>;
  syncNativeStatus: () => Promise<void>;
  setSleepTimer: (minutes: number) => Promise<void>;
  clearSleepTimer: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<State>(State.None);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [initialRemaining, setInitialRemaining] = useState<number | null>(AudioService.getInitialSleepSeconds());

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
      console.log('[AudioContext] State Update:', state);
      setActiveSoundId(state.id);
      setPlaybackState(state.state);
      setCurrentScene(AudioService.getCurrentScene());
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
      unsubscribeTimer();
    };
  }, [initialRemaining]);

  const setSleepTimer = useCallback(async (minutes: number) => {
    await AudioService.setSleepTimer(minutes);
    setInitialRemaining(minutes * 60);
  }, []);

  const clearSleepTimer = useCallback(() => {
    AudioService.clearSleepTimer();
    setRemainingTime(null);
    setInitialRemaining(null);
  }, []);

  const syncNativeStatus = useCallback(async () => {
    console.log('[AudioContext] Syncing Native Status...');
    await AudioService.syncNativeStatus();
  }, []);

  const play = useCallback(async (scene?: Scene) => {
    if (scene) {
      await AudioService.loadAudio(scene, true);
    } else {
      await AudioService.play();
    }
  }, []);

  const pause = useCallback(async () => {
    await AudioService.pause();
  }, []);

  const togglePlayback = useCallback(async (scene: Scene) => {
    // 强化冷启动：如果点击的是当前正在“显示播放”的音源，但实际上没声音，触发强制重置
    if (activeSoundId === scene.id && isPlaying) {
      console.log('[AudioContext] Toggle existing scene:', scene.id);
      // 检查底层是否真的有 activeTrack
      const activeTrack = await AudioService.getCurrentActiveTrack();
      if (!activeTrack) {
        console.log('[AudioContext] Cold start sync: UI says playing but no track, forcing reset');
        await AudioService.forceResetAndPlay(scene);
        return;
      }
      await AudioService.pause();
    } else if (activeSoundId === scene.id) {
      console.log('[AudioContext] Playing scene:', scene.id);
      await AudioService.play();
    } else {
      console.log('[AudioContext] Switching to scene:', scene.id);
      await AudioService.switchSoundscape(scene);
    }
  }, [activeSoundId, isPlaying]);

  return (
    <AudioContext.Provider
      value={{
        activeSoundId,
        playbackState,
        currentScene,
        isPlaying,
        isBuffering,
        remainingTime,
        initialRemaining,
        isTimerActive,
        play,
        pause,
        togglePlayback,
        syncNativeStatus,
        setSleepTimer,
        clearSleepTimer,
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
