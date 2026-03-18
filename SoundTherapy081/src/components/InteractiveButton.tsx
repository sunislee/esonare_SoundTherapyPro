import React, { useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Scene } from '../constants/scenes';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTranslation } from 'react-i18next';

interface InteractiveButtonProps {
  ambient: Scene;
  isActive: boolean;
  column: number;
  row: number;
  onPress: () => void;
}

const InteractiveButton: React.FC<InteractiveButtonProps> = ({
  ambient,
  isActive,
  column,
  row,
  onPress,
}) => {
  const { t } = useTranslation();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const glowAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: (row * 2 + column) * 100,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, []);

  React.useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isActive]);

  const left = column === 0 ? 20 : (Dimensions.get('window').width - 40) - 70 - 20;
  const top = row * 130 + 40;

  const handlePress = useCallback(() => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
    onPress();
  }, [onPress]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left,
          top,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        unstable_pressDelay={0}
        style={[
          styles.button,
          isActive && styles.activeButton,
          ({ pressed }) => pressed && styles.pressedButton,
        ]}
      >
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowAnim,
              transform: [
                {
                  scale: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
        <Ionicons
          name={getIconName(ambient.id)}
          size={28}
          color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.6)'}
        />
      </Pressable>
      <View style={{ height: 15 }} />
      <Text style={[styles.label, isActive && styles.activeLabel]}>
        {t(ambient.title)}
      </Text>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');
const BUTTON_SIZE = 70;
const CONTAINER_WIDTH = width - 40;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(108, 93, 211, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: '#6C5DD3',
  },
  pressedButton: {
    opacity: 0.7,
  },
  glow: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#6C5DD3',
    opacity: 0,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 5,
  },
  activeLabel: {
    color: '#fff',
  },
});

function getIconName(sceneId: string): string {
  if (sceneId.includes('white_noise')) return 'radio';
  if (sceneId.includes('wind_chime')) return 'musical-notes';
  if (sceneId.includes('breath')) return 'body';
  if (sceneId.includes('apple')) return 'apple';
  if (sceneId.includes('match')) return 'flame';
  return 'musical-note';
}

export default memo(InteractiveButton);
