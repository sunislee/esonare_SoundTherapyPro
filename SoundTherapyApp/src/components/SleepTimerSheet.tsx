import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/Feather';
import AudioService from '../services/AudioService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.45;

interface SleepTimerSheetProps {
  visible: boolean;
  onClose: () => void;
}

const TIMER_OPTIONS = [
  { label: '10 分钟', value: 10 },
  { label: '20 分钟', value: 20 },
  { label: '30 分钟', value: 30 },
  { label: '45 分钟', value: 45 },
  { label: '60 分钟', value: 60 },
  { label: '90 分钟', value: 90 },
];

export const SleepTimerSheet: React.FC<SleepTimerSheetProps> = ({ visible, onClose }) => {
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Subscribe to timer updates
      const unsubscribe = AudioService.addSleepTimerListener((remaining) => {
        setRemainingTime(remaining);
      });

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      return () => unsubscribe();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const triggerHaptic = () => {
    ReactNativeHapticFeedback.trigger('selection', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };

  const handleSetTimer = (minutes: number) => {
    triggerHaptic();
    AudioService.setSleepTimer(minutes);
    onClose();
  };

  const handleCancelTimer = () => {
    triggerHaptic();
    AudioService.clearSleepTimer();
    onClose();
  };

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible && (translateY as any)._value === SHEET_HEIGHT) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: opacityAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.title}>睡眠定时</Text>
            {remainingTime !== null && (
              <View style={styles.activeBadge}>
                <Icon name="clock" size={12} color="#6C5DD3" />
                <Text style={styles.activeText}>{formatRemaining(remainingTime)}</Text>
              </View>
            )}
          </View>

          <View style={styles.optionsGrid}>
            {TIMER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.optionButton}
                onPress={() => handleSetTimer(opt.value)}
              >
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {remainingTime !== null && (
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTimer}>
              <Text style={styles.cancelButtonText}>取消定时</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>关闭</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// Simple Modal wrapper since we need it to be on top
import { Modal } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#161618',
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: '#333',
    borderRadius: 3,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 93, 211, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
  },
  activeText: {
    color: '#6C5DD3',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  optionButton: {
    width: '48%',
    backgroundColor: '#1e1e20',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2c',
  },
  optionLabel: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '500',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
  },
  cancelButtonText: {
    color: '#FF4D4F',
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    marginTop: 'auto',
    paddingVertical: 10,
  },
  closeButtonText: {
    color: '#666',
    fontSize: 14,
  },
});
