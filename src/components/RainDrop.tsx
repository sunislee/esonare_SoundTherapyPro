import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

interface RainDropProps {
  volume: number;
  rainDropConfig: {
    id: number;
    top: number;
    left: number;
    delay: number;
    length: number;
  };
}

export const RainDrop: React.FC<RainDropProps> = ({ volume, rainDropConfig }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const tailOpacity = useRef(new Animated.Value(0.5)).current;

  const getRainProperties = useCallback(() => {
    const randomScale = 0.6 + Math.random() * 0.6;
    const randomRotation = (Math.random() * 20 - 10) * Math.PI / 180;
    const randomOffset = Math.random() * 60 - 30;
    const windEffect = Math.random() * 20 - 10;
    const swingAmplitude = 5 + Math.random() * 10;
    const swingFrequency = 0.5 + Math.random() * 1.5;
    
    return {
      randomScale,
      randomRotation,
      randomOffset,
      windEffect,
      swingAmplitude,
      swingFrequency
    };
  }, []);

  const getBaseSpeed = useCallback(() => {
    const baseSpeed = 4000 - (volume * 3000);
    return baseSpeed * (0.8 + Math.random() * 0.4);
  }, [volume]);

  useEffect(() => {
    let isMounted = true;

    const animateRain = () => {
      if (!isMounted) return;

      const rainProps = getRainProperties();
      
      translateY.setValue(-100);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(rainProps.randomScale * 0.8);
      rotate.setValue(0);
      tailOpacity.setValue(0.5);
      
      const fallDuration = getBaseSpeed();
      
      const swingAnimation = Animated.timing(translateX, {
        toValue: rainProps.randomOffset + rainProps.windEffect,
        duration: fallDuration,
        easing: (t) => {
          const swing = Math.sin(t * Math.PI * rainProps.swingFrequency) * rainProps.swingAmplitude;
          const forward = t * t;
          return forward * (rainProps.randomOffset + rainProps.windEffect) + swing;
        },
        useNativeDriver: true,
      });
      
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 300,
          duration: fallDuration,
          easing: (t) => t * t * t,
          useNativeDriver: true,
        }),
        swingAnimation,
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.9 + Math.random() * 0.1,
            duration: fallDuration * 0.15,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.9 + Math.random() * 0.1,
            duration: fallDuration * 0.6,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: fallDuration * 0.25,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        ]),
        Animated.sequence([
          Animated.timing(tailOpacity, {
            toValue: 0,
            duration: fallDuration * 0.8,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          })
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: rainProps.randomScale,
            duration: fallDuration * 0.2,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: rainProps.randomScale * 0.7,
            duration: fallDuration * 0.8,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        ]),
        Animated.timing(rotate, {
          toValue: rainProps.randomRotation,
          duration: fallDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ]).start(({ finished }) => {
        if (finished && isMounted) {
          const delay = Math.random() * 800;
          setTimeout(() => {
            if (isMounted) animateRain();
          }, delay);
        }
      });
    };

    const initialDelay = rainDropConfig.delay + Math.random() * 500;
    const timeoutId = setTimeout(() => {
      animateRain();
    }, initialDelay);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      translateY.setValue(-100);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.8);
      rotate.setValue(0);
    };
  }, [
    getBaseSpeed,
    getRainProperties,
    opacity,
    rainDropConfig,
    rotate,
    scale,
    tailOpacity,
    translateX,
    translateY,
  ]);

  return (
    <>
      <Animated.View
        style={[
          styles.rainDrop,
          {
            top: `${rainDropConfig.top}%`,
            left: `${rainDropConfig.left}%`,
            height: rainDropConfig.length,
            opacity: opacity,
            transform: [
              { translateX },
              { translateY },
              { scale },
              { rotate: rotate.interpolate({ inputRange: [-Math.PI/9, Math.PI/9], outputRange: ['-10deg', '10deg'] }) }
            ],
            zIndex: 10,
          }
        ]}
      />
      <Animated.View
        style={[
          styles.rainDrop,
          styles.rainTail,
          {
            top: `${rainDropConfig.top}%`,
            left: `${rainDropConfig.left}%`,
            height: rainDropConfig.length * 0.8,
            opacity: tailOpacity.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.3, 0.5]
            }),
            transform: [
              { translateX },
              { translateY: translateY.interpolate({ inputRange: [-100, 300], outputRange: [-80, 280] }) },
              { scale: scale.interpolate({ inputRange: [0.5, 1.2], outputRange: [0.6, 0.9] }) },
              { rotate: rotate.interpolate({ inputRange: [-Math.PI/9, Math.PI/9], outputRange: ['-10deg', '10deg'] }) }
            ],
            zIndex: 9,
          }
        ]}
      />
    </>
  );
};

const styles = StyleSheet.create({
  rainDrop: {
    position: 'absolute',
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1,
    zIndex: 99,
  },
  rainTail: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    width: 1,
    zIndex: 98,
  },
});
