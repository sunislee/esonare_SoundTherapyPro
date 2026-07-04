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

// 服务导入：8轨音频播放 + 资源检查
import { play8TrackAudio, stop8TrackAudio } from '../services/8TrackAudioService';
import { checkNoiseResourcesReady, getNoiseResourceFiles } from '../services/NoiseResourceChecker';

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
  values: number[];
}

const SCENE_PRESETS: ScenePreset[] = [
  { id: 'commute', label: '通勤', icon: '🚗', color: '#4ECDC4', values: [-18, -12, -5, 0, +3, +2, -3, -9] },
  { id: 'office', label: '办公室', icon: '💼', color: '#45B7AA', values: [-8, -5, -3, 0, +2, +1, -6, -12] },
  { id: 'social', label: '社交', icon: '👥', color: '#4A90E4', values: [-5, -3, 0, +3, +6, +5, -3, -15] },
  { id: 'outdoor', label: '户外', icon: '🌲', color: '#7D5AC9', values: [-20, -15, -8, -3, 0, -2, -9, -18] },
];

interface BandConfig {
  frequency: string;
  color: string;
  initialDb: number;
}

const BANDS: BandConfig[] = [
  { frequency: '32Hz', color: '#4ECDC4', initialDb: -12 },
  { frequency: '64Hz', color: '#45B7AA', initialDb: -5 },
  { frequency: '125Hz', color: '#3DA190', initialDb: 0 },
  { frequency: '250Hz', color: '#358B76', initialDb: +3 },
  { frequency: '500Hz', color: '#4A90E4', initialDb: +5 },
  { frequency: '1kHz', color: '#6C6CD2', initialDb: 0 },
  { frequency: '2kHz', color: '#7D5AC9', initialDb: -9 },
  { frequency: '4kHz', color: '#9F36B7', initialDb: -18 },
];

const DB_MIN = -24;
const DB_MAX = 6;
const DB_RANGE = DB_MAX - DB_MIN;
const DEADZONE_PX = 2;
// SceneType → audioGroupId 映射表（降噪场景 ↔ 8轨音源）
// commute(通勤) → traffic_noise(交通噪音)
// office(办公室) → balanced_noise(均衡降噪)
// social(社交) → crowd_noise(人声降噪)
// outdoor(户外) → wind_noise(风声降噪)
const SCENE_TO_AUDIO_GROUP: Record<SceneType, string | null> = {
  commute: 'traffic_noise',
  office: 'balanced_noise',
  social: 'crowd_noise',
  outdoor: 'wind_noise',
  manual: null, // 自定义模式无对应音源
};

const AUDIO_BASE_PATH = ''; // RNFS 不再直接使用该常量，移除依赖

function snapToGrid(db: number): number { return Math.round(db); }
function clampDb(db: number): number { return Math.max(DB_MIN, Math.min(DB_MAX, db)); }
function dbToHeight(db: number): number { return ((db - DB_MIN) / DB_RANGE) * SLIDER_HEIGHT; }

interface VerticalSliderProps {
  bandIndex: number; color: string; currentDb: number; isLocked: boolean;
  onValueChange: (bandIndex: number, value: number) => void;
  onDragStart: (bandIndex: number) => void;
  onDragEnd: (bandIndex: number) => void;
}

