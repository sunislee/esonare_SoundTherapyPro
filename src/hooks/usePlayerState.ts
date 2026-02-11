import { useState, useEffect } from 'react';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';

/**
 * 播放器状态Hook，实时订阅全局播放器状态
 * 禁止使用本地useState管理播放状态，必须通过此Hook获取实时状态
 */
export const usePlayerState = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentState, setCurrentState] = useState<State>(State.None);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);

  useEffect(() => {
    // 订阅全局音频状态变化
    const unsubscribe = AudioService.addAudioStateListener((state) => {
      setIsPlaying(state.state === State.Playing || state.state === State.Buffering);
      setCurrentState(state.state);
      setCurrentTrackId(state.id);
    });

    // 初始同步：获取当前状态
    const syncInitialState = () => {
      try {
        // 1. 尝试从 AudioService 获取即时状态
        const currentIsPlaying = AudioService.isPlaying();
        const currentState = AudioService.getCurrentState();
        const currentScene = AudioService.getCurrentScene();
        
        // 2. 如果 Service 状态有效，立即更新本地 state
        setIsPlaying(currentIsPlaying);
        setCurrentState(currentState);
        setCurrentTrackId(currentScene?.id || null);
        
        console.log(`[usePlayerState] Immediate sync: isPlaying=${currentIsPlaying}, id=${currentScene?.id}`);

        // 3. 异步检查作为兜底
        AudioService.getRealIsPlaying().then(realIsPlaying => {
          if (realIsPlaying !== currentIsPlaying) {
            console.log(`[usePlayerState] Async sync corrected isPlaying to ${realIsPlaying}`);
            setIsPlaying(realIsPlaying);
          }
        });
      } catch (error) {
        console.error('[usePlayerState] Initial Sync Error:', error);
      }
    };

    syncInitialState();

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isPlaying,
    currentState,
    currentTrackId,
    // 提供直接操作全局播放器的方法
    pause: async () => {
      await AudioService.pause();
    },
    play: async () => {
      await AudioService.play();
    },
    getRealIsPlaying: () => AudioService.getRealIsPlaying()
  };
};

export default usePlayerState;