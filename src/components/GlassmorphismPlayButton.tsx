import React, { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Text,
} from 'react-native';

interface GlassmorphismPlayButtonProps {
  onPress: () => void;
  isPlaying: boolean;
  size?: number;
  style?: any;
}

const { width: screenWidth } = Dimensions.get('window');

const GlassmorphismPlayButton: React.FC<GlassmorphismPlayButtonProps> = ({
  onPress,
  isPlaying,
  size = screenWidth * 0.2,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
        style,
      ]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={[
          styles.button,
          {
            width: size,
            height: size,
          },
        ]}
      >
        <View style={styles.glassEffect} />
        <View style={[
          styles.iconContainer,
          {
            width: size * 0.6,
            height: size * 0.6,
          },
        ]}>
          {isPlaying ? (
            <View style={styles.pauseIcon}>
              <View style={[styles.pauseBar, { height: size * 0.3 }]} />
              <View style={[styles.pauseBar, { height: size * 0.3 }]} />
            </View>
          ) : (
            <View style={[
              styles.playIcon,
              {
                borderTopWidth: size * 0.25,
                borderBottomWidth: size * 0.25,
                borderLeftWidth: size * 0.35,
              },
            ]} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  glassEffect: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 9999,
    ...Platform.select({
      ios: {
        backdropFilter: 'blur(10px)',
      },
      android: {
        // Android doesn't support backdropFilter
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
      },
    }),
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    marginLeft: 5,
  },
  pauseIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: {
    width: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    marginHorizontal: 3,
  },
});

export default GlassmorphismPlayButton;