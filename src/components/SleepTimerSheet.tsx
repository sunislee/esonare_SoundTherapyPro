import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Feather';
import Svg, { Circle } from 'react-native-svg';
import AudioService from '../services/AudioService';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.45;
const CIRCLE_SIZE = 120;
const CIRCLE_RADIUS = (CIRCLE_SIZE - 10) / 2;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// react-native-svg components need to be used with useNativeDriver: false for most props
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface SleepTimerSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const SleepTimerSheet: React.FC<SleepTimerSheetProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [isAnimationFinished, setIsAnimationFinished] = useState(true);

  useEffect(() => {
    if (visible) {
      setIsAnimationFinished(false);
      // Subscribe to timer updates
      const unsubscribe = AudioService.addSleepTimerListener((remaining) => {
        setRemainingTime(remaining);
        if (remaining !== null) {
          const initial = AudioService.getInitialSleepSeconds() || 1;
          const progress = remaining / initial;
          // SVG props do NOT support native driver
          Animated.timing(progressAnim, {
            toValue: progress,
            duration: 1000,
            useNativeDriver: false,
          }).start();
        } else {
          progressAnim.setValue(0);
        }
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
      ]).start(() => {
        setIsAnimationFinished(true);
      });
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

  if (!visible && isAnimationFinished) return null;

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
            <Text style={styles.title}>{t('sleepTimer.title')}</Text>
          </View>

          {remainingTime !== null ? (
            <View style={styles.timerActiveContainer}>
              <View style={styles.timerCircleWrapper}>
                <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                  <Circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={CIRCLE_RADIUS}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="6"
                    fill="none"
                  />
                  <AnimatedCircle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={CIRCLE_RADIUS}
                    stroke="#6C5DD3"
                    strokeWidth="6"
                    fill="none"
                    strokeDasharray={`${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
                    strokeDashoffset={progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [CIRCLE_CIRCUMFERENCE, 0],
                    })}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
                  />
                </Svg>
                <View style={styles.timerTextContainer}>
                  <Text style={styles.timerValue}>{formatRemaining(remainingTime)}</Text>
                  <Text style={styles.timerLabel}>{t('sleepTimer.remaining')}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTimer}>
                <Text style={styles.cancelButtonText}>{t('sleepTimer.stop')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.optionsGrid}>
              {[10, 20, 30, 45, 60, 90].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={styles.optionButton}
                  onPress={() => handleSetTimer(mins)}
                >
                  <Text style={styles.optionLabel}>{t('sleepTimer.minutes', { count: mins })}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{t('sleepTimer.close')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

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
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  timerActiveContainer: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  timerCircleWrapper: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  timerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  optionButton: {
    width: '48%',
    backgroundColor: '#1e1e20',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optionLabel: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '500',
  },
  cancelButton: {
    width: '80%',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 79, 0.2)',
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
