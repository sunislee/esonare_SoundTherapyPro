import React, { useCallback, useRef, useEffect, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  ActivityIndicator,
  Button,
} from 'react-native';
import * as _8TrackAudioService from '../services/8TrackAudioService';

const { width } = Dimensions.get('window');
const CONTAINER_PADDING = 32; // 左右各 16px
const SLIDER_WIDTH = (width - CONTAINER_PADDING) / 8; 
const TRACK_HEIGHT = 180;
const THUMB_SIZE = 26;
const MAX_POS = TRACK_HEIGHT - THUMB_SIZE;

// 8 轨频率映射（对应 8 个音轨）
const TRACK_FREQUENCIES = [
  { index: 1, label: '60Hz', description: '超低频', trackNum: 1 },
  { index: 2, label: '150Hz', description: '低频', trackNum: 2 },
  { index: 3, label: '400Hz', description: '中低频', trackNum: 3 },
  { index: 4, label: '1kHz', description: '中频', trackNum: 4 },
  { index: 5, label: '2.5kHz', description: '中高频', trackNum: 5 },
  { index: 6, label: '6kHz', description: '临场感', trackNum: 6 },
  { index: 7, label: '10kHz', description: '辉煌感', trackNum: 7 },
  { index: 8, label: '16kHz', description: '空气感', trackNum: 8 },
];

// 四个降噪场景的渐变色配置（暗色版本，不抢 EQ Slider 风头）
const SCENE_COLORS = {
  balanced_noise: {  // 深空专注
    start: '#0a0a1a',  // 深蓝黑
    end: '#1a1a2e',    // 深蓝
  },
  wind_noise: {  // 微风轻拂
    start: '#0a1a1a',  // 深青黑
    end: '#1a2e2e',    // 深青
  },
  crowd_noise: {  // 围炉隔离
    start: '#1a0a0a',  // 深红黑
    end: '#2e1a1a',    // 深红棕
  },
  traffic_noise: {  // 倾盆掩盖
    start: '#0a0a1a',  // 深紫黑
    end: '#1a1a2e',    // 深紫
  },
};

// 默认颜色（兜底）
const DEFAULT_COLOR = { start: '#0a0a1a', end: '#1a1a2e' };

interface EQSliderProps {
  index: number;
  label: string;
  description: string;
  trackNum: number;
  volume: number; // 0-100
  onUpdateVolume: (trackNum: number, volume: number) => void;
}

// 【性能优化】使用 React.memo 包裹，防止不必要的重绘
const EQSlider: React.FC<EQSliderProps> = memo(({ index, label, description, trackNum, volume, onUpdateVolume }) => {
  // 使用 Animated.Value 记录位置（唯一视觉状态，完全独立）
  const thumbAnim = useRef(new Animated.Value(0)).current;
  const lastVolume = useRef(volume);
  const lastUpdateRef = useRef(0);
  const THROTTLE_MS = 32; // 32ms 节流（约 30fps，平衡性能与流畅度）
  
  // 标记是否正在被用户拖动
  const isDragging = useRef(false);

  // 映射函数：Volume (0-100) -> Position (0-MAX_POS)
  const getPosFromVolume = useCallback((v: number) => {
    return MAX_POS * (1 - v / 100);
  }, []);

  // 映射函数：Position -> Volume
  const getVolumeFromPos = useCallback((y: number) => {
    const clampedY = Math.max(0, Math.min(MAX_POS, y));
    return Math.round(100 - (clampedY / MAX_POS) * 100);
  }, []);

  // 【关键】仅在外部 volume 变化且未拖动时更新位置（避免干扰用户操作）
  useEffect(() => {
    if (!isDragging.current) {
      const initialPos = getPosFromVolume(volume);
      thumbAnim.setValue(initialPos);
      lastVolume.current = volume;
    }
  }, [volume, getPosFromVolume]);

  // 手势处理（高性能动画驱动）
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVerticalMove = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isSignificantMove = Math.abs(gestureState.dy) > 3;
        return isVerticalMove && isSignificantMove;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const isVerticalMove = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isSignificantMove = Math.abs(gestureState.dy) > 3;
        return isVerticalMove && isSignificantMove;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRequestTermination: () => false,
      onPanResponderGrant: () => {
        isDragging.current = true;
        thumbAnim.stopAnimation((value) => {
          thumbAnim.setOffset(value);
          thumbAnim.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // 【关键】直接更新动画（无 setState，视觉零延迟）
        thumbAnim.setValue(gestureState.dy);
        
        // 计算当前音量
        const currentTotalPos = (thumbAnim as any)._offset + gestureState.dy;
        const currentVolume = getVolumeFromPos(currentTotalPos);
        
        // 【节流阀】限制发送给底层的频率
        const now = Date.now();
        if (Math.abs(currentVolume - lastVolume.current) > 1 && (now - lastUpdateRef.current) > THROTTLE_MS) {
          // 直接调用底层（不触发 UI 更新）
          _8TrackAudioService.setTrackVolumePercent(trackNum, currentVolume);
          lastVolume.current = currentVolume;
          lastUpdateRef.current = now;
          
          // 通知父组件更新数值显示（允许轻微延迟）
          onUpdateVolume(trackNum, currentVolume);
        }
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        thumbAnim.flattenOffset();
        // 平滑回弹到最终位置
        Animated.spring(thumbAnim, {
          toValue: getPosFromVolume(lastVolume.current),
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.sliderWrapper}>
      <Text style={styles.frequencyLabel}>{label}</Text>
      
      <View style={styles.trackContainer} {...panResponder.panHandlers}>
        {/* 滑道线条 */}
        <View style={styles.trackBackground} />
        
        {/* 动态滑块（纯动画驱动，无 setState） */}
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ 
                translateY: thumbAnim.interpolate({
                  inputRange: [0, MAX_POS],
                  outputRange: [0, MAX_POS],
                  extrapolate: 'clamp',
                }) 
              }],
            },
          ]}
        />
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.volumeText}>
          {Math.round(volume)}%
        </Text>
        <Text style={styles.descText}>{description}</Text>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // 【性能优化】自定义比较：只在 volume 变化时重绘
  return prevProps.volume === nextProps.volume && 
         prevProps.description === nextProps.description;
});

