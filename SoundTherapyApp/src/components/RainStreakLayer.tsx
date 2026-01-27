import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

type Streak = {
  leftPct: number;
  width: number;
  opacity: number;
  duration: number;
  delay: number;
  tilt: number;
  lengthPct: number;
};

export const RainStreakLayer: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const { height } = useWindowDimensions();
  const streaks = useMemo<Streak[]>(() => {
    const count = 18;
    const arr: Streak[] = [];
    for (let i = 0; i < count; i += 1) {
      arr.push({
        leftPct: Math.random() * 100,
        width: 1 + Math.random() * 2,
        opacity: 0.05 + Math.random() * 0.12,
        duration: 6500 + Math.random() * 9000,
        delay: Math.random() * 2500,
        tilt: -3 + Math.random() * 6,
        lengthPct: 40 + Math.random() * 55,
      });
    }
    return arr;
  }, []);

  const anims = useRef<Animated.Value[]>(streaks.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((a, i) => {
      const s = streaks[i];
      a.setValue(0);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(s.delay),
          Animated.timing(a, {
            toValue: 1,
            duration: s.duration,
            useNativeDriver: true,
          }),
        ]),
        { resetBeforeIteration: true },
      );
    });

    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [anims, streaks]);

  const clamped = Math.max(0, Math.min(1, intensity));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {streaks.map((s, i) => {
        const a = anims[i];
        const translateY = a.interpolate({
          inputRange: [0, 1],
          outputRange: [-height * 0.6, height * 1.2],
        });
        const localOpacity = a.interpolate({
          inputRange: [0, 0.08, 0.92, 1],
          outputRange: [0, s.opacity * clamped, s.opacity * clamped, 0],
        });

        return (
          <Animated.View
            key={`streak-${i}`}
            style={[
              styles.streak,
              {
                left: `${s.leftPct}%`,
                width: s.width,
                height: `${s.lengthPct}%`,
                opacity: localOpacity,
                transform: [{ translateY }, { rotate: `${s.tilt}deg` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  streak: {
    position: 'absolute',
    top: 0,
    borderRadius: 99,
    backgroundColor: 'rgba(234, 240, 255, 0.9)',
  },
});

