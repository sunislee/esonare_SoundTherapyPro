import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Scene, getIconName } from '../constants/scenes';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = 70;
const CONTAINER_WIDTH = width - 40; // marginHorizontal: 20

interface AnimatedFloatingButtonProps {
  ambient: Scene;
  isActive: boolean;
  column: number;
  row: number;
  onPress: () => void;
}

const AnimatedFloatingButton: React.FC<AnimatedFloatingButtonProps> = ({
  ambient,
  isActive,
  column,
  row,
  onPress,
}) => {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: (row * 2 + column) * 100,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, []);

  useEffect(() => {
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

  // Position calculation
  // 2 columns, 4 rows
  const left = column === 0 ? 20 : CONTAINER_WIDTH - BUTTON_SIZE - 20;
  const top = row * 130 + 40;

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
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[
          styles.button,
          isActive && styles.activeButton,
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
      </TouchableOpacity>
      <View style={{ height: 15 }} />
      <Text style={[styles.label, isActive && styles.activeLabel]}>
        {t(ambient.title)}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    width: BUTTON_SIZE + 40,
    overflow: 'visible',
    paddingBottom: 20,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  activeButton: {
    backgroundColor: '#6C5DD3',
    borderColor: '#fff',
    elevation: 10,
    shadowColor: '#6C5DD3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  glow: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(108, 93, 211, 0.4)',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    flexWrap: 'wrap',
    maxWidth: 100,
  },
  activeLabel: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default AnimatedFloatingButton;
