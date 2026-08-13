import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NativeModules, View, StyleSheet, Text, Dimensions, Modal, BackHandler, PanResponder, Animated, TouchableOpacity, ActivityIndicator } from 'react-native';

const DiagLog = NativeModules.DiagLog;

// 服务导入：8轨音频播放 + 资源检查 + 独立音量控制 + 降噪音频路由
import { play8TrackAudio, stop8TrackAudio, setTrackVolume } from '../services/8TrackAudioService';
import { playNoiseAudio, stopNoiseAudio } from '../services/NoiseAudioService';
import { checkNoiseResourcesReady, getNoiseResourceFiles } from '../services/NoiseResourceChecker';

// TrackPlayer：用于跨服务停止音频 + 播放状态监听
import TrackPlayer, { Event, State, useTrackPlayerEvents } from 'react-native-track-player';

// 【🔑 修复 #2】查询 AudioService 中的自动识别禁用标志
import { getSkipAutoEnvironmentDetection } from '../services/AudioService';

// EQ 动态生成器 + 环境音频分析
import { generateEQ } from '../services/EQGenerator';
import { AudioAnalyzer } from '../services/AudioAnalyzer';
import { AudioLevel } from '../modules/AudioLevel';

// AsyncStorage 跨页面通信：读取下载完成标记，自动播放刚下载的资源
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_WIDTH = SCREEN_WIDTH * 0.92;
const SLIDER_HEIGHT = 200;
const TRANSITION_DURATION = 300;

interface NoiseLabModalProps {
  visible: boolean;
  onClose: () => void;
  /** 资源未就绪时，跳转到下载页面的回调 */
  onNavigateToDownload?: (audioGroupId: string, targetFiles: string[]) => void;
}

type SceneType = 'commute' | 'office' | 'social' | 'outdoor' | 'mic' | 'manual';

interface ScenePreset {
  id: SceneType;
  label: string;
  icon: string;
  color: string;
  values: number[]; // 原始预设值（-24~+6 dB范围）
}

// ─── 场景标签配置（独立于 EQ 值，仅用于 UI 渲染） ──────────

interface SceneTabConfig extends Omit<ScenePreset, 'values'> {
  // values 字段由 generateEQ() 动态生成，不在配置中硬编码
}

const SCENE_TABS_CONFIG: SceneTabConfig[] = [
  { id: 'commute', label: '通勤', icon: '🚗', color: '#4ECDC4' },
  { id: 'office', label: '办公室', icon: '💼', color: '#45B7AA' },
  { id: 'social', label: '社交', icon: '👥', color: '#4A90E4' },
  { id: 'outdoor', label: '户外', icon: '🌲', color: '#7D5AC9' },
  { id: 'mic', label: '麦克风采集', icon: '🎙️', color: '#FF6B6B' },
];

// SceneType → EQ 场景类型映射（与 SCENE_TO_AUDIO_GROUP 对应）
const AUDIO_GROUP_TO_EQ_SCENE: Record<string, string> = {
  traffic_noise: 'commute',
  balanced_noise: 'office',
  crowd_noise: 'social',
  wind_noise: 'outdoor',
};

// ─── AudioAnalyzer → 降噪实验室场景映射（环境自动切换用） ──────────
//
// AudioAnalyzer.SceneType = 'traffic' | 'crowd' | 'wind' | 'unknown'
// NoiseLab SceneType     = 'commute' | 'office' | 'social' | 'outdoor' | 'mic' | 'manual'
//
// ⚠️ office 场景不在 AudioAnalyzer 识别范围内（它只能识别 traffic/crowd/wind），
//    因此 office 永远不会被自动触发切换，只能通过用户手动选择 Tab 进入。
//    这是预期行为：办公室环境噪声特征不够独特，无法与通勤/社交可靠区分，
//    由用户主动指定是最合理的交互方式。

const ANALYZER_TO_NOLAB_SCENE: Record<string, SceneType | null> = {
  traffic: 'commute',   // 车流/交通噪声 → 通勤模式（地铁、公交、马路）
  crowd: 'social',      // 人群噪声     → 社交模式（咖啡馆、餐厅、会议室）
  wind: 'outdoor',      // 风噪         → 户外模式（公园、街道、骑行）
  unknown: null,        // 未识别       → 不触发切换，保持当前场景
};

// ─── 滑块百分比映射工具 ──────────────────────────────
// 滑块范围：0（静音）~ 100（最大音量），线性对应
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_RANGE = SLIDER_MAX - SLIDER_MIN;

// dB 增益值 → 滑块百分比映射表（原始 dB 范围 -24~+6 映射到 0~100，兼容预设值和生成值）
const PRESET_DB_TO_PERCENT: Record<number, number> = {
  [-24]: 0,
  [-20]: 7,
  [-18]: 15,
  [-15]: 23,
  [-12]: 35,
  [-9]: 42,
  [-8]: 46,
  [-6]: 52,
  [-5]: 55,
  [-3]: 62,
  [0]: 70,
  [+1]: 74,
  [+2]: 78,
  [+3]: 82,
  [+5]: 90,
  [+6]: 100,
};

// 将预设值（原始 dB 范围 -24~+6）映射到滑块百分比 0~100
function mapPresetValueToPercent(value: number): number {
  const sortedKeys = Object.keys(PRESET_DB_TO_PERCENT).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < sortedKeys.length; i++) {
    if (value <= sortedKeys[i]) {
      return PRESET_DB_TO_PERCENT[sortedKeys[i]];
    }
  }
  return PRESET_DB_TO_PERCENT[sortedKeys[sortedKeys.length - 1]];
}

// 滑块百分比 → 线性音量 0~1（直接除以 100）
function percentToVolume(percent: number): number {
  return Math.max(0, Math.min(1, percent / 100));
}

interface BandConfig {
  frequency: string;
  color: string;
  defaultPercent: number; // 默认滑块百分比（0~100）
}

