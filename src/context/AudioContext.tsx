import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AudioService, { 
  toggleAmbience as _toggleAmbience,
  pause as _pause,
  playScene as _playScene,
  togglePlayback as _togglePlayback,
  syncNativeStatus as _syncNativeStatus,
  setSleepTimer as _setSleepTimer,
  clearSleepTimer as _clearSleepTimer,
  getAmbientVolumeById as _getAmbientVolumeById,
  addSmallScenesListener as _addSmallScenesListener,
  addVolumeListener as _addVolumeListener,
  addSleepTimerListener as _addSleepTimerListener,
  setRecordShopLayerVolume as _setRecordShopLayerVolume,
  getRecordShopVolumes as _getRecordShopVolumes,
} from '../services/AudioService';

// 【RN 0.81 兼容】使用默认导入，与 TrackPlayer 保持一致
import TrackPlayer, { State } from 'react-native-track-player';

import { Scene } from '../constants/scenes';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import zh from '../i18n/locales/zh.json';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';
import { NativeEQ } from '../modules/NativeEQ';
import { RecordShopLayer, RecordShopVolumes } from '../services/RecordShopAudioManager';

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
  recordShopVolumes: RecordShopVolumes | null;
  isRecordShopActive: boolean;
  play: (scene?: Scene) => Promise<void>;
  pause: () => Promise<void>;
  togglePlayback: (scene: Scene) => Promise<void>;
  syncNativeStatus: () => Promise<void>;
  setSleepTimer: (minutes: number) => Promise<void>;
  clearSleepTimer: () => void;
  updateAmbientVolume: (volume: number) => void;
  updateEqGain: (index: number, gain: number) => void;
  updateRecordShopVolume: (layer: RecordShopLayer, volume: number) => void;
  setAmbient: (id: string | null) => Promise<void>;
  getAmbientVolumeById: (id: string) => number;
  getRecordShopVolumes: () => RecordShopVolumes | null;
  toggleAmbience: (scene: Scene, targetState: boolean) => Promise<void>;
  playScene: (scene: Scene) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.error('[AudioContext] 🔴 [COMPONENT RENDERED] AudioProvider组件被渲染了');
  
  // 【v1.4.2 Release 防御】获取 AudioService 实例，增加 try/catch 防止模块加载失败导致崩溃
  let audioService;
  try {
    console.error('[AudioContext] 🔍 初始化 AudioService...');
    audioService = typeof AudioService !== 'undefined' && typeof AudioService.getInstance === 'function' 
      ? AudioService.getInstance() 
      : null;
    if (audioService) {
      console.error('[AudioContext] 🔍 getInstance() 返回对象, _isReady=', (audioService as any)._isReady);
      console.error('[AudioContext] 🔍 audioService.toggleAmbience type =', typeof (audioService as any).toggleAmbience);
    } else {
      console.error('[AudioContext] 🔍 getInstance() 返回 null/undefined!');
    }
  } catch (e) {
    console.error('[AudioContext] ❌ AudioService getInstance 调用失败:', e);
    audioService = null;
  }

  // 【v1.4.2 Release 防御】useNavigation 可能在无导航上下文中返回 null，需安全获取
  // 【关键修复】使用 ref 存储 navigation，避免在 render 期间访问未完全初始化的对象
  const navigationRef = React.useRef<{ navigate: ((screen: string, params?: any) => void) | null }>({ navigate: null });
  
  try {
    const nav = useNavigation<NavigationProp<any>>();
    if (nav && typeof nav.navigate === 'function') {
      navigationRef.current = nav as unknown as { navigate: ((screen: string, params?: any) => void) | null };
    } else {
      console.warn('[AudioContext] ⚠️ useNavigation() 返回无效导航对象');
    }
  } catch (e) {
    console.error('[AudioContext] ❌ useNavigation 调用失败:', e);
  }
  
  const navigation: any = navigationRef.current;

  const { t } = useTranslation();
  
  // 【新增】设置资源缺失回调，触发 UI 层下载引导（v1.4.2: 全部加防御检查）
  useEffect(() => {
    if (!audioService) {
      console.warn('[AudioContext] ⚠️ audioService 不可用，跳过 onResourceNotFound 注册');
      return () => {};
    }
    
    // 【诊断】打印当前语言
    try {
      console.log('[AudioContext] 当前 i18n.language:', i18n?.language);
      console.log('[AudioContext] i18n.isInitialized:', i18n?.isInitialized);
    } catch (e) {
      // i18n 可能未完全初始化，静默处理
    }

    audioService.onResourceNotFound = (scene: any) => {
      try {
        console.log('[AudioContext] 弹窗触发 - scene.title:', scene?.title);
        
        // 【v1.4.2 Release 防御】安全获取翻译文本，使用 i18next 默认值回退
        const safeT = (key: string, params?: any): string => {
          try {
            if (typeof i18n === 'object' && i18n !== null && typeof i18n.t === 'function') {
              return i18n.t(key, params);
            }
          } catch (e) {
            console.warn('[AudioContext] ⚠️ i18n.t 调用失败:', e);
          }
          // 回退：尝试从导入的 locale JSON 直接取值
          if (key.startsWith('download.') || key.startsWith('common.') || key.startsWith('actions.')) {
            return key;
          }
          // 对于 scenes.xxx.title 格式，尝试解析
          try {
            const keys = key.split('.');
            const currentLang = i18n?.language || 'zh';
            let source: any = currentLang === 'en' ? en : currentLang === 'ja' ? ja : zh;
            for (const k of keys) {
              if (source && typeof source === 'object' && k in source) {
                source = source[k];
              } else {
                return key;
              }
            }
            return typeof source === 'string' ? source : key;
          } catch (e2) {
            return key;
          }
        };

        const dialogTitle = safeT('download.title');
        const sceneTitle = scene?.title || '';
        const dialogMessage = safeT('download.message', { sceneTitle });
        const cancelText = safeT('common.cancel');
        const downloadText = safeT('actions.download');

        if (typeof Alert !== 'undefined' && typeof Alert.alert === 'function') {
          // 【关键修复】Alert.alert 的回调函数中所有依赖都必须是闭包安全的
          Alert.alert(
            dialogTitle,
            dialogMessage,
            [
              { 
                text: cancelText, 
                style: 'cancel',
                onPress: () => { /* 取消操作 */ }
              },
              { 
                text: downloadText,
                onPress: () => {
                  // 【v1.4.2 Release 防御】navigation 使用 ref 引用，确保 navigate 方法存在
                  try {
                    const navObj = navigationRef.current;
                    if (navObj && typeof navObj.navigate === 'function') {
                      navObj.navigate('ResourceDownload');
                    } else {
                      console.warn('[AudioContext] ⚠️ navigation.navigate 不可用，无法跳转下载页');
                    }
                  } catch (e) {
                    console.error('[AudioContext] ❌ Alert onPress 回调异常:', e);
                  }
                }
              }
            ]
          );
        } else {
          console.error('[AudioContext] ❌ Alert.alert 不可用！');
        }
      } catch (err) {
        // 【关键修复】弹窗触发时的任何异常都不应导致崩溃
        console.error('[AudioContext] ❌ onResourceNotFound 回调执行失败:', err);
      }
    };
    
    return () => {
      try {
        if (audioService && typeof audioService === 'object' && 'onResourceNotFound' in audioService) {
          (audioService as any).onResourceNotFound = undefined;
        }
      } catch (e) {
        console.warn('[AudioContext] ⚠️ 清理 onResourceNotFound 失败:', e);
      }
    };
  }, []); // 【关键修复】移除 navigation/t 依赖，避免重渲染时重新注册 onResourceNotFound（可能导致重复注册或引用旧对象）
  
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
  const [eqGains, setEqGains] = useState<number[]>([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]); // 8 段均衡器，初始值均为 0.0（平响；原生契约 gain∈[-1,+1]，1.0 实为 +12dB）
  const [recordShopVolumes, setRecordShopVolumes] = useState<RecordShopVolumes | null>(null);
  const [isRecordShopActive, setIsRecordShopActive] = useState<boolean>(false);
  const eqGainsRef = useRef<number[]>([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]); // 【关键修复】用 ref 存储最新值，避免闭包问题；初始 0.0=平响，与 state 初始值同源

  // 检查 AudioService 是否已准备好（v1.4.2: 全路径防御性检查）
  useEffect(() => {
    let retryCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const checkServiceReady = () => {
      try {
        // 【v1.4.2 Release 防御】所有 audioService 方法调用前检查
        if (!audioService) {
          console.warn('[AudioContext] ⚠️ audioService 为 null，直接返回');
          return;
        }
        
        const isReady = typeof audioService.isReady === 'function' ? audioService.isReady() : false;
        if (isReady) {
          console.log('[AudioContext] ✅ AudioService 已准备好，开始同步状态');
          setIsServiceReady(true);
          
          // 同步初始状态（v1.4.2: 每个方法调用独立 try/catch）
          setActiveSoundId(typeof audioService.getCurrentBaseSceneId === 'function' ? audioService.getCurrentBaseSceneId() : null);
          setPlaybackState(typeof audioService.getCurrentState === 'function' ? audioService.getCurrentState() : '');
          setCurrentScene(typeof audioService.getCurrentScene === 'function' ? audioService.getCurrentScene() : null);
          setCurrentBaseSceneId(typeof audioService.getCurrentBaseSceneId === 'function' ? audioService.getCurrentBaseSceneId() : null);
          setActiveSmallSceneIds(typeof audioService.getActiveSmallSceneIds === 'function' ? audioService.getActiveSmallSceneIds() : []);
          setInitialRemaining(typeof audioService.getInitialSleepSeconds === 'function' ? audioService.getInitialSleepSeconds() : null);
          setAmbientVolume(typeof audioService.getAmbientVolume === 'function' ? audioService.getAmbientVolume() : 1.0);

          // 同步老唱片店场景音量状态
          try {
            const rsVolumes = typeof audioService.getRecordShopVolumes === 'function'
              ? audioService.getRecordShopVolumes()
              : null;
            setRecordShopVolumes(rsVolumes);
            setIsRecordShopActive(rsVolumes !== null);
          } catch (e) {
            console.warn('[AudioContext] ⚠️ 同步 record shop 音量失败:', e);
          }
          
          const endTime = typeof audioService.getSleepEndTime === 'function' ? audioService.getSleepEndTime() : undefined;
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
      // 【关键修复】early return 时必须返回一个 no-op cleanup，否则 React 在卸载时会调用 undefined() → TypeError: undefined is not a function
      return () => {};
    }
    
    console.warn('[AudioContext] ✅ isServiceReady=true, 开始注册监听器');
    const svc = audioService as any; // 【关键修复】使用 any cast 解决 TS 类型检测不到的 runtime-added methods
    
    const unsubscribeState = typeof (svc as any)?.addAudioStateListener === 'function' ? (svc as any).addAudioStateListener((state: any) => {
      try {
        console.warn('--- [AudioContext] STATUS UPDATED: id=' + state?.id + ' state=' + state?.state + ' ---');
        console.warn('--- [AudioContext] isPlaying=' + (state?.state === State.Playing) + ' ---');
        console.warn('--- [AudioContext] 开始更新 state ---');
        setActiveSoundId(state.id);
        setPlaybackState(state.state);
        setCurrentScene(svc.getCurrentScene());
        setCurrentBaseSceneId(svc.getCurrentBaseSceneId());
        setActiveSmallSceneIds(svc.getActiveSmallSceneIds());

        // 【老唱片店】同步录音机场景音量状态
        try {
          const baseSceneId = svc.getCurrentBaseSceneId?.() ?? null;
          const rsActive = baseSceneId === 'life_record_shop';
          setIsRecordShopActive(rsActive);
          if (rsActive && typeof svc.getRecordShopVolumes === 'function') {
            setRecordShopVolumes(svc.getRecordShopVolumes());
          } else {
            setRecordShopVolumes(null);
          }
        } catch (e) {
          console.warn('[AudioContext] ⚠️ 同步 record shop 状态失败:', e);
        }
        console.warn('--- [AudioContext] state 更新完成 ---');
      } catch (err) {
        console.error('[AudioContext] ❌ 状态回调异常:', err);
      }
    }) : () => {};

    // 【R8 修复】使用具名导出函数，避免实例方法被混淆
    const unsubscribeSmallScenes = typeof _addSmallScenesListener === 'function' ? _addSmallScenesListener((ids: string[]) => {
      setActiveSmallSceneIds(ids);
    }) : () => {};

    const unsubscribeVolume = typeof _addVolumeListener === 'function' ? _addVolumeListener((vol: number) => {
      setAmbientVolume(vol);
    }) : () => {};

    const unsubscribeTimer = typeof _addSleepTimerListener === 'function' ? _addSleepTimerListener((remaining: number | null) => {
      setRemainingTime(remaining);
      if (remaining !== null && initialRemaining === null) {
        setInitialRemaining((svc as any)?.getInitialSleepSeconds() ?? 0);
      } else if (remaining === null) {
        setInitialRemaining(null);
      }
    }) : () => {};

    // 【v1.4.2 Release 防御】清理函数：确保所有取消订阅函数都存在且为 function
    const safeUnsubscribe = (fn: any) => {
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { console.warn('[AudioContext] ⚠️ 取消订阅失败:', e); }
      }
    };
    
    return () => {
      safeUnsubscribe(unsubscribeState);
      safeUnsubscribe(unsubscribeSmallScenes);
      safeUnsubscribe(unsubscribeVolume);
      safeUnsubscribe(unsubscribeTimer);
      
      // 【清理】清除所有 EQ 防抖计时器
      for (const timer of Object.values(eqDebounceTimers.current)) {
        if (timer) clearTimeout(timer as any);
      }
      console.log('[AudioContext] 🧹 已清理 EQ 防抖计时器');
    };
  }, [isServiceReady]);

  const updateAmbientVolume = useCallback((volume: number) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 updateAmbientVolume');
      return;
    }
    try { audioService.updateAmbientVolume(volume); } 
    catch (e) { console.error('[AudioContext] ❌ updateAmbientVolume 失败:', e); }
  }, [isServiceReady, audioService]);

  const updateRecordShopVolume = useCallback(async (layer: RecordShopLayer, volume: number) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 updateRecordShopVolume');
      return;
    }
    try {
      await _setRecordShopLayerVolume(layer, volume);
      setRecordShopVolumes(prev => {
        if (!prev) return null;
        return { ...prev, [layer]: volume };
      });
    } catch (e) {
      console.error('[AudioContext] ❌ updateRecordShopVolume 失败:', e);
    }
  }, [isServiceReady, audioService]);

  const getRecordShopVolumes = useCallback((): RecordShopVolumes | null => {
    if (!isServiceReady || !audioService) return recordShopVolumes;
    try {
      return _getRecordShopVolumes();
    } catch (e) {
      console.error('[AudioContext] ❌ getRecordShopVolumes 失败:', e);
      return recordShopVolumes;
    }
  }, [isServiceReady, audioService, recordShopVolumes]);

  // 【防抖优化】EQ 增益更新防抖计时器
  const eqDebounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // 【v1.4.2 Release 防御】NativeEQ.set8BandEQ 可能被混淆影响，调用前检查
  const set8BandEQ = typeof NativeEQ !== 'undefined' && typeof NativeEQ.set8BandEQ === 'function' 
    ? (gains: number[]) => NativeEQ.set8BandEQ(gains) 
    : null;

  const updateEqGain = useCallback((index: number, gain: number) => {
    console.log(`[AudioContext] 🎛️ updateEqGain 被调用: index=${index}, gain=${gain}`);
    if (!Number.isInteger(index) || !Number.isFinite(gain)) {
      console.warn('[AudioContext] ⚠️ EQ 参数无效:', { index, gain });
      return;
    }
    
    // 【关键修复】同步更新 ref
    eqGainsRef.current[index] = gain;
    
    // 【防抖】清除之前的计时器
    if (eqDebounceTimers.current[index]) {
      clearTimeout(eqDebounceTimers.current[index]);
    }
    
    setEqGains(prev => {
      const newGains = [...prev];
      newGains[index] = gain;
      console.log(`[AudioContext] 📊 更新 eqGains 状态:`, newGains);
      return newGains;
    });
    
    // 【防抖优化】延迟 50ms 调用原生 API，避免频繁更新导致音频引擎过载
    eqDebounceTimers.current[index] = setTimeout(() => {
      // 【关键修复】使用 ref 中的最新值，而不是闭包捕获的旧 state
      const currentGains = [...eqGainsRef.current];
      console.log(`[AudioContext] ⏰ 防抖计时器触发，发送 EQ 到原生层:`, currentGains);
      // 【v1.4.2 Release 防御】使用安全包装函数，若 set8BandEQ 为 null 则跳过
      if (set8BandEQ) {
        try { set8BandEQ(currentGains); } catch (e) { console.error('[AudioContext] ❌ set8BandEQ 调用失败:', e); }
      } else {
        console.warn('[AudioContext] ⚠️ NativeEQ.set8BandEQ 不可用，跳过 EQ 更新');
      }
      console.log(`[AudioContext] ✅ EQ 更新：频段${index}, gain=${gain}, dB=${(gain * 12).toFixed(1)}dB`);
    }, 50);
  }, [audioService]); // 【关键修复】添加 audioService 依赖，确保引用更新时回调也同步

  // 【v1.4.2 Release 防御】安全调用包装器：所有方法先检查函数存在性再调用
  // 【Hermes Release + R8 修复】safeCall 必须用 bind 绑定 this，否则类方法内部 this 丢失
  // 【Hermes Release + R8 终极修复】所有方法调用改用导出函数（不会被混淆）
  const safeCall = (exportFn: any, ...args: any[]) => {
    if (typeof exportFn === 'function') {
      try { return exportFn(...args); } 
      catch (e) { console.warn('[AudioContext] ⚠️ safeCall 失败:', e); return undefined; }
    }
  };

  const setAmbient = useCallback(async (id: string | null) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 setAmbient');
      return;
    }
    try {
      if (id && typeof audioService.playAmbient === 'function') {
        await audioService.playAmbient(id);
      } else if (!id && typeof audioService.stopAllAmbient === 'function') {
        await audioService.stopAllAmbient();
      }
    } catch (e) { console.error('[AudioContext] ❌ setAmbient 失败:', e); }
  }, [isServiceReady, audioService]);

  const getAmbientVolumeById = useCallback((id: string) => {
    if (!isServiceReady || !audioService) return 1.0;
    return safeCall(_getAmbientVolumeById, id) ?? 1.0;
  }, [isServiceReady, audioService]);

  const toggleAmbience = useCallback(async (scene: Scene, targetState: boolean) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 toggleAmbience');
      return;
    }
    try { await safeCall(_toggleAmbience, scene, targetState); } 
    catch (e) { console.error('[AudioContext] ❌ toggleAmbience 失败:', e); }
  }, [isServiceReady, audioService]);

  const play = useCallback(async (scene?: Scene) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 play');
      return;
    }
    try {
      if (scene && typeof audioService.switchSoundscape === 'function') {
        await audioService.switchSoundscape(scene);
      } else if (typeof audioService.play === 'function') {
        await audioService.play();
      }
    } catch (e) { console.error('[AudioContext] ❌ play 失败:', e); }
  }, [isServiceReady, audioService]);

  const pause = useCallback(async () => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 pause');
      return;
    }
    try { await safeCall(_pause); } 
    catch (e) { console.error('[AudioContext] ❌ pause 失败:', e); }
  }, [isServiceReady, audioService]);

  const togglePlayback = useCallback(async (scene: Scene) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 togglePlayback');
      return;
    }
    try { await safeCall(_togglePlayback, scene); } 
    catch (e) { console.error('[AudioContext] ❌ togglePlayback 失败:', e); }
  }, [isServiceReady, audioService]);

  const playScene = useCallback(async (scene: Scene) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 playScene');
      return;
    }
    // 【关键】在切换场景前，强制重置交互音状态
    setActiveSmallSceneIds([]);
    try { await safeCall(_playScene, scene); } 
    catch (e) { console.error('[AudioContext] ❌ playScene 失败:', e); }
  }, [isServiceReady, audioService]);

  const syncNativeStatus = useCallback(async () => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 syncNativeStatus');
      return;
    }
    try { await safeCall(_syncNativeStatus); } 
    catch (e) { console.error('[AudioContext] ❌ syncNativeStatus 失败:', e); }
  }, [isServiceReady, audioService]);

  const setSleepTimer = useCallback(async (minutes: number) => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 setSleepTimer');
      return;
    }
    try { await safeCall(_setSleepTimer, minutes); } 
    catch (e) { console.error('[AudioContext] ❌ setSleepTimer 失败:', e); }
  }, [isServiceReady, audioService]);

  const clearSleepTimer = useCallback(() => {
    if (!isServiceReady || !audioService) {
      console.warn('[AudioContext] ⚠️ AudioService 未准备好，跳过 clearSleepTimer');
      return;
    }
    try { safeCall(_clearSleepTimer); } 
    catch (e) { console.error('[AudioContext] ❌ clearSleepTimer 失败:', e); }
  }, [isServiceReady, audioService]);

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
        recordShopVolumes,
        isRecordShopActive,
        play,
        pause,
        togglePlayback,
        playScene,
        syncNativeStatus,
        setSleepTimer,
        clearSleepTimer,
        updateAmbientVolume,
        updateEqGain,
        updateRecordShopVolume,
        getRecordShopVolumes,
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
