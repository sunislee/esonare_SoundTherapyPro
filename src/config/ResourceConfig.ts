/**
 * 资源配置文件
 * 定义所有远程音频资源的映射关系
 */

import { IS_GOOGLE_PLAY_VERSION } from '../constants/audioAssets';

export interface AudioResource {
  id: string;
  filename: string;
  category: string;
  priority: 1 | 2; // 1 = 高优先级，2 = 普通优先级
  remoteUrl: string;
  localPath?: string; // 运行时填充
}

// kkgithub GitHub 镜像（国内速度快）
const GITHUB_BASE_URL = 'https://raw.kkgithub.com/sunislee/sound-therapy-assets/main';
const NOISE_REDUCTION_PATH = 'noise reduction'; // GitHub 目录名带空格

// 32 个降噪音频资源配置
export const NOISE_REDUCTION_RESOURCES: AudioResource[] = [
  // ==================== 优先级 1：balanced_noise 系列（最常用）====================
  {
    id: 'balanced_noise_1',
    filename: 'balanced_noise_track_1.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_1.mp3`,
  },
  {
    id: 'balanced_noise_2',
    filename: 'balanced_noise_track_2.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_2.mp3`,
  },
  {
    id: 'balanced_noise_3',
    filename: 'balanced_noise_track_3.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_3.mp3`,
  },
  {
    id: 'balanced_noise_4',
    filename: 'balanced_noise_track_4.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_4.mp3`,
  },
  {
    id: 'balanced_noise_5',
    filename: 'balanced_noise_track_5.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_5.mp3`,
  },
  {
    id: 'balanced_noise_6',
    filename: 'balanced_noise_track_6.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_6.mp3`,
  },
  {
    id: 'balanced_noise_7',
    filename: 'balanced_noise_track_7.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_7.mp3`,
  },
  {
    id: 'balanced_noise_8',
    filename: 'balanced_noise_track_8.mp3',
    category: 'balanced_noise',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/balanced_noise_track_8.mp3`,
  },

  // ==================== 优先级 2：crowd_noise 系列====================
  {
    id: 'crowd_noise_1',
    filename: 'crowd_noise_track_1.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_1.mp3`,
  },
  {
    id: 'crowd_noise_2',
    filename: 'crowd_noise_track_2.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_2.mp3`,
  },
  {
    id: 'crowd_noise_3',
    filename: 'crowd_noise_track_3.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_3.mp3`,
  },
  {
    id: 'crowd_noise_4',
    filename: 'crowd_noise_track_4.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_4.mp3`,
  },
  {
    id: 'crowd_noise_5',
    filename: 'crowd_noise_track_5.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_5.mp3`,
  },
  {
    id: 'crowd_noise_6',
    filename: 'crowd_noise_track_6.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_6.mp3`,
  },
  {
    id: 'crowd_noise_7',
    filename: 'crowd_noise_track_7.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_7.mp3`,
  },
  {
    id: 'crowd_noise_8',
    filename: 'crowd_noise_track_8.mp3',
    category: 'crowd_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/crowd_noise_track_8.mp3`,
  },

  // ==================== 优先级 2：traffic_noise 系列====================
  {
    id: 'traffic_noise_1',
    filename: 'traffic_noise_track_1.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_1.mp3`,
  },
  {
    id: 'traffic_noise_2',
    filename: 'traffic_noise_track_2.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_2.mp3`,
  },
  {
    id: 'traffic_noise_3',
    filename: 'traffic_noise_track_3.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_3.mp3`,
  },
  {
    id: 'traffic_noise_4',
    filename: 'traffic_noise_track_4.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_4.mp3`,
  },
  {
    id: 'traffic_noise_5',
    filename: 'traffic_noise_track_5.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_5.mp3`,
  },
  {
    id: 'traffic_noise_6',
    filename: 'traffic_noise_track_6.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_6.mp3`,
  },
  {
    id: 'traffic_noise_7',
    filename: 'traffic_noise_track_7.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_7.mp3`,
  },
  {
    id: 'traffic_noise_8',
    filename: 'traffic_noise_track_8.mp3',
    category: 'traffic_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/traffic_noise_track_8.mp3`,
  },

  // ==================== 优先级 2：wind_noise 系列====================
  {
    id: 'wind_noise_1',
    filename: 'wind_noise_track_1.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_1.mp3`,
  },
  {
    id: 'wind_noise_2',
    filename: 'wind_noise_track_2.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_2.mp3`,
  },
  {
    id: 'wind_noise_3',
    filename: 'wind_noise_track_3.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_3.mp3`,
  },
  {
    id: 'wind_noise_4',
    filename: 'wind_noise_track_4.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_4.mp3`,
  },
  {
    id: 'wind_noise_5',
    filename: 'wind_noise_track_5.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_5.mp3`,
  },
  {
    id: 'wind_noise_6',
    filename: 'wind_noise_track_6.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_6.mp3`,
  },
  {
    id: 'wind_noise_7',
    filename: 'wind_noise_track_7.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_7.mp3`,
  },
  {
    id: 'wind_noise_8',
    filename: 'wind_noise_track_8.mp3',
    category: 'wind_noise',
    priority: 2,
    remoteUrl: `${GITHUB_BASE_URL}/${NOISE_REDUCTION_PATH}/wind_noise_track_8.mp3`,
  },
];

