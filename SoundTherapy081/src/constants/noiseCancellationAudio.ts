// 降噪模块音频资源配置
// 4 种环境降噪音源：风声、交通、人声、均衡

export const NOISE_CANCELLATION_AUDIO = [
  {
    id: 'noise_wind',
    category: 'noise_cancellation',
    title: '风声降噪',
    subtitle: '户外防风噪',
    // 粉红噪音 - 风声效果
    resourceName: 'wind_noise', // raw/wind_noise.m4a
    isLocal: true,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_traffic',
    category: 'noise_cancellation',
    title: '交通降噪',
    subtitle: '车辆鸣笛声',
    // 低频噪音 - 交通环境
    resourceName: 'traffic_noise', // raw/traffic_noise.wav
    isLocal: true,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_crowd',
    category: 'noise_cancellation',
    title: '人声降噪',
    subtitle: '嘈杂人声过滤',
    // 白噪音 - 人声过滤
    resourceName: 'crowd_noise', // raw/crowd_noise.wav
    isLocal: true,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_balanced',
    category: 'noise_cancellation',
    title: '均衡降噪',
    subtitle: '综合环境降噪',
    // 综合降噪 - 雨声背景
    resourceName: 'balanced_noise', // raw/balanced_noise.m4a
    isLocal: true,
    loop: true,
    duration: 180,
  },
];

// 导出给 AudioService 使用
export const getNoiseCancellationAudio = (id: string) => {
  return NOISE_CANCELLATION_AUDIO.find(audio => audio.id === id);
};

// 导出所有降噪音频 ID
export const getNoiseCancellationIds = () => {
  return NOISE_CANCELLATION_AUDIO.map(audio => audio.id);
};