const VerticalSlider: React.FC<VerticalSliderProps> = React.memo(({
  bandIndex, color, currentDb, isLocked, onValueChange, onDragStart, onDragEnd,
}) => {
  const lastDbRef = useRef(currentDb);
  const fillViewRef = useRef<View>(null);
  const dbTextRef = useRef<Text>(null);
  const pendingValueRef = useRef<number | null>(null);
  const isLockedRef = useRef(isLocked);
  const isDraggingRef = useRef(false);
  const startDbRef = useRef<number | null>(null);

  isLockedRef.current = isLocked;

  useEffect(() => {
    if (isDraggingRef.current) return;
    if (dbTextRef.current) dbTextRef.current.setNativeProps({ text: `${currentDb}dB` });
    if (fillViewRef.current) fillViewRef.current.setNativeProps({ style: [{ height: Math.max(0, dbToHeight(currentDb)) }] });
    lastDbRef.current = currentDb;
  }, [currentDb]);

  const applyNativeUI = useCallback((db: number) => {
    if (fillViewRef.current) fillViewRef.current.setNativeProps({ style: [{ height: Math.max(0, dbToHeight(db)) }] });
    if (dbTextRef.current) dbTextRef.current.setNativeProps({ text: `${db}dB` });
  }, []);

  const computeDbFromDelta = useCallback((dy: number): number | null => {
    if (isLockedRef.current || startDbRef.current === null) return null;
    const newDb = startDbRef.current - (dy / SLIDER_HEIGHT) * DB_RANGE;
    return clampDb(snapToGrid(newDb));
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dy) > DEADZONE_PX || Math.abs(gestureState.dx) > DEADZONE_PX,

      onPanResponderGrant: () => {
        if (isLockedRef.current) return;
        isDraggingRef.current = true;
        startDbRef.current = lastDbRef.current;
        onDragStart(bandIndex);
        applyNativeUI(lastDbRef.current);
      },

      onPanResponderMove: (_evt, gestureState) => {
        if (isLockedRef.current) return;
        if (Math.abs(gestureState.dy) < DEADZONE_PX && Math.abs(gestureState.dx) < DEADZONE_PX) return;
        const finalDb = computeDbFromDelta(gestureState.dy);
        if (finalDb !== null && finalDb !== lastDbRef.current) {
          lastDbRef.current = finalDb;
          pendingValueRef.current = finalDb;
          applyNativeUI(finalDb);
        }
      },

      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        startDbRef.current = null;
        if (pendingValueRef.current !== null && pendingValueRef.current !== currentDb) {
          onValueChange(bandIndex, pendingValueRef.current);
          pendingValueRef.current = null;
        }
        onDragEnd(bandIndex);
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        startDbRef.current = null;
        if (pendingValueRef.current !== null && pendingValueRef.current !== currentDb) {
          onValueChange(bandIndex, pendingValueRef.current);
          pendingValueRef.current = null;
        }
        onDragEnd(bandIndex);
      },
    }), [bandIndex, onValueChange, onDragStart, onDragEnd, computeDbFromDelta, applyNativeUI]
  );

  const initHeight = dbToHeight(currentDb);

  return (
    <View style={styles.sliderItem}>
      <Text style={[styles.frequencyLabel, { color }]}>{BANDS[bandIndex].frequency}</Text>
      <View style={[styles.sliderTrack, { backgroundColor: `${color}33` }]} pointerEvents="box-only" {...panResponder.panHandlers}>
        <View
          ref={fillViewRef}
          style={[styles.sliderFill, { height: Math.max(0, initHeight), backgroundColor: color }]}
        >
          <View style={[styles.thumb, { backgroundColor: color }]} />
        </View>
      </View>
      <Text ref={dbTextRef} style={[styles.dbLabel, { color }]}>{`${currentDb}dB`}</Text>
    </View>
  );
}, (prevProps, nextProps) =>
  prevProps.currentDb === nextProps.currentDb &&
  prevProps.color === nextProps.color
);

VerticalSlider.displayName = 'VerticalSlider';

const SpectrumBar: React.FC<{ height: number; color: string }> = React.memo(({ height, color }) => (
  <View style={styles.spectrumBarContainer}>
    <View style={[styles.spectrumBar, { height: `${height}%`, backgroundColor: color }]} />
  </View>
));
SpectrumBar.displayName = 'SpectrumBar';

