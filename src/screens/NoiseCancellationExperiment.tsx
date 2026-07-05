import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  Modal,
  BackHandler,
  PanResponder,
  Animated,
  TouchableOpacity,
} from 'react-native';

// 服务导入：8轨音频播放 + 资源检查 + 独立音量控制
import { play8TrackAudio, stop8TrackAudio, setTrackVolume } from '../services/8TrackAudioService';
import { checkNoiseResourcesReady, getNoiseResourceFiles } from '../services/NoiseResourceChecker';

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

type SceneType = 'commute' | 'office' | 'social' | 'outdoor' | 'manual';

interface ScenePreset {
  id: SceneType;
  label: string;
  icon: string;
  color: string;
  values: number[]; // 原始预设值（-24~+6 dB范围）
}

const SCENE_PRESETS: ScenePreset[] = [
  { id: 'commute', label: '通勤', icon: '🚗', color: '#4ECDC4', values: [-18, -12, -5, 0, +3, +2, -3, -9] },
  { id: 'office', label: '办公室', icon: '💼', color: '#45B7AA', values: [-8, -5, -3, 0, +2, +1, -6, -12] },
  { id: 'social', label: '社交', icon: '👥', color: '#4A90E4', values: [-5, -3, 0, +3, +6, +5, -3, -15] },
  { id: 'outdoor', label: '户外', icon: '🌲', color: '#7D5AC9', values: [-20, -15, -8, -3, 0, -2, -9, -18] },
];

// ─── 滑块百分比映射工具 ──────────────────────────────
// 滑块范围：0（静音）~ 100（最大音量），线性对应
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_RANGE = SLIDER_MAX - SLIDER_MIN;

// SCENE_PRESETS 预设值 → 滑块百分比映射表（原始 dB 范围 -24~+6 映射到 0~100）
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
  commute: 'traffic_noise',
  office: 'balanced_noise',
  social: 'crowd_noise',
  outdoor: 'wind_noise',
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
  const percentToHeight = useCallback((p: number) => {
    return (p / SLIDER_MAX) * SLIDER_HEIGHT;
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
    <View style={[styles.spectrumBar, { height: `${percent}%`, backgroundColor: color }]} />
  </View>
));
SpectrumBar.displayName = 'SpectrumBar';

const SceneTab: React.FC<{ scene: ScenePreset; isActive: boolean; onPress: () => void; isPlayingSource?: boolean }> = React.memo(
  ({ scene, isActive, onPress, isPlayingSource }) => (
    <TouchableOpacity style={[styles.sceneTab, isActive && styles.sceneTabActive, isActive && { borderColor: scene.color }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.iconWrapper}>
        <Text style={styles.sceneIcon}>{scene.icon}</Text>
        {isPlayingSource && (
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

  // 【🔥 引导提示动画】hintAnim — 手指 emoji 上下浮动循环动画
  const hintAnim = useRef(new Animated.Value(0)).current;
  const hintAnimRef = useRef<any>(null);

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
                await play8TrackAudio(audioGroupId);
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

  // Modal 关闭时：停止8轨音频播放，避免弹窗关闭后音频还在后台播放
  const handleClose = useCallback(() => {
    console.log('[NoiseLab] ⛔ Modal 关闭，停止所有音频');
    stop8TrackAudio();
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

  useEffect(() => {
    if (!visible && transitionAnimRef.current) { transitionAnimRef.current.stop(); transitionAnimRef.current = null; }
  }, [visible]);

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
   * 场景切换：EQ 动画 + 8轨音频播放
   */
  const handleSceneSelect = useCallback(async (sceneId: SceneType) => {
    if (sceneId === activeScene) return;
    const preset = SCENE_PRESETS.find(p => p.id === sceneId);
    if (!preset) return;

    // ========== EQ 滑块动画（预设值 → 百分比映射）==========
    setActiveScene(sceneId);
    if (transitionAnimRef.current) transitionAnimRef.current.stop();
    const targetPercents = preset.values.map(v => mapPresetValueToPercent(v));
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

    // ========== 8轨音频播放（新增逻辑）==========
    const audioGroupId = SCENE_TO_AUDIO_GROUP[sceneId];

    if (!audioGroupId) {
      console.log('[NoiseLab] 自定义模式，跳过音频播放');
      return;
    }

    // 先停止当前正在播放的场景（防止多场景叠加）
    if (isPlayingRef.current && currentAudioGroupRef.current !== audioGroupId) {
      console.log('[NoiseLab] 🛑 停止上一个场景:', currentAudioGroupRef.current);
      await stop8TrackAudio();
      isPlayingRef.current = false;
    }

    // 检查资源是否就绪
    const ready = await checkNoiseResourcesReady(audioGroupId);

    if (ready) {
      console.log('[NoiseLab] ▶️ 资源就绪，开始播放:', audioGroupId);
      try {
        await play8TrackAudio(audioGroupId);
        isPlayingRef.current = true;
        currentAudioGroupRef.current = audioGroupId;
        setPlayingGroupIdState(audioGroupId);     // 🔥 触发渲染更新
        playingGroupIdRef.current = audioGroupId;   // 🔥 同步 ref
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[NoiseLab] ❌ 播放失败:', errorMsg);
        isPlayingRef.current = false;
      }
    } else {
      console.warn('[NoiseLab] 📥 资源未就绪，跳转下载页面');
      const targetFiles = getNoiseResourceFiles(audioGroupId);
      props.onNavigateToDownload?.(audioGroupId, targetFiles);
    }
  }, [activeScene, animatedValues]);

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
              {SCENE_PRESETS.map(scene => (
                <SceneTab key={scene.id} scene={scene} isActive={activeScene === scene.id} isPlayingSource={playingSourceScene === scene.id} onPress={() => handleSceneSelect(scene.id)} />
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

            {/* 【🔥 引导提示】当没有场景在播放时，显示操作指引（手指 emoji 带浮动动画） */}
            {playingSourceScene === null && (
              <View style={styles.hintContainer}>
                <Animated.Text style={[styles.hintEmoji, { transform: [{ translateY: hintAnim }] }]}>👆</Animated.Text>
                <Text style={styles.hintText}>点击上方场景开始降噪</Text>
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
  hintContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 12 },
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
  calibrateButton: { paddingVertical: 14, paddingHorizontal: 32, backgroundColor: '#4ECDC4', borderRadius: 22, marginBottom: 10 },
  calibrateButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  closeButton: { paddingVertical: 10, paddingHorizontal: 22, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 18 },
  closeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
});

export default NoiseLabModal;