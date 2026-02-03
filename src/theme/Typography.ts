import { Platform } from 'react-native';

export const Typography = {
  fontFamily: Platform.select({
    ios: 'PingFang SC',
    android: 'Noto Sans CJK SC, sans-serif',
    default: 'sans-serif',
  }),
  weights: {
    regular: '400',
    bold: '700',
  },
};
