import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  BackHandler,
} from 'react-native';
import { PanGestureHandler, State, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Typography } from '../theme/Typography';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectTime: (seconds: number | null) => void;
};

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const TIMER_OPTIONS = [
  { label: '1 分钟', value: 1 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 },
];

const OptionButton: React.FC<{
  option: typeof TIMER_OPTIONS[0];
  onPress: (value: number) => void;
}> = ({ option, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  return (
    <AnimatedTouchableOpacity
      style={[styles.optionButton, { transform: [{ scale: scaleAnim }] }]}
      onPress={() => onPress(option.value)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
    >
      <Text style={styles.optionText}>{option.value}</Text>
      <Text style={styles.optionLabel}>分钟</Text>
    </AnimatedTouchableOpacity>
  );
};

export const TimerPickerSheet: React.FC<Props> = ({
  visible,
  onClose,
  onSelectTime,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const SHEET_HEIGHT = 320; // Fixed height for timer picker
  
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      const onBackPress = () => {
        onClose();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Open
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Close
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
        }
      });
    }
  }, [visible, SHEET_HEIGHT, translateY, opacityAnim]);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY, velocityY } = event.nativeEvent;
      const isClosing = translationY > 50 || velocityY > 500;

      if (isClosing) {
        onClose();
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }).start();
      }
    }
  };

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  const handleSetTimer = (minutes: number) => {
    triggerHaptic();
    onSelectTime(minutes * 60);
    onClose();
  };

  const handleClearTimer = () => {
    triggerHaptic();
    onSelectTime(null);
    onClose();
  };

  if (!shouldRender) return null;

  const backdropOpacity = opacityAnim;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdropContainer, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { height: SHEET_HEIGHT },
          { transform: [{ translateY: Animated.diffClamp(translateY, 0, SHEET_HEIGHT) }] },
        ]}>
        
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            <Text style={styles.headerTitle}>定时关闭</Text>
          </Animated.View>
        </PanGestureHandler>
        
        <View style={styles.content}>
          <View style={styles.optionsRow}>
            {TIMER_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                option={option}
                onPress={handleSetTimer}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClearTimer}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>关闭定时器</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'flex-end',
  },
  backdropContainer: { ...StyleSheet.absoluteFillObject },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: {
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 40,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    width: '100%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  optionButton: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionText: {
    fontFamily: Typography.fontFamily,
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  optionLabel: {
    fontFamily: Typography.fontFamily,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  closeButton: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeButtonText: {
    fontFamily: Typography.fontFamily,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
});
