import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AudioService from '../services/AudioService';

// 【RN 0.81 兼容】使用默认导入，与 TrackPlayer 保持一致
import TrackPlayer, { State } from 'react-native-track-player';

import { Scene } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { NativeEQ } from '../modules/NativeEQ';

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
  eqGains: number[]; // 8 段均衡器增益值
  play: (scene?: Scene) => Promise<void>;
  pause: () => Promise<void>;
  togglePlayback: (scene: Scene) => Promise<void>;
  syncNativeStatus: () => Promise<void>;
  setSleepTimer: (minutes: number) => Promise<void>;
  clearSleepTimer: () => void;
  updateAmbientVolume: (volume: number) => void;
  updateEqGain: (index: number, gain: number) => void; // 更新指定频段增益
  setAmbient: (id: string | null) => Promise<void>;
  getAmbientVolumeById: (id: string) => number;
  toggleAmbience: (scene: Scene, targetState: boolean) => Promise<void>;
  playScene: (scene: Scene) => Promise<void>;
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
  const [eqGains, setEqGains] = useState<number[]>([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]); // 8 段均衡器，初始值均为 1.0

  // 检查 AudioService 是否已准备好
  useEffect(() => {
    let retryCount = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const checkServiceReady = () => {
      try {
        if (audioService.isReady()) {
          console.log('[AudioContext] ✅ AudioService 已准备好，开始同步状态');
          setIsServiceReady(true);
          
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
          retryCount++;
          console.log(`[AudioContext] ⚠️ AudioService 未准备好，延迟重试 (${retryCount}/${MAX_RETRY_COUNT})`);
          
          if (retryCount >= MAX_RETRY_COUNT) {
            console.warn('[AudioContext] ⚠️ 达到最大重试次数，使用降级模式继续运行');
            setIsServiceReady(false);
            return;
          }
          
          // 延迟重试
          timeoutId = setTimeout(checkServiceReady, 500);
        }
      } catch (error) {
        console.error('[AudioContext] ❌ checkServiceReady 失败:', error);
        
        // 出错时也允许继续运行
        retryCount++;
        if (retryCount >= MAX_RETRY_COUNT) {
          console.warn('[AudioContext] ⚠️ 错误次数过多，使用降级模式继续运行');
          setIsServiceReady(false);
          return;
        }
        
        timeoutId = setTimeout(checkServiceReady, 500);
      }
    };
    
    checkServiceReady();
    
    // 清理函数
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // 空依赖，只执行一次

  const isPlaying = playbackState === State.Playing;
  const isBuffering = playbackState === State.Buffering;
  const isTimerActive = remainingTime !== null && remainingTime > 0;

  // Sync state from AudioService (仅在服务准备好后)
  useEffect(() => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ isServiceReady=false, 跳过注册监听器');
      return;
    }
    
    console.warn('[AudioContext] ✅ isServiceReady=true, 开始注册监听器');
    
    const unsubscribeState = audioService.addAudioStateListener((state) => {
      try {
        // 【强制日志】
        console.warn('--- [AudioContext] STATUS UPDATED: id=' + state?.id + ' state=' + state?.state + ' ---');
        console.warn('--- [AudioContext] isPlaying=' + (state?.state === State.Playing) + ' ---');
        console.warn('--- [AudioContext] 开始更新 state ---');
        setActiveSoundId(state.id);
        setPlaybackState(state.state);
        setCurrentScene(audioService.getCurrentScene());
        setCurrentBaseSceneId(audioService.getCurrentBaseSceneId());
        setActiveSmallSceneIds(audioService.getActiveSmallSceneIds());
        console.warn('--- [AudioContext] state 更新完成 ---');
      } catch (err) {
        console.error('[AudioContext] ❌ 状态回调异常:', err);
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
      
      // 【清理】清除所有 EQ 防抖计时器
      Object.values(eqDebounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      console.log('[AudioContext] 🧹 已清理 EQ 防抖计时器');
    };
  }, [isServiceReady]);

  const updateAmbientVolume = useCallback((volume: number) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 updateAmbientVolume');
      return;
    }
    audioService.updateAmbientVolume(volume);
  }, [isServiceReady]);

  // 【防抖优化】EQ 增益更新防抖计时器
  const eqDebounceTimers = useRef<{ [key: number]: NodeJS.Timeout }>({});

  const updateEqGain = useCallback((index: number, gain: number) => {
    if (index < 0 || index >= 8) {
      console.warn('[AudioContext] ⚠️ EQ 频段索引超出范围:', index);
      return;
    }
    
    // 【防抖】清除之前的计时器
    if (eqDebounceTimers.current[index]) {
      clearTimeout(eqDebounceTimers.current[index]);
    }
    
    setEqGains(prev => {
      const newGains = [...prev];
      newGains[index] = gain;
      return newGains;
    });
    
    // 【防抖优化】延迟 50ms 调用原生 API，避免频繁更新导致音频引擎过载
    eqDebounceTimers.current[index] = setTimeout(() => {
      // 【虚拟 8 段 EQ】使用多轨混音映射，发送全部 8 段增益值
      NativeEQ.set8BandEQ(eqGains);
      console.log(`[AudioContext] ✅ EQ 更新：频段${index}, gain=${gain}, dB=${(gain * 12).toFixed(1)}dB`);
    }, 50);
  }, [eqGains]);

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

  const playScene = useCallback(async (scene: Scene) => {
    if (!isServiceReady) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 playScene');
      return;
    }
    // 【关键】在切换场景前，强制重置交互音状态
    console.log('[AudioContext] 🛑 playScene 切换场景，强制重置 activeSmallSceneIds');
    setActiveSmallSceneIds([]);
    await audioService.playScene(scene);
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
        eqGains,
        play,
        pause,
        togglePlayback,
        playScene,
        syncNativeStatus,
        setSleepTimer,
        clearSleepTimer,
        updateAmbientVolume,
        updateEqGain,
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