const BANDS: BandConfig[] = [
  { frequency: '32Hz', color: '#4ECDC4', defaultPercent: mapPresetValueToPercent(-12) },
  { frequency: '64Hz', color: '#45B7AA', defaultPercent: mapPresetValueToPercent(-5) },
  { frequency: '125Hz', color: '#3DA190', defaultPercent: mapPresetValueToPercent(0) },
  { frequency: '250Hz', color: '#358B76', defaultPercent: mapPresetValueToPercent(3) },
  { frequency: '500Hz', color: '#4A90E4', defaultPercent: mapPresetValueToPercent(5) },
  { frequency: '1kHz', color: '#6C6CD2', defaultPercent: mapPresetValueToPercent(0) },
  { frequency: '2kHz', color: '#7D5AC9', defaultPercent: mapPresetValueToPercent(-9) },
  { frequency: '4kHz', color: '#9F36B7', defaultPercent: mapPresetValueToPercent(-18) },
];

// SceneType → audioGroupId 映射表（降噪场景 ↔ 8轨音源）
const SCENE_TO_AUDIO_GROUP: Record<SceneType, string | null> = {
  commute: 'noise_traffic',
  office: 'balanced_noise',
  social: 'noise_crowd',
  outdoor: 'noise_wind',
  mic: null, // 麦克风采集模式无对应音源
  manual: null, // 自定义模式无对应音源
};

const DEADZONE_PX = 2;

// ─── VerticalSlider：百分比驱动的垂直滑块 ────────────

interface VerticalSliderProps {
  bandIndex: number; color: string; currentPercent: number; isLocked: boolean;
  onValueChange: (bandIndex: number, value: number) => void;
  onDragStart: (bandIndex: number) => void;
  onDragEnd: (bandIndex: number) => void;
}

const VerticalSlider: React.FC<VerticalSliderProps> = React.memo(({
  bandIndex, color, currentPercent, isLocked, onValueChange, onDragStart, onDragEnd,
}) => {
  const lastPercentRef = useRef(currentPercent);
  const fillViewRef = useRef<View>(null);
  const percentTextRef = useRef<Text>(null);
  const isLockedRef = useRef(isLocked);
  const isDraggingRef = useRef(false);
  const startPercentRef = useRef<number | null>(null);

  isLockedRef.current = isLocked;

  // 百分比 → UI 高度比例（0~100% → 0~SLIDER_HEIGHT）
  const percentToHeight = useCallback((p?: number) => {
    return ((Math.max(0, p ?? 0)) / SLIDER_MAX) * SLIDER_HEIGHT;
  }, []);

  useEffect(() => {
    if (isDraggingRef.current) return;
    if (percentTextRef.current) percentTextRef.current.setNativeProps({ text: `${Math.round(currentPercent)}%` });
    if (fillViewRef.current) fillViewRef.current.setNativeProps({ style: [{ height: Math.max(0, percentToHeight(currentPercent)) }] });
    lastPercentRef.current = currentPercent;
  }, [currentPercent, percentToHeight]);

  const applyNativeUI = useCallback((percent: number) => {
    if (fillViewRef.current) fillViewRef.current.setNativeProps({ style: [{ height: Math.max(0, percentToHeight(percent)) }] });
    if (percentTextRef.current) percentTextRef.current.setNativeProps({ text: `${Math.round(percent)}%` });
  }, [percentToHeight]);

  // 手势位移 → 百分比（向上拖增加，向下拖减少）
  const computePercentFromDelta = useCallback((dy: number): number | null => {
    if (isLockedRef.current || startPercentRef.current === null) return null;
    const newPercent = startPercentRef.current - (dy / SLIDER_HEIGHT) * SLIDER_RANGE;
    return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(newPercent)));
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dy) > DEADZONE_PX || Math.abs(gestureState.dx) > DEADZONE_PX,

      onPanResponderGrant: () => {
        if (isLockedRef.current) return;
        isDraggingRef.current = true;
        startPercentRef.current = lastPercentRef.current;
        onDragStart(bandIndex);
        applyNativeUI(lastPercentRef.current);
      },

      // 🔥 拖动过程中实时更新 UI + 触发音量变化（实时反馈）
      onPanResponderMove: (_evt, gestureState) => {
        if (isLockedRef.current) return;
        if (Math.abs(gestureState.dy) < DEADZONE_PX && Math.abs(gestureState.dx) < DEADZONE_PX) return;
        const finalPercent = computePercentFromDelta(gestureState.dy);
        if (finalPercent !== null && finalPercent !== lastPercentRef.current) {
          lastPercentRef.current = finalPercent;
          applyNativeUI(finalPercent);
          // 🔥 拖动过程中实时调用 onValueChange → setTrackVolume，让用户听到实时反馈
          onValueChange(bandIndex, finalPercent);
        }
      },

      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        startPercentRef.current = null;
        onDragEnd(bandIndex);
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        startPercentRef.current = null;
        onDragEnd(bandIndex);
      },
    }), [bandIndex, onValueChange, onDragStart, onDragEnd, computePercentFromDelta, applyNativeUI]
  );

  const initHeight = percentToHeight(currentPercent);

  return (
    <View style={styles.sliderItem}>
      <Text style={[styles.frequencyLabel, { color }]}>
        {BANDS[bandIndex].frequency.replace('Hz', '')}
      </Text>
      <View style={[styles.sliderTrack, { backgroundColor: `${color}33` }]} pointerEvents="box-only" {...panResponder.panHandlers}>
        <View
          ref={fillViewRef}
          style={[styles.sliderFill, { height: Math.max(0, initHeight), backgroundColor: color }]}
        >
          <View style={[styles.thumb, { backgroundColor: color }]} />
        </View>
      </View>
      <Text ref={percentTextRef} style={[styles.dbLabel, { color }]}>{`${Math.round(currentPercent)}%`}</Text>
    </View>
  );
}, (prevProps, nextProps) =>
  prevProps.currentPercent === nextProps.currentPercent &&
  prevProps.color === nextProps.color
);

