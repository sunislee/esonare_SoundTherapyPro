// 降噪模块音频资源配置
// 4 种环境降噪音源：风声、交通、人声、均衡
// 【1.4.1 核心设计】资源远程化：所有音频使用 GitHub 远程 URL，不打包进 APK

import { GITHUB_URL } from './audioAssets';

export const NOISE_CANCELLATION_AUDIO = [
  {
    id: 'noise_wind',
    category: 'noise_cancellation',
    title: '风声降噪',
    subtitle: '户外防风噪',
    // 粉红噪音 - 风声效果
    url: GITHUB_URL + 'noise%20reduction/wind_noise.m4a',
    isLocal: false,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_traffic',
    category: 'noise_cancellation',
    title: '交通降噪',
    subtitle: '车辆鸣笛声',
    // 低频噪音 - 交通环境
    url: GITHUB_URL + 'noise%20reduction/traffic_noise.m4a',
    isLocal: false,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_crowd',
    category: 'noise_cancellation',
    title: '人声降噪',
    subtitle: '嘈杂人声过滤',
    // 白噪音 - 人声过滤
    url: GITHUB_URL + 'noise%20reduction/crowd_noise.m4a',
    isLocal: false,
    loop: true,
    duration: 180,
  },
  {
    id: 'noise_balanced',
    category: 'noise_cancellation',
    title: '均衡降噪',
    subtitle: '综合环境降噪',
    // 综合降噪 - 雨声背景
    url: GITHUB_URL + 'noise%20reduction/balanced_noise.m4a',
    isLocal: false,
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
