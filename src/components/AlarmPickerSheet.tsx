import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  BackHandler,
} from 'react-native';
import { PanGestureHandler, State, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';
import { Typography } from '../theme/Typography';

type Props = {
  visible: boolean;
  initialTime?: string | null; // "HH:mm"
  onClose: () => void;
  onSave: (time: string) => void;
  onClear: () => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export const AlarmPickerSheet: React.FC<Props> = ({
  visible,
  initialTime,
  onClose,
  onSave,
  onClear,
}) => {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const SHEET_HEIGHT = 420;
  
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Use number for simpler calculation, convert to string for display/save
  const [selectedHour, setSelectedHour] = useState(7);
  const [selectedMinute, setSelectedMinute] = useState(0);

  // Initialize state only when opening
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
      if (initialTime) {
        const [h, m] = initialTime.split(':');
        setSelectedHour(parseInt(h, 10));
        setSelectedMinute(parseInt(m, 10));
      } else {
        // Default
        setSelectedHour(7);
        setSelectedMinute(0);
      }

      setShouldRender(true);
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
  }, [visible, SHEET_HEIGHT, translateY, opacityAnim]); // Removed initialTime to prevent updates while open

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
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };

  const adjustHour = (delta: number) => {
    triggerHaptic();
    setSelectedHour((prev) => (prev + delta + 24) % 24);
  };

  const adjustMinute = (delta: number) => {
    triggerHaptic();
    setSelectedMinute((prev) => (prev + delta + 60) % 60);
  };

  const formatTwoDigits = (num: number) => num.toString().padStart(2, '0');

  const renderNumberControl = (value: number, onAdjust: (d: number) => void, label: string) => (
    <View style={styles.controlColumn}>
      <Text style={styles.columnLabel}>{label}</Text>
      <TouchableOpacity 
        style={styles.adjustButton} 
        onPress={() => onAdjust(1)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.adjustButtonText}>+</Text>
      </TouchableOpacity>
      
      <View style={styles.numberDisplay}>
        <Text style={styles.numberText}>{formatTwoDigits(value)}</Text>
      </View>

      <TouchableOpacity 
        style={styles.adjustButton} 
        onPress={() => onAdjust(-1)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.adjustButtonText}>-</Text>
      </TouchableOpacity>
    </View>
  );

  if (!shouldRender) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdropContainer, { opacity: opacityAnim }]}>
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
            <Text style={styles.headerTitle}>{t('player.alarm.title')}</Text>
          </Animated.View>
        </PanGestureHandler>
        
        <View style={styles.content}>
          <View style={styles.pickerContainer}>
            {renderNumberControl(selectedHour, adjustHour, t('player.alarm.hour'))}
            <View style={styles.colonContainer}>
              <Text style={styles.colon}>:</Text>
            </View>
            {renderNumberControl(selectedMinute, adjustMinute, t('player.alarm.minute'))}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                triggerHaptic();
                onClear();
                onClose();
              }}
            >
              <Text style={styles.clearButtonText}>{t('player.alarm.clear')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => {
                triggerHaptic();
                onSave(`${formatTwoDigits(selectedHour)}:${formatTwoDigits(selectedMinute)}`);
                onClose();
              }}
            >
              <Text style={styles.confirmButtonText}>{t('player.alarm.confirm')}</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 24,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 16, width: '100%' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  headerTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 40 },
  pickerContainer: {
    flexDirection: 'row',
    height: 200,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlColumn: {
    alignItems: 'center',
    width: 80,
    justifyContent: 'center',
  },
  columnLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 10,
  },
  adjustButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  adjustButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
  },
  numberDisplay: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 5,
  },
  numberText: {
    fontFamily: Typography.fontFamily,
    fontSize: 48,
    color: '#fff',
    fontWeight: '200',
  },
  colonContainer: {
    height: '100%',
    justifyContent: 'center',
    paddingBottom: 20,
    marginHorizontal: 10,
  },
  colon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '200',
    marginTop: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  clearButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  confirmButton: {
    flex: 1,
    marginLeft: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
