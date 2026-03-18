import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import AudioService from '../services/AudioService';

// 【RN 0.81 兼容】使用默认导入，与 TrackPlayer 保持一致
import TrackPlayer, { State } from 'react-native-track-player';

import { Scene } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

interface AudioContextType {
  activeSoundId: string | null;
  playbackState: State | string;
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
  toggleAmbience: (scene: Scene, targetState: boolean) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 获取 AudioService 实例
  const audioService = AudioService.getInstance();
  const navigation = useNavigation();
  const { t } = useTranslation();
  
  // 【新增】设置资源缺失回调，触发 UI 层下载引导
  useEffect(() => {
    // 【诊断】打印当前语言
    console.log('[AudioContext] 当前 i18n.language:', i18n.language);
    console.log('[AudioContext] i18n.isInitialized:', i18n.isInitialized);
    
    audioService.onResourceNotFound = (scene) => {
      // 【诊断】弹窗触发时的语言状态
      console.log('[AudioContext] 弹窗触发 - i18n.language:', i18n.language);
      console.log('[AudioContext] 弹窗触发 - scene.title:', scene.title);
      console.log('[AudioContext] 弹窗触发 - i18n.t(scene.title):', i18n.t(scene.title));
      console.log('[AudioContext] 弹窗触发 - i18n.t("download.title"):', i18n.t('download.title'));
      console.log('[AudioContext] 弹窗触发 - i18n.t("common.cancel"):', i18n.t('common.cancel'));
      console.log('[AudioContext] 弹窗触发 - i18n.t("actions.download"):', i18n.t('actions.download'));
      
      Alert.alert(
        i18n.t('download.title'),
        i18n.t('download.message', { sceneTitle: i18n.t(scene.title) }),
        [
          { 
            text: i18n.t('common.cancel'), 
            style: 'cancel' 
          },
          { 
            text: i18n.t('actions.download'),
            onPress: () => navigation.navigate('ResourceDownload' as never)
          }
        ]
      );
    };
    
    return () => {
      audioService.onResourceNotFound = undefined;
    };
  }, [navigation, t]);
  
  // 防御性检查：确保 AudioService 已准备好
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRY_COUNT = 3; // 最大重试次数
  
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<State | string>(State.None);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [currentBaseSceneId, setCurrentBaseSceneId] = useState<string | null>(null);
  const [activeSmallSceneIds, setActiveSmallSceneIds] = useState<string[]>([]);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [initialRemaining, setInitialRemaining] = useState<number | null>(null);
  const [ambientVolume, setAmbientVolume] = useState<number>(1.0);