VerticalSlider.displayName = 'VerticalSlider';

const SpectrumBar: React.FC<{ percent: number; color: string }> = React.memo(({ percent, color }) => (
  <View style={styles.spectrumBarContainer}>
    <View style={[styles.spectrumBar, { height: `${Math.max(0, Math.min(100, percent || 0))}%`, backgroundColor: color }]} />
  </View>
));
SpectrumBar.displayName = 'SpectrumBar';

const SceneTab: React.FC<{ scene: ScenePreset; isActive: boolean; onPress: () => void; isPlayingSource?: boolean; isLoading?: boolean }> = React.memo(
  ({ scene, isActive, onPress, isPlayingSource, isLoading }) => (
    <TouchableOpacity style={[styles.sceneTab, isActive && styles.sceneTabActive, isActive && { borderColor: scene.color }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.iconWrapper}>
        <Text style={styles.sceneIcon}>{scene.icon}</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={scene.color} />
        ) : isPlayingSource && (
          <View style={[styles.playingBadge, { backgroundColor: `${scene.color}66` }]}>
            <View style={[styles.playingDot, { backgroundColor: scene.color }]} />
          </View>
        )}
      </View>
      <Text style={[styles.sceneLabel, isActive ? { color: scene.color } : styles.sceneLabelInactive]}>{scene.label}</Text>
    </TouchableOpacity>
  )
);
SceneTab.displayName = 'SceneTab';

