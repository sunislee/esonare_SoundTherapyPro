/**
 * 多轨并行混音 EQ 面板（方案 A：不使用 Equalizer）
 * 简化为 3 段：低频、中频、高频
 */

import React, { useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  Button,
} from 'react-native';
import { setAllTrackVolumes } from '../services/MultiTrackAudioService';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = (width - 60) / 3;
const TRACK_HEIGHT = 180;
const THUMB_SIZE = 28;
const MAX_POS = TRACK_HEIGHT - THUMB_SIZE;

interface TrackSliderProps {
  track: 'low' | 'mid' | 'high';
  label: string;
  frequency: string;
  volume: number;
  onUpdateVolume: (track: 'low' | 'mid' | 'high', volume: number) => void;
}

const TrackSlider: React.FC<TrackSliderProps> = ({
  track,
  label,
  frequency,
  volume,
  onUpdateVolume,
}) => {
  const thumbAnim = useRef(new Animated.Value(0)).current;
  const lastVolume = useRef(volume);

  const getPosFromVolume = (v: number) => {
    return MAX_POS * (1 - v);
  };

  const getVolumeFromPos = (y: number) => {
    const clampedY = Math.max(0, Math.min(MAX_POS, y));
    return 1 - (clampedY / MAX_POS);
  };

  useEffect(() => {
    thumbAnim.setValue(getPosFromVolume(volume));
  }, [volume]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVerticalMove = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isSignificantMove = Math.abs(gestureState.dy) > 5;
        return isVerticalMove && isSignificantMove;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        thumbAnim.stopAnimation((value) => {
          thumbAnim.setOffset(value);
          thumbAnim.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        thumbAnim.setValue(gestureState.dy);
        
        const currentTotalPos = (thumbAnim as any)._offset + gestureState.dy;
        const currentVolume = getVolumeFromPos(currentTotalPos);
        
        if (currentVolume !== lastVolume.current) {
          onUpdateVolume(track, currentVolume);
          lastVolume.current = currentVolume;
        }
      },
      onPanResponderRelease: () => {
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

  const getTrackColor = () => {
    switch (track) {
      case 'low': return '#FF6B6B';
      case 'mid': return '#4ECDC4';
      case 'high': return '#FFE66D';
    }
  };

  return (
    <View style={styles.sliderWrapper}>
      <Text style={[styles.frequencyLabel, { color: getTrackColor() }]}>{label}</Text>
      <Text style={styles.frequencyValue}>{frequency}</Text>
      
      <View style={styles.trackContainer} {...panResponder.panHandlers}>
        <View style={styles.trackBackground} />
        <View style={[styles.zeroLine, { backgroundColor: getTrackColor() }]} />
        
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: getTrackColor(),
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
          {(volume * 100).toFixed(0)}%
        </Text>
      </View>
    </View>
  );
};

interface MultiTrackEQPanelProps {
  enabled: boolean;
}

const MultiTrackEQPanel: React.FC<MultiTrackEQPanelProps> = ({ enabled }) => {
  const [volumes, setVolumes] = React.useState({
    low: 1.0,
    mid: 1.0,
    high: 1.0,
  });

  const handleUpdateVolume = useCallback((track: 'low' | 'mid' | 'high', volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1.0, volume));
    
    setVolumes(prev => ({
      ...prev,
      [track]: clampedVolume,
    }));
    
    // 实时应用到音频
    if (enabled) {
      setAllTrackVolumes({ [track]: clampedVolume });
    }
  }, [enabled]);

  const handleReset = () => {
    setVolumes({
      low: 1.0,
      mid: 1.0,
      high: 1.0,
    });
    
    if (enabled) {
      setAllTrackVolumes({ low: 1.0, mid: 1.0, high: 1.0 });
    }
  };

  if (!enabled) {
    return (
      <View style={[styles.container, styles.disabledContainer]}>
        <Text style={styles.disabledText}>多轨混音模式未启用</Text>
        <Text style={styles.disabledSubtext}>请先播放分频段音频</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎚️ 三轨混音控制台</Text>
        <Button title="重置" onPress={handleReset} color="#6C5DD3" />
      </View>
      
      <View style={styles.slidersContainer}>
        <TrackSlider
          track="low"
          label="低频"
          frequency="0-300Hz"
          volume={volumes.low}
          onUpdateVolume={handleUpdateVolume}
        />
        <TrackSlider
          track="mid"
          label="中频"
          frequency="300Hz-3kHz"
          volume={volumes.mid}
          onUpdateVolume={handleUpdateVolume}
        />
        <TrackSlider
          track="high"
          label="高频"
          frequency="3kHz-20kHz"
          volume={volumes.high}
          onUpdateVolume={handleUpdateVolume}
        />
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>上下拖动滑块调节各频段音量</Text>
        <Text style={styles.footerSubtext}>无需 Equalizer，纯音量混合方案</Text>
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
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  disabledContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledSubtext: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  slidersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 260,
  },
  sliderWrapper: {
    width: SLIDER_WIDTH,
    alignItems: 'center',
  },
  frequencyLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  frequencyValue: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 8,
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
    borderWidth: 2,
    borderColor: '#FFF',
  },
  infoContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  volumeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 16,
    alignItems: 'center',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  footerSubtext: {
    color: '#6C5DD3',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
});

export default MultiTrackEQPanel;
