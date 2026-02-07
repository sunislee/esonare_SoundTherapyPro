import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

interface BreathingLoaderProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * BreathingLoader 组件
 * 使用 download_loading.json (呼吸球) 动画
 * 锁定 0.8x 倍速，提供稳健的视觉反馈
 */
export const BreathingLoader: React.FC<BreathingLoaderProps> = ({ 
  size = 120, 
  style 
}) => {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <LottieView
        source={require('../assets/animations/download_loading.json')}
        autoPlay
        loop
        speed={0.8}
        style={styles.lottie}
        hardwareAccelerationAndroid
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
});