const SceneTab: React.FC<{ scene: ScenePreset; isActive: boolean; onPress: () => void }> = React.memo(
  ({ scene, isActive, onPress }) => (
    <TouchableOpacity style={[styles.sceneTab, isActive && styles.sceneTabActive, isActive && { borderColor: scene.color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.sceneIcon}>{scene.icon}</Text>
      <Text style={[styles.sceneLabel, isActive ? { color: scene.color } : styles.sceneLabelInactive]}>{scene.label}</Text>
    </TouchableOpacity>
  )
);
SceneTab.displayName = 'SceneTab';

const NoiseLabModal: React.FC<NoiseLabModalProps> = (props) => {
  const { visible, onClose } = props;

  const [bandValues, setBandValues] = useState<number[]>(() => BANDS.map(b => b.initialDb));
  const [activeScene, setActiveScene] = useState<SceneType>('manual');
  const animatedValues = useRef<Animated.Value[]>(BANDS.map(b => new Animated.Value(b.initialDb))).current;
  const transitionAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // 【新增】8轨音频播放状态追踪
  const isPlayingRef = useRef(false);
  const currentAudioGroupRef = useRef<string | null>(null);

  const onValueChangeRef = useRef<(bandIndex: number, dbValue: number) => void>(undefined);

  useEffect(() => {
    if (visible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
      return () => backHandler.remove();
    }
  }, [visible, onClose]);

  // Modal 关闭时：停止8轨音频播放，避免弹窗关闭后音频还在后台播放
  const handleClose = useCallback(() => {
    console.log('[NoiseLab] ⛔ Modal 关闭，停止所有音频');
    stop8TrackAudio();
    isPlayingRef.current = false;
    currentAudioGroupRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible && transitionAnimRef.current) { transitionAnimRef.current.stop(); transitionAnimRef.current = null; }
  }, [visible]);

  const handleBandChange = useCallback((bandIndex: number, dbValue: number) => {
    if (transitionAnimRef.current) return;
    setBandValues(prev => { const newValues = [...prev]; newValues[bandIndex] = dbValue; return newValues; });
    if (activeScene !== 'manual') setActiveScene('manual');
  }, [activeScene]);

  useEffect(() => {
    onValueChangeRef.current = handleBandChange;
  }, [handleBandChange]);

  const stableOnValueChange = useCallback((bandIndex: number, value: number) => { onValueChangeRef.current?.(bandIndex, value); }, []);
  const stableOnDragStart = useCallback((_bandIndex: number) => {}, []);
  const stableOnDragEnd = useCallback((_bandIndex: number) => {}, []);

  /**
   * 场景切换：EQ 动画 + 8轨音频播放
   */
  const handleSceneSelect = useCallback(async (sceneId: SceneType) => {
    if (sceneId === activeScene) return;
    const preset = SCENE_PRESETS.find(p => p.id === sceneId);
    if (!preset) return;

    // ========== EQ 滑块动画（保留原有逻辑）==========
    setActiveScene(sceneId);
    if (transitionAnimRef.current) transitionAnimRef.current.stop();
    const animations = preset.values.map((targetValue, index) =>
      Animated.timing(animatedValues[index], { toValue: targetValue, duration: TRANSITION_DURATION, useNativeDriver: false })
    );
    transitionAnimRef.current = Animated.parallel(animations);
    (transitionAnimRef.current as Animated.CompositeAnimation).start(({ finished }: { finished: boolean }) => {
      if (finished) { setBandValues([...preset.values]); transitionAnimRef.current = null; }
    });

    // ========== 8轨音频播放（新增逻辑）==========
    const audioGroupId = SCENE_TO_AUDIO_GROUP[sceneId];

    // manual 模式无对应音源，不播放
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
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[NoiseLab] ❌ 播放失败:', errorMsg);
        isPlayingRef.current = false;
      }
    } else {
      // 资源未就绪，跳转下载页
      console.warn('[NoiseLab] 📥 资源未就绪，跳转下载页面');
      const targetFiles = getNoiseResourceFiles(audioGroupId);
      props.onNavigateToDownload?.(audioGroupId, targetFiles);
    }
  }, [activeScene, animatedValues]);

  const spectrumHeights = useMemo(() => BANDS.map((_, index) => ((bandValues[index] - DB_MIN) / DB_RANGE) * 100), [bandValues]);

  const handleCalibrate = useCallback(() => {
    if (transitionAnimRef.current) return;
    setActiveScene('manual');
    const optimizedValues = BANDS.map(() => Math.floor(Math.random() * 10) - 5);
    const animations = optimizedValues.map((targetValue, index) =>
      Animated.timing(animatedValues[index], { toValue: targetValue, duration: TRANSITION_DURATION, useNativeDriver: false })
    );
    transitionAnimRef.current = Animated.parallel(animations);
    (transitionAnimRef.current as Animated.CompositeAnimation).start(({ finished }: { finished: boolean }) => {
      if (finished) { setBandValues([...optimizedValues]); transitionAnimRef.current = null; }
    });
  }, [animatedValues]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalContainer}>
        <View style={[styles.absoluteFill, styles.overlayBackground]} />
        <View style={styles.panelContainer}>
          <View style={styles.glassPanel}>
            <Text style={styles.headerTitle}>← Noise Lab Pro</Text>
            <Text style={styles.mainTitle}>🎙️ AI 降噪实验室 (8-BAND Pro) 🧠</Text>

            <View style={styles.sceneTabsContainer}>
              {SCENE_PRESETS.map(scene => (
                <SceneTab key={scene.id} scene={scene} isActive={activeScene === scene.id} onPress={() => handleSceneSelect(scene.id)} />
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

            <Text style={styles.sectionTitle}>8-BAND FREQUENCY CONTROL</Text>

            <View style={styles.spectrumDisplay}>
              {BANDS.map((band, index) => (
                <SpectrumBar key={`spectrum-${index}`} height={spectrumHeights[index]} color={band.color} />
              ))}
            </View>

            <View style={styles.slidersGrid}>
              {BANDS.map((band, index) => (
                <VerticalSlider key={`slider-${index}`} bandIndex={index} color={band.color}
                  currentDb={bandValues[index]} isLocked={false}
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
  sceneIcon: { fontSize: 20, marginBottom: 4 },
  sceneLabel: { fontSize: 11, fontWeight: '700' },
  sceneLabelInactive: { color: 'rgba(255, 255, 255, 0.4)' },
  sectionTitle: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  spectrumDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, width: '100%', paddingHorizontal: 8, marginBottom: 20 },
  spectrumBarContainer: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 2 },
  spectrumBar: { width: '80%', minHeight: 10, borderRadius: 5, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  slidersGrid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4, marginBottom: 20 },
  sliderItem: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  frequencyLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
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
