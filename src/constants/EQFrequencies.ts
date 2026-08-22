// 均衡器频段定义
// 频率范围：60Hz ~ 16kHz（8 段）
// 增益契约：-1.0 ~ +1.0（其中 0.0 = 平响、+1.0 = +12dB、-1.0 = -12dB）
// 对应 Android AudioLevelModule.kt L342 原生层映射
// 频率单位：Hz
export const EQ_FREQUENCIES = [
  { index: 0, frequency: 60, label: '60Hz', description: '超低频' },
  { index: 1, frequency: 150, label: '150Hz', description: '低频' },
  { index: 2, frequency: 400, label: '400Hz', description: '中低频' },
  { index: 3, frequency: 1000, label: '1kHz', description: '中频' },
  { index: 4, frequency: 2500, label: '2.5kHz', description: '中高频' },
  { index: 5, frequency: 5000, label: '5kHz', description: '高频' },
  { index: 6, frequency: 10000, label: '10kHz', description: '超高频' },
  { index: 7, frequency: 16000, label: '16kHz', description: '极高频' },
];

// 增益范围：-1.0 ~ +1.0（对应 -12dB ~ +12dB）
export const EQ_GAIN_MIN = -1.0;
export const EQ_GAIN_MAX = 1.0;
export const EQ_GAIN_STEP = 0.1;

// 默认增益值（0dB = 平响）
export const EQ_DEFAULT_GAIN = 0.0;
