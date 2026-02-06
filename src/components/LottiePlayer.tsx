import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import LottieView, { LottieViewProps } from 'lottie-react-native';

interface LottiePlayerProps extends Partial<LottieViewProps> {
  source: string | { uri: string } | any;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  loop?: boolean;
  hardwareAcceleration?: boolean;
  onAnimationFinish?: () => void;
}

/**
 * 通用 Lottie 动画播放组件
 * 用于统一封装 LottieView，方便后续替换动画文件和控制逻辑
 */
const LottiePlayer: React.FC<LottiePlayerProps> = ({
  source,
  style,
  autoPlay = true,
  loop = true,
  hardwareAcceleration = true,
  onAnimationFinish,
  ...props
}) => {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (autoPlay) {
      animationRef.current?.play();
    }
  }, [autoPlay]);

  return (
    <View style={[styles.container, style]}>
      <LottieView
        ref={animationRef}
        source={source}
        autoPlay={autoPlay}
        loop={loop}
        hardwareAccelerationAndroid={hardwareAcceleration}
        onAnimationFinish={onAnimationFinish}
        style={styles.animation}
        {...props}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});

export default LottiePlayer;
