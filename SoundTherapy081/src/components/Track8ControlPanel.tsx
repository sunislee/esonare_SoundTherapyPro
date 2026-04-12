/**
 * 8 轨音量控制面板
 * 功能：
 * 1. 8 个垂直滑块独立控制 8 个音轨的音量
 * 2. 滑块值 (0-100) 平滑映射到音频音量 (0.0-1.0)
 * 3. 实时反馈，无延迟
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  Button,
} from 'react-native';
import * as _8TrackAudioService from '../services/8TrackAudioService';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = (width - 40) / 8;
const TRACK_HEIGHT = 180;
const THUMB_SIZE = 26;
const MAX_POS = TRACK_HEIGHT - THUMB_SIZE;

// 频段标签（对应 8 个轨道）
const BAND_LABELS = [
  { label: '20-100Hz', desc: '超低频' },
  { label: '100-250Hz', desc: '低频' },
  { label: '250-630Hz', desc: '中低频' },
  { label: '630-1.6k', desc: '中频' },
  { label: '1.6k-4k', desc: '中高频' },
  { label: '4k-8k', desc: '临场感' },
  { label: '8k-12k', desc: '辉煌感' },
  { label: '12k-20k', desc: '空气感' },
];

interface TrackSliderProps {
  trackNum: number;
  label: string;
  description: string;
  initialVolume: number;
  onVolumeChange?: (trackNum: number, volume: number) => void;
}

const TrackSlider: React.FC<TrackSliderProps> = ({ trackNum, label, description, initialVolume, onVolumeChange }) => {
  // 使用 Animated.Value 记录位置
  const thumbAnim = useRef(new Animated.Value(0)).current;
  const lastVolume = useRef(initialVolume);

  // 映射函数：Volume (0-1) -> Position (0-MAX_POS)
  const getPosFromVolume = (v: number) => {
    return MAX_POS * (1 - v);
  };

  // 映射函数：Position -> Volume
  const getVolumeFromPos = (y: number) => {
    const clampedY = Math.max(0, Math.min(MAX_POS, y));
    return 1 - (clampedY / MAX_POS);
  };

  // 初始化滑块位置
  useEffect(() => {
    const initialPos = getPosFromVolume(initialVolume);
    console.log(`[Track${trackNum}] 初始化位置：volume=${initialVolume}, pos=${initialPos}`);
    thumbAnim.setValue(initialPos);
  }, [initialVolume, trackNum]);

  // 手势处理
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
      onPanResponderGrant: (_, gestureState) => {
        console.log(`[Track${trackNum}] 开始拖拽，当前位置=${lastVolume.current * 100}%`);
        // 阻止 ScrollView 滚动
        thumbAnim.stopAnimation((value) => {
          thumbAnim.setOffset(value);
          thumbAnim.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        thumbAnim.setValue(gestureState.dy);
        
        const currentTotalPos = (thumbAnim as any)._offset + gestureState.dy;
        const currentVolume = getVolumeFromPos(currentTotalPos);
        
        if (Math.abs(currentVolume - lastVolume.current) > 0.01) {
          // 实时控制音量
          _8TrackAudioService.setTrackVolumePercent(trackNum, currentVolume * 100);
          lastVolume.current = currentVolume;
          // 通知父组件更新状态
          onVolumeChange?.(trackNum, currentVolume);
          console.log(`[Track${trackNum}] 拖动中：pos=${currentTotalPos}, volume=${(currentVolume * 100).toFixed(0)}%`);
        }
      },
      onPanResponderRelease: () => {
        console.log(`[Track${trackNum}] 释放，最终位置=${lastVolume.current * 100}%`);
        thumbAnim.flattenOffset();
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
        {/* 滑道背景 */}
        <View style={styles.trackBackground} />
        
        {/* 动态滑块 */}
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
          {Math.round(lastVolume.current * 100)}%
        </Text>
        <Text style={styles.descText}>{description}</Text>
      </View>
    </View>
  );
};

interface _8TrackControlPanelProps {
  audioGroupId?: string; // 音频组 ID，如 'balanced_noise'
}

const _8TrackControlPanel: React.FC<_8TrackControlPanelProps> = ({ audioGroupId = 'balanced_noise' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumes, setVolumes] = useState<number[]>(Array(8).fill(1.0));

  // 播放/停止控制
  const handleTogglePlay = async () => {
    if (isPlaying) {
      console.log('[8TrackPanel] 点击停止');
      try {
        await _8TrackAudioService.stop8TrackAudio();
        setIsPlaying(false);
        console.log('[8TrackPanel] ✅ 已停止');
      } catch (error) {
        console.error('[8TrackPanel] ❌ 停止失败:', error);
        // 即使出错也更新 UI 状态
        setIsPlaying(false);
      }
    } else {
      console.log('[8TrackPanel] 点击播放');
      try {
        await _8TrackAudioService.play8TrackAudio(audioGroupId);
        setIsPlaying(true);
        console.log('[8TrackPanel] ✅ 已播放');
      } catch (error) {
        console.error('[8TrackPanel] ❌ 播放失败:', error);
      }
    }
  };

  // 重置所有音量
  const handleResetVolumes = () => {
    const defaultVolumes = Array(8).fill(1.0);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>8 轨独立音量控制</Text>
      
      {/* 控制按钮 */}
      <View style={styles.buttonRow}>
        <Button
          title={isPlaying ? '⏹ 停止' : '▶ 播放'}
          color={isPlaying ? '#FF3B30' : '#34C759'}
          onPress={handleTogglePlay}
        />
        <Button
          title="🔄 重置音量"
          color="#5856D6"
          onPress={handleResetVolumes}
        />
      </View>

      {/* 状态显示 */}
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          当前音源：{audioGroupId}
        </Text>
        <Text style={[
          styles.playStatus,
          { color: isPlaying ? '#34C759' : '#8E8E93' }
        ]}>
          {isPlaying ? '● 播放中' : '○ 已停止'}
        </Text>
      </View>
      
      {/* 8 个滑块 */}
      <View style={styles.slidersContainer}>
        {BAND_LABELS.map((band, index) => (
          <TrackSlider
            key={index}
            trackNum={index + 1}
            label={band.label}
            description={band.description}
            initialVolume={volumes[index]}
            onVolumeChange={handleVolumeChange}
          />
        ))}
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>上下拖动滑块独立控制各频段音量</Text>
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
    minHeight: 280,
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
    marginBottom: 16,
    opacity: 0.9,
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
    width: SLIDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  frequencyLabel: {
    color: '#8E8E93',
    fontSize: 9,
    marginBottom: 4,
    textAlign: 'center',
    height: 20,
  },
  trackContainer: {
    width: 60,
    height: TRACK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  trackBackground: {
    width: 2,
    height: '100%',
    backgroundColor: '#2C2C2E',
    borderRadius: 1,
    position: 'absolute',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#6C5DD3',
    borderWidth: 2,
    borderColor: '#FFF',
    zIndex: 10,
  },
  infoContainer: {
    marginTop: 6,
    alignItems: 'center',
    height: 40,
  },
  volumeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  descText: {
    color: '#8E8E93',
    fontSize: 8,
    textAlign: 'center',
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 10,
    textAlign: 'center',
  },
});

export default _8TrackControlPanel;
