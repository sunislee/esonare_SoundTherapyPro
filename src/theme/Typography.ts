import { Platform } from 'react-native';

// 【修复方块问题】强制使用系统默认字体
export const Typography = {
  fontFamily: Platform.select({
    ios: 'System',
    android: 'sans-serif', // 使用 Android 系统默认黑体
    default: 'sans-serif',
  }),
  weights: {
    regular: '400',
    bold: '700',
  },
};