const NoiseLabModal: React.FC<NoiseLabModalProps> = (props) => {
  const { visible, onClose } = props;

  // bandValues 现在是滑块百分比值（0~100），不是 dB
  const [bandValues, setBandValues] = useState<number[]>(() => BANDS.map(b => b.defaultPercent));
  const [activeScene, setActiveScene] = useState<SceneType>('manual');
  const animatedValues = useRef<Animated.Value[]>(BANDS.map(b => new Animated.Value(b.defaultPercent))).current;
  const transitionAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // 【新增】8轨音频播放状态追踪
  const isPlayingRef = useRef(false);
  const currentAudioGroupRef = useRef<string | null>(null);

  // 【🔥 修复】用 state + ref 双保模式跟踪当前播放音源：
  // playingGroupIdState 用于触发 React 重新渲染（playingSourceScene 依赖它）
  // playingGroupIdRef 用于异步回调中读取最新值（避免闭包陷阱）
  const [playingGroupIdState, setPlayingGroupIdState] = useState<string | null>(null);
  const playingGroupIdRef = useRef<string | null>(null);

  // 【🔥 修复】playingSourceScene 基于 state 计算，确保音源切换时立刻触发重渲染
  const playingSourceScene = useMemo(() => {
    if (!isPlayingRef.current || !playingGroupIdState) return null;
    for (const [sceneId, groupId] of Object.entries(SCENE_TO_AUDIO_GROUP)) {
      if (groupId === playingGroupIdState) return sceneId as SceneType;
    }
    return null;
  }, [playingGroupIdState]);

  // 【🔥 Buffering 状态】仅非办公室场景（办公室走本地8轨，不经 TrackPlayer）
  const [isBuffering, setIsBuffering] = useState(false);

  // 【修复 #1】自动环境识别开关：默认关闭，用户主动开启后才允许启动麦克风 + 自动播放
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(false);

  // 【🔥 防循环误触发】标记当前是否用户主动切换场景，用于区分"播放中自然循环重启"和"真正的加载新音源"
  const isSwitchingSceneRef = useRef(false);

  useTrackPlayerEvents([Event.PlaybackState], (event) => {
    if (!visible || activeScene === 'office') return;
    if (event.state === State.Buffering || event.state === State.Loading) {
      // 仅在用户主动切换场景时，才显示 loading 指示（避免 RepeatMode 循环重启误判）
      if (isSwitchingSceneRef.current) setIsBuffering(true);
    } else if (event.state === State.Playing) {
      setIsBuffering(false);
      isSwitchingSceneRef.current = false;
    }
  });

  // 【🔥 麦克风采集实验】实时分贝数据 + 波形历史
  const [micDbLevel, setMicDbLevel] = useState<number>(-90);
  const [micHistory, setMicHistory] = useState<number[]>(() => new Array(64).fill(-90));

  // 【🔥 引导提示动画】hintAnim — 手指 emoji 上下浮动循环动画
  const hintAnim = useRef(new Animated.Value(0)).current;
  const hintAnimRef = useRef<any>(null);

  // 【🔥 降噪实验室 - 麦克风采集联动场景音】
  const wasPlayingBeforeMicRef = useRef(false);        // 进入 mic 前是否正在播放场景音
  const playingGroupIdBeforeMicRef = useRef<string | null>(null); // 进入 mic 前的当前播放音频组

  /**
   * 🔥 麦克风模式核心逻辑：环境噪声自动匹配并播放对应场景音
   */
  const handleMicAutoPlayScene = useCallback(async (detectedScene: string) => {
    // noiseType → audioGroupId（traffic/crowd/wind/unknown）
    const audioGroupId = AUDIO_GROUP_TO_EQ_SCENE[detectedScene];
    
    if (!audioGroupId) {
      console.log('[NoiseLab] 麦克风采集：未识别到有效环境噪声，不播放场景音');
      return;
    }

    // 当前已在播放对应音频组 → 不需要重复播放
    if (isPlayingRef.current && currentAudioGroupRef.current === audioGroupId) {
      console.log('[NoiseLab] 麦克风采集：已正在播放目标场景音，跳过', audioGroupId);
      return;
    }

    // 🔥 关键逻辑：如果之前手动切换到了其他场景（有音频在播），先停掉再切
    if (isPlayingRef.current) {
      const prevGroup = currentAudioGroupRef.current;
      console.log('[NoiseLab] 麦克风采集：检测到环境噪声', detectedScene, '→', audioGroupId, '，停止之前的场景音:', prevGroup);
      
      // 停止当前播放的音频
      if (prevGroup === 'balanced_noise') {
        await stop8TrackAudio();
      } else {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      }
      isPlayingRef.current = false;
    }

    console.log('[NoiseLab] 麦克风采集：自动播放场景音 →', audioGroupId);
    
    const isBalanced = audioGroupId === 'balanced_noise';
    try {
      if (isBalanced) {
        await play8TrackAudio(audioGroupId);
      } else {
        await playNoiseAudio(audioGroupId);
      }
      isPlayingRef.current = true;
      currentAudioGroupRef.current = audioGroupId;
      setPlayingGroupIdState(audioGroupId);
      playingGroupIdRef.current = audioGroupId;
    } catch (error) {
      console.error('[NoiseLab] 麦克风采集：自动播放场景音失败:', error);
      isPlayingRef.current = false;
    }
  }, []);

  /**
   * 🔥 进入 mic 模式时：保存当前播放状态，如有正在播放的场景音则恢复它（不切换 tab）
   */
  const handleEnterMicMode = useCallback(async () => {
    wasPlayingBeforeMicRef.current = isPlayingRef.current;
    playingGroupIdBeforeMicRef.current = currentAudioGroupRef.current;

    // 当前没有音频在播 → 等待环境自动识别后播放对应场景音（由 AudioAnalyzer 回调处理）
    if (!isPlayingRef.current) {
      console.log('[NoiseLab] 麦克风模式：当前未播放场景音，等待环境自动识别');
      return;
    }

    // 🔥 有音频在播 → 先停掉之前的场景音（用户手动切换过其他场景），然后恢复 mic 前的场景音
    const prevGroup = playingGroupIdBeforeMicRef.current;
    console.log('[NoiseLab] 麦克风模式：之前正在播放的场景音 →', prevGroup, '，暂停保留');

    if (prevGroup === 'balanced_noise') {
      await stop8TrackAudio();
    } else {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    }
    isPlayingRef.current = false;

    // 🔥 恢复之前的场景音播放（在 mic tab 上继续播放对应的环境音效）
    if (prevGroup) {
      console.log('[NoiseLab] 麦克风模式：恢复播放 →', prevGroup);
      const eqSceneType = AUDIO_GROUP_TO_EQ_SCENE[prevGroup] ?? 'unknown';
      try {
        if (prevGroup === 'balanced_noise') {
          await play8TrackAudio(prevGroup);
        } else {
          await playNoiseAudio(prevGroup);
        }
        isPlayingRef.current = true;
        currentAudioGroupRef.current = prevGroup;
        setPlayingGroupIdState(prevGroup);
        playingGroupIdRef.current = prevGroup;
      } catch (error) {
        console.error('[NoiseLab] 麦克风模式：恢复播放失败:', error);
        isPlayingRef.current = false;
      }
    }
  }, []);

  /**
   * 🔥 离开 mic 模式时：停止所有通过麦克风联动播放的场景音
   */
  const handleLeaveMicMode = useCallback(async () => {
    if (isPlayingRef.current && playingGroupIdBeforeMicRef.current === currentAudioGroupRef.current) {
      // 当前播放的是 mic 模式下自动播放的音频 → 完全停掉
      console.log('[NoiseLab] 离开麦克风模式：停止通过 mic 联动播放的场景音');
      if (currentAudioGroupRef.current === 'balanced_noise') {
        await stop8TrackAudio();
      } else {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      }
      isPlayingRef.current = false;
    } else {
      // 当前播放的不是 mic 联动音频 → 保留，不做任何操作
      console.log('[NoiseLab] 离开麦克风模式：之前播放的场景音不受影响');
    }
    
    wasPlayingBeforeMicRef.current = false;
    playingGroupIdBeforeMicRef.current = null;
    
    // 🔥 停止 AudioAnalyzer（释放麦克风 + 停止环境音识别）
    AudioAnalyzer.stop();
    lastManualTapRef.current = 0; // 🔥 重置手动切换静默期计时器
  }, []);

  // 启动/重启浮动动画（仅在提示文字显示时运行）
  useEffect(() => {
    if (playingSourceScene !== null) {
      // 没有播放 → 停止动画
      if (hintAnimRef.current) {
        hintAnim.stopAnimation();
        hintAnimRef.current = null;
      }
      hintAnim.setValue(0);
      return;
    }

    // 正在引导 → 启动循环浮动动画（上下 ±5px，单次耗时 750ms，总循环 1.5s）
    hintAnim.stopAnimation();
    const sequence = Animated.sequence([
      Animated.timing(hintAnim, {
        toValue: -5,  // 向上移动 5px
        duration: 750,
        useNativeDriver: true,
      }),
      Animated.timing(hintAnim, {
        toValue: 5,   // 向下移动 5px
        duration: 750,
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(sequence);
    loop.start();
    hintAnimRef.current = loop;

    return () => {
      loop.stop();
      hintAnimRef.current = null;
    };
  }, [playingSourceScene]);

  // 【🔥 麦克风采集实验】监听 AudioLevel 实时分贝并更新波形历史
  useEffect(() => {
    if (!visible || activeScene !== 'mic') return;

    const unsubscribe = AudioLevel.onAmplitudeChanged((_amplitude: number, dB: number) => {
      setMicDbLevel(dB);
      setMicHistory(prev => [...prev.slice(1), dB]); // 保持最近 64 个点
    });

    // 首次启动采集（带权限检查）
    AudioLevel.checkMicrophonePermission?.().then(granted => {
      if (granted) {
        AudioLevel.start((_amplitude: number, dB: number) => {
          setMicDbLevel(dB);
          setMicHistory(prev => [...prev.slice(1), dB]);
        }, 50); // 20Hz 采集率
      }
    });

    return () => {
      unsubscribe();
      AudioLevel.stop?.();
      if (activeScene === 'mic') handleLeaveMicMode();
    };
  }, [visible, activeScene]);

  // 【🔥 关键修复】Modal 打开时检查 AsyncStorage 跨页面通信标记
  useEffect(() => {
    if (!visible) return;

    let dismissed = false;

    const checkAndAutoPlay = async () => {
      try {
        const flag = await AsyncStorage.getItem('downloadJustCompleted');
        if (dismissed) return;

        if (flag === 'true') {
          await AsyncStorage.removeItem('downloadJustCompleted').catch(() => {});

          const currentSceneId = activeScene;
          const audioGroupId = SCENE_TO_AUDIO_GROUP[currentSceneId];

          if (audioGroupId) {
            console.log('[NoiseLab] 🔄 检测到下载完成标记，检查资源并自动播放:', audioGroupId);
            const ready = await checkNoiseResourcesReady(audioGroupId);
            if (ready) {
              console.log('[NoiseLab] ✅ 资源就绪，自动播放:', audioGroupId);
              try {
                const isBalancedAuto = audioGroupId === 'balanced_noise';
                if (isBalancedAuto) {
                  await play8TrackAudio(audioGroupId);
                } else {
                  await playNoiseAudio(audioGroupId);
                }
                isPlayingRef.current = true;
                currentAudioGroupRef.current = audioGroupId;
                setPlayingGroupIdState(audioGroupId);     // 🔥 触发渲染更新
                playingGroupIdRef.current = audioGroupId;   // 🔥 同步 ref
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[NoiseLab] ❌ 自动播放失败:', errorMsg);
                isPlayingRef.current = false;
              }
            } else {
              console.warn('[NoiseLab] ⚠️ 下载完成但资源未就绪，跳转下载页');
              const targetFiles = getNoiseResourceFiles(audioGroupId);
              props.onNavigateToDownload?.(audioGroupId, targetFiles);
            }
          }
        }
      } catch (error) {
        console.error('[NoiseLab] ❌ 检查 downloadJustCompleted 标记失败:', error);
      }
    };

    checkAndAutoPlay();

    return () => { dismissed = true; };
  }, [visible, activeScene, props.onNavigateToDownload]);

  // 🔥 bandValues ref：用于 setTrackVolume 实时读取当前百分比值
  const bandValuesRef = useRef(bandValues);
  bandValuesRef.current = bandValues;

  const onValueChangeRef = useRef<(bandIndex: number, percentValue: number) => void>(undefined);

  // Modal 关闭时：停止所有音频服务，避免弹窗关闭后音频还在后台播放
  const handleClose = useCallback(() => {
    console.log('[NoiseLab] ⛔ Modal 关闭，停止所有音频');
    if (currentAudioGroupRef.current === 'balanced_noise') {
      stop8TrackAudio();
    } else {
      stopNoiseAudio();
      TrackPlayer.stop();
      TrackPlayer.reset();
    }
    isPlayingRef.current = false;
    currentAudioGroupRef.current = null;
    setPlayingGroupIdState(null);      // 🔥 清除播放音源 state
    playingGroupIdRef.current = null;   // 🔥 同步 ref
    onClose();
  }, [onClose]);

  // 【🔥 修复】安卓物理返回键：调用 handleClose 而非直接 onClose
  useEffect(() => {
    if (visible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => { handleClose(); return true; });
      return () => backHandler.remove();
    }
  }, [visible, handleClose]);

  // ── 环境自动切换防抖 refs ──────────────────────────────
  const GRACE_PERIOD_MS = 10_000;                    // 用户手动操作后，自动切换静默等待期（10秒）
  const MIN_AUTO_SWITCH_INTERVAL_MS = 8_000;         // 两次自动切换之间最短间隔（8秒）
  const MANUAL_TAP_SILENCE_MS = 10_000;              // 用户手动点击后，自动识别静默期（10秒）
  const lastManualTapRef = useRef<number>(0);        // 上次用户手动点击场景的时间戳
  const lastAutoSwitchRef = useRef<number>(0);       // 上次环境自动切换的时间戳

  /**
   * 核心场景切换逻辑：EQ 动画 + 8轨音频播放
   */
  const applyScene = useCallback(async (sceneId: SceneType) => {
    if (sceneId === activeScene) return;
    setIsBuffering(false);

    // 先获取音频组映射（供 EQ 生成器和音频播放共用）
    const audioGroupId = SCENE_TO_AUDIO_GROUP[sceneId];

    // mic / manual 模式无对应音源，跳过 EQ 计算与滑块动画，保留当前 bandValues 不变
    if (audioGroupId === null) {
      setActiveScene(sceneId);
      return;
    }
    
    // ========== EQ 滑块动画（动态生成值 → 百分比映射）==========
    
    // 获取当前环境平均分贝值（麦克风未采集时 fallback 到 moderate 档）
    const ambientDB = AudioAnalyzer.getAverageDB();
    const eqSceneType: string = AUDIO_GROUP_TO_EQ_SCENE[audioGroupId] ?? sceneId;
    const targetGains = generateEQ(eqSceneType, ambientDB);

    setActiveScene(sceneId);
    if (transitionAnimRef.current) transitionAnimRef.current.stop();
    const targetPercents = targetGains.map(v => mapPresetValueToPercent(v));
    const animations = targetPercents.map((targetValue, index) =>
      Animated.timing(animatedValues[index], { toValue: targetValue, duration: TRANSITION_DURATION, useNativeDriver: false })
    );
    transitionAnimRef.current = Animated.parallel(animations);
    (transitionAnimRef.current as Animated.CompositeAnimation).start(({ finished }: { finished: boolean }) => {
      if (finished) {
        setBandValues(targetPercents);
        // 场景切换后，将所有预设滑块的音量应用到对应 track
        targetPercents.forEach((percent, index) => {
          setTrackVolume(index + 1, percentToVolume(percent));
        });
        transitionAnimRef.current = null;
      }
    });

    // ========== 音频播放路由（balanced_noise → 8轨，其他噪声 → NoiseAudioService）==========

    if (!audioGroupId) {
      console.log('[NoiseLab] 自定义模式，跳过音频播放');
      return;
    }

    const isBalanced = audioGroupId === 'balanced_noise';

    // 先停止当前正在播放的场景（防止多场景叠加）
    if (isPlayingRef.current) {
      console.log('[NoiseLab] 🛑 停止当前场景:', currentAudioGroupRef.current, 'activeScene=', activeScene);
      if (currentAudioGroupRef.current === 'balanced_noise') {
        await stop8TrackAudio();
      } else {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      }
      isPlayingRef.current = false;
    }

    try {
      if (isBalanced) {
        // balanced_noise：走 8轨混合播放（抢跑机制）—— 本地音频，不经过 TrackPlayer，无需设置 isSwitchingSceneRef
        console.log('[NoiseLab] ▶️ 尝试启动8轨混合播放:', audioGroupId);
        await play8TrackAudio(audioGroupId);
        isPlayingRef.current = true;
        currentAudioGroupRef.current = audioGroupId;
        setPlayingGroupIdState(audioGroupId);     // 🔥 触发渲染更新
        playingGroupIdRef.current = audioGroupId;   // 🔥 同步 ref
      } else {
        // 其他噪声：走 NoiseAudioService（远程 URL + 缓存）—— 经过 TrackPlayer，需要设置 isSwitchingSceneRef 以正确显示 buffering 状态
        console.log('[NoiseLab] ▶️ 播放降噪音频:', audioGroupId);
        const result = await playNoiseAudio(audioGroupId);
        // 仅当本次未命中本地缓存（需要联网下载/首次缓冲）时，才标记为切换中、触发 loading
        if (!result.isFromCache) {
          isSwitchingSceneRef.current = true;
        }
        isPlayingRef.current = true;
        currentAudioGroupRef.current = audioGroupId;
        setPlayingGroupIdState(audioGroupId);     // 🔥 触发渲染更新
        playingGroupIdRef.current = audioGroupId;   // 🔥 同步 ref
      }
    } catch (playError) {
      if (isBalanced) {
        const errorMsg = playError instanceof Error ? playError.message : String(playError);
        console.warn('[NoiseLab] ⚠️ 抢跑失败，轨道不足，降级到资源下载页:', errorMsg);
        isPlayingRef.current = false;
        const targetFiles = getNoiseResourceFiles(audioGroupId);
        props.onNavigateToDownload?.(audioGroupId, targetFiles);
      } else {
        console.error('[NoiseLab] ❌ 降噪音频播放失败:', playError);
        isPlayingRef.current = false;
      }
    }
  }, [activeScene, animatedValues, props.onNavigateToDownload]);

  // 🔥 音频资源兜底清理：当 visible === false 时确保所有音频停止
  // 场景：Modal 被系统手势/导航返回关闭、HomeScreen 被 pop/replace，
  //       handleClose() 可能未被调用，但 useEffect 仍会触发。
  useEffect(() => {
    if (!visible) {
      if (transitionAnimRef.current) { transitionAnimRef.current.stop(); transitionAnimRef.current = null; }
      try { stop8TrackAudio(); } catch (_e) { /* ignore */ }
      try { stopNoiseAudio(); } catch (_e) { /* ignore */ }
    }
  }, [visible]);

  // 🎤 Modal 生命周期：打开时启动麦克风采集 + 环境自动识别场景切换，关闭时停止（释放麦克风）
  useEffect(() => {
    if (!visible) {
      // 🔥 Modal 关闭 → 立即停止 AudioAnalyzer，防止持续运行
      AudioAnalyzer.stop();
      lastManualTapRef.current = 0;
      return;
    }

    if (activeScene === 'mic') {
      AudioAnalyzer.stop();
    }

    if (!autoDetectionEnabled) return;

    if (activeScene === 'mic') {
      return;
    }

    AudioAnalyzer.stop();

    AudioAnalyzer.start((scene: string, _confidence: number, _db: number) => {
      const targetScene = ANALYZER_TO_NOLAB_SCENE[scene];
      console.log('[DIAG-A] AudioAnalyzer callback fired, scene=', scene, 'targetScene=', targetScene);
      if (DiagLog) DiagLog.info('AudioAnalyzer', `callback: scene=${scene} target=${ANALYZER_TO_NOLAB_SCENE[scene]}`);

      if (!targetScene) return;

      if (Date.now() - lastAutoSwitchRef.current < MIN_AUTO_SWITCH_INTERVAL_MS) return;

      // 用户手动点击后，10秒内暂停自动识别（临时静默期）
      if (lastManualTapRef.current > 0 && Date.now() - lastManualTapRef.current < MANUAL_TAP_SILENCE_MS) return;

      if (getSkipAutoEnvironmentDetection()) return;

      if (targetScene !== activeScene) {
        console.log(`[NoiseLab] 🔄 环境自动切换: ${scene} → ${targetScene}`);
        lastAutoSwitchRef.current = Date.now();
        applyScene(targetScene);
      }
    });
  }, [visible, activeScene, autoDetectionEnabled]);

  // 🔥 handleEnterMicMode / handleLeaveMicMode：随 activeScene 进出 mic 模式
  useEffect(() => {
    if (activeScene === 'mic') {
      handleEnterMicMode();
    } else {
      handleLeaveMicMode();
    }
  }, [activeScene]);

  // 🔥 handleBandChange：滑块百分比 → 线性音量 → setTrackVolume（实时调用）
  const handleBandChange = useCallback((bandIndex: number, percentValue: number) => {
    if (transitionAnimRef.current) return;

    // 更新本地 state（用于 UI 显示）
    setBandValues(prev => {
      const newValues = [...prev];
      newValues[bandIndex] = percentValue;
      return newValues;
    });

    // 🔥 实时调用 setTrackVolume：百分比 → 线性音量 0~1，应用到对应 track（bandIndex+1）
    const volume = percentToVolume(percentValue);
    setTrackVolume(bandIndex + 1, volume);

    if (activeScene !== 'manual') setActiveScene('manual');
  }, [activeScene]);

  useEffect(() => {
    onValueChangeRef.current = handleBandChange;
  }, [handleBandChange]);

  // stableOnValueChange：拖动过程中实时触发音量更新
  const stableOnValueChange = useCallback((bandIndex: number, value: number) => {
    onValueChangeRef.current?.(bandIndex, value);
  }, []);
  const stableOnDragStart = useCallback((_bandIndex: number) => {}, []);
  const stableOnDragEnd = useCallback((_bandIndex: number) => {}, []);

  /**
   * 用户手动选择场景：更新防抖时间戳 + 调用 applyScene
   */
  const handleSceneSelect = useCallback(async (sceneId: SceneType) => {
    if (sceneId === activeScene) return;

    // 记录用户操作时间 → 自动切换进入 10 秒静默期
    lastManualTapRef.current = Date.now();

    await applyScene(sceneId);
  }, [activeScene]);

  // 滑块百分比 → spectrum bar 高度百分比（0~100%）
  const spectrumHeights = useMemo(() => bandValues.map(p => (p / SLIDER_MAX) * 100), [bandValues]);

  const handleCalibrate = useCallback(() => {
    if (transitionAnimRef.current) return;
    setActiveScene('manual');
    // CALIBRATE：随机生成 0~100% 的滑块值
    const randomPercents = BANDS.map(() => Math.floor(Math.random() * 101));
    const animations = randomPercents.map((targetValue, index) =>
      Animated.timing(animatedValues[index], { toValue: targetValue, duration: TRANSITION_DURATION, useNativeDriver: false })
    );
    transitionAnimRef.current = Animated.parallel(animations);
    (transitionAnimRef.current as Animated.CompositeAnimation).start(({ finished }: { finished: boolean }) => {
      if (finished) {
        setBandValues(randomPercents);
        // CALIBRATE 后也应用音量到对应 track
        randomPercents.forEach((percent, index) => {
          setTrackVolume(index + 1, percentToVolume(percent));
        });
        transitionAnimRef.current = null;
      }
    });
  }, [animatedValues]);

  // 【🔥 修复】onRequestClose 改为 handleClose，确保系统手势返回时也执行 stop8TrackAudio()
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.modalContainer}>
        <View style={[styles.absoluteFill, styles.overlayBackground]} />
        <View style={styles.panelContainer}>
          <View style={styles.glassPanel}>
            <Text style={styles.headerTitle}>← Noise Lab Pro</Text>
            <Text style={styles.mainTitle}>🎙️ AI 降噪实验室 (8-BAND Pro) 🧠</Text>

            <View style={styles.sceneTabsContainer}>
              {SCENE_TABS_CONFIG.map(tab => (
                <SceneTab key={tab.id} scene={tab as any} isActive={activeScene === tab.id} isPlayingSource={playingSourceScene === tab.id} isLoading={isBuffering && tab.id === activeScene} onPress={() => handleSceneSelect(tab.id)} />
              ))}

              {/* 调试信息：显示当前音频组 */}
              {activeScene !== 'manual' && currentAudioGroupRef.current && (
                <Text style={{ color: '#4ECDC4', fontSize: 10, marginTop: 4 }}>
                  🎵 {currentAudioGroupRef.current}
                </Text>
              )}
              {activeScene === 'manual' && (
                <View style={[styles.sceneTab, styles.sceneTabActive, { borderColor: '#FFD700' }]}>
                  <Text style={styles.sceneIcon}>✋</Text>
                  <Text style={[styles.sceneLabel, { color: '#FFD700' }]}>自定义</Text>
                </View>
              )}
            </View>

            {/* 【修复 #1】自动环境识别开关 */}
            <View style={styles.autoDetectSwitchContainer}>
              <Text style={styles.autoDetectLabel}>自动环境识别</Text>
              <TouchableOpacity
                onPress={() => setAutoDetectionEnabled(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={[styles.toggleTrack, { backgroundColor: autoDetectionEnabled ? '#4ECDC4' : 'rgba(255, 255, 255, 0.2)' }]}>
                  <View style={[styles.toggleThumb, { transform: [{ translateX: autoDetectionEnabled ? 18 : 0 }] }]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* 【🔥 引导提示】当没有场景在播放时，显示操作指引（手指 emoji 带浮动动画） */}
            {playingSourceScene === null && (
              <View style={styles.hintContainer}>
                {/* 手指 emoji（第一行居中） */}
                <Animated.Text 
                  style={[styles.hintEmoji, { transform: [{ translateY: hintAnim }], marginBottom: 4 }]}
                >
                  👆
                </Animated.Text>
                
                {/* 环境自动识别说明（第二行，常驻显示） */}
                <Text style={styles.autoIdentifyHint}>
                  🎧 正在自动识别环境声音，将自动匹配对应场景
                </Text>
                
                {/* 操作提示（第三行） */}
                <Text style={styles.hintText}>点击上方场景开始降噪</Text>
              </View>
            )}

            {/* 【🔥 麦克风采集实验 UI】实时分贝 + 波形显示 */}
            {activeScene === 'mic' && (
              <View style={styles.micExperimentContainer}>
                <Text style={styles.sectionTitle}>MICROPHONE EXPERIMENT</Text>
                
                {/* 当前分贝值大字体显示 */}
                <View style={styles.dbDisplay}>
                  <Text style={[styles.dbValue, { color: micDbLevel > -30 ? '#FF6B6B' : '#4ECDC4' }]}>
                    {micDbLevel} dB
                  </Text>
                  <Text style={styles.dbLabel}>当前音量</Text>
                </View>

                {/* 实时波形显示 */}
                <View style={styles.waveformContainer}>
                  <View style={styles.waveformGraph}>
                    {micHistory.map((db, index) => (
                      <View
                        key={index}
                        style={[
                          styles.waveformBar,
                          {
                            height: `${Math.max(0, Math.min(100, (((Number(db) || -90) + 90) / 60) * 100))}%`,
                            backgroundColor: db > -30 ? '#FF6B6B' : '#4ECDC4',
                            opacity: 0.3 + (index / micHistory.length) * 0.7,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* 参考刻度 */}
                <View style={styles.micReference}>
                  <Text style={styles.refLabel}>安静环境: -20 dB</Text>
                  <Text style={styles.refLabel}>正常对话: 60 dB</Text>
                  <Text style={styles.refLabel}>嘈杂街道: 80+ dB</Text>
                </View>

                {/* 状态指示 */}
                <TouchableOpacity 
                  style={[styles.startStopButton, micDbLevel > -90 ? styles.stopButton : styles.startButton]}
                  onPress={() => {
                    if (micDbLevel > -90) {
                      AudioLevel.stop?.();
                      setMicDbLevel(-90);
                      setMicHistory(new Array(64).fill(-90));
                    } else {
                      AudioLevel.checkMicrophonePermission?.().then(granted => {
                        if (granted) {
                          AudioLevel.start((_amplitude: number, dB: number) => {
                            setMicDbLevel(dB);
                            setMicHistory(prev => [...prev.slice(1), dB]);
                          }, 50);
                        }
                      });
                    }
                  }}
                >
                  <Text style={styles.startStopButtonText}>
                    {micDbLevel > -90 ? '停止采集' : '开始采集'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>8-BAND FREQUENCY CONTROL</Text>

            <View style={styles.spectrumDisplay}>
              {BANDS.map((band, index) => (
                <SpectrumBar key={`spectrum-${index}`} percent={spectrumHeights[index]} color={band.color} />
              ))}
            </View>

            <View style={styles.slidersGrid}>
              {BANDS.map((band, index) => (
                <VerticalSlider key={`slider-${index}`} bandIndex={index} color={band.color}
                  currentPercent={bandValues[index]} isLocked={false}
                  onValueChange={stableOnValueChange} onDragStart={stableOnDragStart} onDragEnd={stableOnDragEnd}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.calibrateButton} onPress={handleCalibrate}>
              <Text style={styles.calibrateButtonText}>CALIBRATE ANC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlayBackground: { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
  panelContainer: { width: MODAL_WIDTH, maxHeight: Dimensions.get('window').height * 0.92, borderRadius: 28, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(108, 93, 211, 0.6)', shadowColor: '#6C5DD3', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 25, elevation: 20 },
  glassPanel: { backgroundColor: 'rgba(13, 20, 36, 0.92)', borderRadius: 26, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 18 },
  mainTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 1, marginBottom: 20, textAlign: 'center' },
  sceneTabsContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16, paddingHorizontal: 4 },
  sceneTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginHorizontal: 3, borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.1)' },
  sceneTabActive: { backgroundColor: 'rgba(108, 93, 211, 0.2)', shadowColor: '#6C5DD3', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  iconWrapper: { position: 'relative', alignItems: 'center' },
  playingBadge: {
    position: 'absolute', top: -4, right: -8, width: 10, height: 10, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  playingDot: { width: 6, height: 6, borderRadius: 3 },
  sceneIcon: { fontSize: 20, marginBottom: 4 },
  sceneLabel: { fontSize: 11, fontWeight: '700' },
  sceneLabelInactive: { color: 'rgba(255, 255, 255, 0.4)' },
  sectionTitle: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  autoDetectSwitchContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '80%', paddingVertical: 8, marginBottom: 4 },
  autoDetectLabel: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, fontWeight: '500' },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  hintContainer: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 12, paddingHorizontal: 16 },
  hintEmoji: { fontSize: 18, marginRight: 6 },
  hintText: { 
    color: '#4ECDC4', 
    fontSize: 15, 
    fontWeight: '700', 
    textAlign: 'center', 
    marginTop: 8, 
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  autoIdentifyHint: { 
    color: 'rgba(255, 255, 255, 0.4)', 
    fontSize: 13, 
    fontWeight: '400', 
    textAlign: 'center', 
    marginBottom: 4,
  },
  spectrumDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, width: '100%', paddingHorizontal: 8, marginBottom: 20 },
  spectrumBarContainer: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 2 },
  spectrumBar: { width: '80%', minHeight: 10, borderRadius: 5, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  slidersGrid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4, marginBottom: 20 },
  sliderItem: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  frequencyLabel: { fontSize: 10, fontWeight: '700', marginBottom: 6 },
  sliderTrack: { width: 28, height: SLIDER_HEIGHT, borderRadius: 14, overflow: 'hidden', marginBottom: 6 },
  sliderFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 14, justifyContent: 'flex-start', paddingTop: 2 },
  thumb: { width: 24, height: 24, borderRadius: 12, alignSelf: 'center', shadowColor: '#000000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6, shadowRadius: 4, elevation: 5 },
  dbLabel: { fontSize: 12, fontWeight: '700', width: 40, textAlign: 'center' },
  micExperimentContainer: { alignItems: 'center', marginVertical: 16, width: '100%' },
  dbDisplay: { marginBottom: 20, alignItems: 'center' },
  dbValue: { fontSize: 48, fontWeight: '700', letterSpacing: 2 },
  waveformContainer: { width: '100%', paddingHorizontal: 16, marginBottom: 16 },
  waveformGraph: { flexDirection: 'row', alignItems: 'flex-end', height: 80, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 4 },
  waveformBar: { flex: 1, marginHorizontal: 1, borderRadius: 2, minHeight: 4 },
  micReference: { flexDirection: 'row', justifyContent: 'space-around', width: '90%', marginBottom: 20 },
  refLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  startStopButton: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 20, marginBottom: 16 },
  startButton: { backgroundColor: '#4ECDC4' },
  stopButton: { backgroundColor: '#FF6B6B' },
  startStopButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  calibrateButton: { paddingVertical: 14, paddingHorizontal: 32, backgroundColor: '#4ECDC4', borderRadius: 22, marginBottom: 10 },
  calibrateButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  closeButton: { paddingVertical: 10, paddingHorizontal: 22, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 18 },
  closeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
});

export default NoiseLabModal;