// 8 张场景背景图资源配置（西方教会 5 张 + 东方禅意 3 张）
export const SCENE_BACKGROUND_RESOURCES: AudioResource[] = [
  // 西方教会场景背景图（jsDelivr CDN）
  {
    id: 'bg_western_church_candlelight',
    filename: 'western_church_candlelight.webp',
    category: 'scene_backgrounds',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/western_church_candlelight.webp`,
  },
  {
    id: 'bg_western_church_sunlight_monastery',
    filename: 'western_church_sunlight_monastery.webp',
    category: 'scene_backgrounds',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/western_church_sunlight_monastery.webp`,
  },
  {
    id: 'bg_western_church_light_rays',
    filename: 'western_church_light_rays.webp',
    category: 'scene_backgrounds',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/western_church_light_rays.webp`,
  },
  {
    id: 'bg_western_church_corridor',
    filename: 'western_church_corridor.webp',
    category: 'scene_backgrounds',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/western_church_corridor.webp`,
  },
  // 东方禅意场景背景图
  {
    id: 'bg_zen_temple_lantern_gate',
    filename: 'bg_temple_lantern_gate.webp',
    category: 'scene_backgrounds/zen',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/zen/bg_temple_lantern_gate.webp`,
  },
  {
    id: 'bg_zen_temple_zen_lantern',
    filename: 'bg_temple_zen_lantern.webp',
    category: 'scene_backgrounds/zen',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/zen/bg_temple_zen_lantern.webp`,
  },
  {
    id: 'bg_zen_temple_roof',
    filename: 'bg_temple_roof.webp',
    category: 'scene_backgrounds/zen',
    priority: 1,
    remoteUrl: `${GITHUB_BASE_URL}/zen/bg_temple_roof.webp`,
  },
];

/**
 * 按优先级排序的资源列表
 * 优先级 1 的资源排在前面，优先下载
 */
export const SORTED_RESOURCES = [...NOISE_REDUCTION_RESOURCES, ...SCENE_BACKGROUND_RESOURCES].sort((a, b) => {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.id.localeCompare(b.id);
});

/**
 * 获取资源映射表（按 ID 索引）
 * 【修复】包含降噪资源和场景背景图，确保 getLocalPath() 能找到所有资源
 */
export const RESOURCE_MAP: Record<string, AudioResource> = 
  [...NOISE_REDUCTION_RESOURCES, ...SCENE_BACKGROUND_RESOURCES].reduce((acc, resource) => {
    acc[resource.id] = resource;
    return acc;
  }, {} as Record<string, AudioResource>);
