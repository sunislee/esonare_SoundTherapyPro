import React, { useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useAudio } from '../context/AudioContext';
import { EQ_FREQUENCIES, EQ_GAIN_MIN, EQ_GAIN_MAX, EQ_GAIN_STEP } from '../constants/EQFrequencies';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = (width - 40) / 8; 
const TRACK_HEIGHT = 140; // 【优化】从 160 降至 140，节省垂直空间
const THUMB_SIZE = 26;
const MAX_POS = TRACK_HEIGHT - THUMB_SIZE;

interface EQSliderProps {
  index: number;
  label: string;
  description: string;
  gain: number;
  onUpdateGain: (index: number, gain: number) => void;
}

const EQSlider: React.FC<EQSliderProps> = ({ index, label, description, gain, onUpdateGain }) => {
  // 1. 使用 Animated.Value 记录位置，避免 setState 引起的视觉跳变
  const thumbAnim = useRef(new Animated.Value(0)).current;
  const lastGain = useRef(gain);

  // 映射函数：Gain (-1~1) -> Position (0~MAX_POS)
  const getPosFromGain = (g: number) => {
    const normalized = (g - EQ_GAIN_MIN) / (EQ_GAIN_MAX - EQ_GAIN_MIN);
    return MAX_POS * (1 - normalized);
  };

  // 映射函数：Position -> Gain
  const getGainFromPos = (y: number) => {
    const clampedY = Math.max(0, Math.min(MAX_POS, y));
    const normalized = 1 - (clampedY / MAX_POS);
    let newGain = EQ_GAIN_MIN + normalized * (EQ_GAIN_MAX - EQ_GAIN_MIN);
    return Math.round(newGain / EQ_GAIN_STEP) * EQ_GAIN_STEP;
  };

  // 初始化滑块位置
  useEffect(() => {
    thumbAnim.setValue(getPosFromGain(gain));
  }, []);

  // 2. 核心手势逻辑：解决“闪现”和“不跟手”问题
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // 开始拖拽时，锁定当前位置作为偏移量，防止瞬移
        thumbAnim.stopAnimation((value) => {
          thumbAnim.setOffset(value);
          thumbAnim.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // 实时移动滑块
        thumbAnim.setValue(gestureState.dy);
        
        // 计算当前增益值并回调
        const currentTotalPos = (thumbAnim as any)._offset + gestureState.dy;
        const currentGain = getGainFromPos(currentTotalPos);
        
        if (currentGain !== lastGain.current) {
          onUpdateGain(index, currentGain);
          lastGain.current = currentGain;
        }
      },
      onPanResponderRelease: () => {
        // 结束时合并偏移量，并平滑吸附到步长位置
        thumbAnim.flattenOffset();
        Animated.spring(thumbAnim, {
          toValue: getPosFromGain(lastGain.current),
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
        {/* 0dB 基准线 */}
        <View style={styles.zeroLine} />
        
        {/* 动态滑块 */}
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ 
                translateY: thumbAnim.interpolate({
                  inputRange: [0, MAX_POS],
                  outputRange: [0, MAX_POS],
                  extrapolate: 'clamp', // 物理锁定，防止滑块飞出
                }) 
              }],
            },
          ]}
        />
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.gainText}>
          {gain > 0 ? '+' : ''}{(gain * 12).toFixed(1)}dB
        </Text>
        <Text style={styles.descText}>{description}</Text>
      </View>
    </View>
  );
};

const EQControlPanel: React.FC = () => {
  const { eqGains, updateEqGain } = useAudio();
  
  // 【冷启动优化】检查 eqGains 是否已加载完成
  const isLoading = !eqGains || eqGains.length === 0 || eqGains.every(g => g === undefined || g === null);
  
  // 【Loading 状态降级】如果数据未就绪，显示加载指示器
  if (isLoading) {
    return (
      <View style={[styles.container, { minHeight: 240, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#6C5DD3" />
        <Text style={styles.loadingText}>均衡器加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>8 段均衡器实验室</Text>
      <View style={styles.slidersContainer}>
        {EQ_FREQUENCIES.map((freq, index) => (
          <EQSlider
            key={freq.index}
            index={index}
            label={freq.label}
            description={freq.description}
            gain={eqGains[index] || 0}
            onUpdateGain={updateEqGain}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>上下拖动滑块调节频段增益</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1B2E',
    borderRadius: 24,
    padding: 20,
    margin: 16,
    // 【冷启动优化】设置硬编码最小高度，防止测量完成前高度为 0 导致黑屏
    minHeight: 240,
    // 【性能优化】简化阴影，减少低端机型渲染压力
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.9,
  },
  slidersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // 【硬编码高度】不再依赖 flex 或内容撑开
    height: 240,
  },
  sliderWrapper: {
    width: SLIDER_WIDTH,
    alignItems: 'center',
  },
  frequencyLabel: {
    color: '#8E8E93',
    fontSize: 10,
    marginBottom: 10,
  },
  trackContainer: {
    width: 30,
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
  zeroLine: {
    position: 'absolute',
    width: 12,
    height: 1,
    backgroundColor: '#48484A',
    top: TRACK_HEIGHT / 2,
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
    // 【性能优化】降低 elevation 减少渲染压力
    elevation: 1,
  },
  infoContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  gainText: {
    color: '#6C5DD3',
    fontSize: 10,
    fontWeight: 'bold',
  },
  descText: {
    color: '#48484A',
    fontSize: 9,
    marginTop: 2,
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