  // 检查 AudioService 是否已准备好
  useEffect(() => {
    const checkServiceReady = async () => {
      try {
        if (audioService.isReady()) {
          console.log('[AudioContext] ✅ AudioService 已准备好，开始同步状态');
          setIsServiceReady(true);
          setRetryCount(0); // 重置重试计数
          
          // 同步初始状态
          setActiveSoundId(audioService.getCurrentBaseSceneId());
          setPlaybackState(audioService.getCurrentState());
          setCurrentScene(audioService.getCurrentScene());
          setCurrentBaseSceneId(audioService.getCurrentBaseSceneId());
          setActiveSmallSceneIds(audioService.getActiveSmallSceneIds());
          setInitialRemaining(audioService.getInitialSleepSeconds());
          setAmbientVolume(audioService.getAmbientVolume());
          
          const endTime = audioService.getSleepEndTime();
          if (endTime) {
            const remain = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
            setRemainingTime(remain);
          }
        } else {
          // 增加重试计数
          const newRetryCount = retryCount + 1;
          console.log(`[AudioContext] ⚠️ AudioService 未准备好，延迟重试 (${newRetryCount}/${MAX_RETRY_COUNT})`);
          
          if (newRetryCount >= MAX_RETRY_COUNT) {
            console.warn('[AudioContext] ⚠️ 达到最大重试次数，使用降级模式继续运行');
            // 即使未就绪也允许继续运行，使用降级模式
            setIsServiceReady(false);
            return;
          }
          
          setRetryCount(newRetryCount);
          setTimeout(checkServiceReady, 500);
        }
      } catch (error) {
        console.error('[AudioContext] ❌ checkServiceReady 失败:', error);
        console.error('[AudioContext] ❌ 错误堆栈:', error?.stack);
        
        // 出错时也允许继续运行
        const newRetryCount = retryCount + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          console.warn('[AudioContext] ⚠️ 错误次数过多，使用降级模式继续运行');
          setIsServiceReady(false);
          return;
        }
        
        setRetryCount(newRetryCount);
        setTimeout(checkServiceReady, 500);
      }
    };
    
    checkServiceReady();
  }, [retryCount]);

  const isPlaying = playbackState === 'playing';
  const isBuffering = playbackState === 'buffering' || playbackState === 'loading';
  const isTimerActive = remainingTime !== null && remainingTime > 0;

  // Sync state from AudioService (仅在服务准备好后)
  useEffect(() => {
    if (!isServiceReady) return;
    
    const unsubscribeState = audioService.addAudioStateListener((state) => {
      setActiveSoundId(state.id);
      setPlaybackState(state.state);
      setCurrentScene(audioService.getCurrentScene());
      setCurrentBaseSceneId(audioService.getCurrentBaseSceneId());
      setActiveSmallSceneIds(audioService.getActiveSmallSceneIds());
      
      // 【关键修复】监听状态变化，确保 loading 正确清除
      console.log('[AudioContext] 状态变更:', state.state);
      if (state.state === 'playing') {
        console.log('[AudioContext] ✅ 检测到 State.Playing，确保 loading 已清除');
        
        // 【用户要求】打印当前队列长度，确认交互音是否真的进去了
        TrackPlayer.getQueue().then(queue => {
          console.log('[AudioContext] 📊 当前队列长度:', queue.length, '队列 ID:', queue.map(t => t.id).join(', '));
          
          // 检查是否有 small_ 开头的音轨
          const hasSmallScenes = queue.some(t => t.id?.startsWith('small_'));
          if (hasSmallScenes) {
            console.log('[AudioContext] ✅ 检测到交互音在队列中');
          }
        }).catch(err => {
          console.warn('[AudioContext] ⚠️ 获取队列失败:', err);
        });
      } else if (state.state === 'buffering' || state.state === 'loading') {
        console.log('[AudioContext] ⏳ 检测到 State.Buffering/Loading');
      }
    });

    const unsubscribeSmallScenes = audioService.addSmallScenesListener((ids) => {
      setActiveSmallSceneIds(ids);
    });

    const unsubscribeVolume = audioService.addVolumeListener((vol) => {
      setAmbientVolume(vol);
    });

    const unsubscribeTimer = audioService.addSleepTimerListener((remaining) => {
      setRemainingTime(remaining);
      if (remaining !== null && initialRemaining === null) {
        setInitialRemaining(audioService.getInitialSleepSeconds());
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
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 updateAmbientVolume');
      return;
    }
    audioService.updateAmbientVolume(volume);
  }, [isServiceReady]);

  const setAmbient = useCallback(async (id: string | null) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 setAmbient');
      return;
    }
    if (id) {
      await audioService.playAmbient(id);
    } else {
      await audioService.stopAllAmbient();
    }
  }, [isServiceReady]);

  const getAmbientVolumeById = useCallback((id: string) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，返回默认音量');
      return 1.0;
    }
    return audioService.getAmbientVolumeById(id);
  }, [isServiceReady]);

  const toggleAmbience = useCallback(async (scene: Scene, targetState: boolean) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 toggleAmbience');
      return;
    }
    await audioService.toggleAmbience(scene, targetState);
  }, [isServiceReady]);

  const play = useCallback(async (scene?: Scene) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 play');
      return;
    }
    if (scene) {
      await audioService.switchSoundscape(scene);
    } else {
      await audioService.play();
    }
  }, [isServiceReady]);

  const pause = useCallback(async () => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 pause');
      return;
    }
    await audioService.pause();
  }, [isServiceReady]);

  const togglePlayback = useCallback(async (scene: Scene) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 togglePlayback');
      return;
    }
    await audioService.togglePlayback(scene);
  }, [isServiceReady]);

  const syncNativeStatus = useCallback(async () => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 syncNativeStatus');
      return;
    }
    await audioService.syncNativeStatus();
  }, [isServiceReady]);

  const setSleepTimer = useCallback(async (minutes: number) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 setSleepTimer');
      return;
    }
    await audioService.setSleepTimer(minutes);
  }, [isServiceReady]);

  const clearSleepTimer = useCallback(() => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 clearSleepTimer');
      return;
    }
    audioService.clearSleepTimer();
  }, [isServiceReady]);

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