interface EQControlPanelProps {
  sceneName?: string; // 可选，默认使用 'balanced_noise'
  onPlayStateChange?: (isPlaying: boolean) => void;
  isPlaying?: boolean; // 外部播放状态（可选）
  onTogglePlay?: () => void; // 外部播放控制（可选）
  isLoading?: boolean; // 加载中状态
}

const EQControlPanel: React.FC<EQControlPanelProps> = ({ 
  sceneName = 'balanced_noise',
  onPlayStateChange,
  isPlaying: externalIsPlaying,
  onTogglePlay: externalOnTogglePlay,
  isLoading = false,
}) => {
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [volumes, setVolumes] = useState<number[]>(Array(8).fill(100));
  
  // 【新增】背景渐变动画（800ms 呼吸感过渡）
  const backgroundColor = useRef(new Animated.Value(0)).current;
  const currentColorIndex = useRef(0);
  
  // 【关键修复】场景切换时重置滑块状态
  const prevSceneNameRef = useRef(sceneName);
  useEffect(() => {
    // 检测场景变化
    if (prevSceneNameRef.current !== sceneName) {
      console.log('[EQPanel] 🔄 场景切换，执行状态大洗牌:', prevSceneNameRef.current, '->', sceneName);
      
      // 【强制重置】UI 滑块归位
      const defaultVolumes = Array(8).fill(100);
      setVolumes(defaultVolumes);
      
      // 【强制重置】后台音频服务归位
      _8TrackAudioService.resetAllVolumes();
      
      // 【新增】背景颜色平滑过渡
      const targetColor = SCENE_COLORS[sceneName as keyof typeof SCENE_COLORS] || DEFAULT_COLOR;
      Animated.timing(backgroundColor, {
        toValue: currentColorIndex.current === 0 ? 1 : 0,
        duration: 800,  // 800ms 呼吸感过渡
        useNativeDriver: false,
      }).start();
      currentColorIndex.current = currentColorIndex.current === 0 ? 1 : 0;
      
      prevSceneNameRef.current = sceneName;
      
      console.log('[EQPanel] ✅ 状态大洗牌完成 - 所有滑块已归位 100%');
    }
  }, [sceneName]);
  
  // 使用外部状态或内部状态
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : internalIsPlaying;
  const handleTogglePlay = externalOnTogglePlay || internalHandleTogglePlay;

  // 内部播放控制（当没有外部控制时使用）
  async function internalHandleTogglePlay() {
    if (isPlaying) {
      console.log('[EQPanel] 点击停止');
      try {
        await _8TrackAudioService.stop8TrackAudio();
        setInternalIsPlaying(false);
        onPlayStateChange?.(false);
        console.log('[EQPanel] ✅ 已停止');
      } catch (error) {
        console.error('[EQPanel] ❌ 停止失败:', error);
        setInternalIsPlaying(false);
        onPlayStateChange?.(false);
      }
    } else {
      console.log('[EQPanel] 点击播放:', sceneName);
      try {
        await _8TrackAudioService.play8TrackAudio(sceneName);
        setInternalIsPlaying(true);
        onPlayStateChange?.(true);
        console.log('[EQPanel] ✅ 已播放');
      } catch (error) {
        console.error('[EQPanel] ❌ 播放失败:', error);
      }
    }
  }

  // 重置所有音量
  const handleResetVolumes = () => {
    const defaultVolumes = Array(8).fill(100);
    _8TrackAudioService.setAllTrackVolumes(defaultVolumes);
    setVolumes(defaultVolumes);
  };

  // 更新单个滑块音量状态
  const handleVolumeChange = useCallback((trackNum: number, newVolume: number) => {
    setVolumes(prev => {
      const newVols = [...prev];
      newVols[trackNum - 1] = newVolume;
      return newVols;
    });
  }, []);

  // 计算当前背景颜色（根据场景名称）
  const targetColor = SCENE_COLORS[sceneName as keyof typeof SCENE_COLORS] || DEFAULT_COLOR;
  const backgroundColorInterpolate = backgroundColor.interpolate({
    inputRange: [0, 1],
    outputRange: [targetColor.start, targetColor.end],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: backgroundColorInterpolate }]}>
      <Text style={styles.title}>8 段均衡器实验室</Text>
      
      {/* 控制按钮 */}
      <View style={styles.buttonRow}>
        <Button
          title={isLoading ? '⏳ 加载中...' : (isPlaying ? '⏹ 停止' : '▶ 播放')}
          color={isPlaying ? '#FF3B30' : '#34C759'}
          onPress={handleTogglePlay}
          disabled={isLoading}
        />
        <Button
          title="🔄 重置音量"
          color="#5856D6"
          onPress={handleResetVolumes}
          disabled={isLoading}
        />
      </View>

      {/* 状态显示 */}
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          当前音源：{sceneName.replace(/_/g, ' ')}
        </Text>
        <Text style={[
          styles.playStatus,
          { color: isPlaying ? '#34C759' : '#8E8E93' }
        ]}>
          {isPlaying ? '● 播放中' : '○ 已停止'}
        </Text>
      </View>
      
      <View style={styles.slidersContainer}>
        {TRACK_FREQUENCIES.map((freq, index) => (
          <EQSlider
            key={freq.index}
            index={index}
            label={freq.label}
            description={freq.description}
            trackNum={freq.trackNum}
            volume={volumes[index]}
            onUpdateVolume={handleVolumeChange}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>上下拖动滑块，独立控制各频段音量</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    minHeight: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',  // 极淡边框
    // 完全透明背景，让全屏渐变色透过来
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',  // 稍微降低文字透明度
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statusText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  playStatus: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '600',
  },
  slidersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: TRACK_HEIGHT + 70,
  },
  sliderWrapper: {
    width: SLIDER_WIDTH * 0.9,  // 缩小 10%，留出间隙
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  frequencyLabel: {
    color: '#8E8E93',
    fontSize: 9,
    marginBottom: 4,
    textAlign: 'center',
    height: 16,
    width: SLIDER_WIDTH * 0.9,
  },
  trackContainer: {
    width: 40,  // 减小宽度
    height: TRACK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackBackground: {
    width: 2,
    height: '100%',
    backgroundColor: '#2C2C2E',
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#6C5DD3',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 1,
  },
  infoContainer: {
    marginTop: 6,
    alignItems: 'center',
    height: 36,
    width: SLIDER_WIDTH * 0.9,
  },
  volumeText: {
    color: '#FFF',
    fontSize: 9,  // 减小字体
    fontWeight: '600',
    marginBottom: 2,
  },
  descText: {
    color: '#8E8E93',
    fontSize: 7,  // 减小字体
    textAlign: 'center',
    numberOfLines: 2,
  },
  footer: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingTop: 10,
  },
  footerText: {
    color: '#48484A',
    fontSize: 10,
    textAlign: 'center',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 10,
  },
});

export default EQControlPanel;