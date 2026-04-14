/**
 * 场景 LFO 配置矩阵
 * 
 * 为心声冥想全场景（14 个）提供配置化的 LFO 引擎参数
 * 按场景组分类管理，支持快速扩展和维护
 */

import { LFOConfig } from '../hooks/useLFO';

/**
 * LFO 效果类型枚举
 */
export enum LFOEffectType {
  /** 音量调制 */
  VOLUME = 'volume',
  /** 空间平移 */
  PANNING = 'panning',
  /** 低通滤波 */
  LOWPASS_FILTER = 'lowpass_filter',
}

/**
 * LFO 回调函数类型
 */
export type LFOPresetName = 
  | 'deepSeaBreath'        // 深海呼吸
  | 'boatRainPanning'      // 舟上雨 - 空间平移
  | 'bookstoreFocus'       // 午后书店 - 空间聚焦
  | 'forestBreathing'      // 森林组 - 呼吸
  | 'zenVibration'         // 禅意组 - 共振
  | 'riverFlow'            // 流水组 - 流动
  | 'brainwaveSync'        // 脑波组 - 同步
  | 'none';                // 无 LFO 效果

/**
 * 场景 LFO 配置接口
 */
export interface SceneLFOConfig {
  /** 场景 ID */
  sceneId: string;
  /** LFO 预设名称 */
  preset: LFOPresetName;
  /** 效果类型数组 */
  effects: LFOEffectType[];
  /** 基础音量（0-1） */
  baseVolume?: number;
  /** 音量波动幅度（±百分比） */
  volumeFluctuation?: number;
  /** 音量随机算法周期 1（毫秒） */
  randomPeriod1?: number;
  /** 音量随机算法周期 2（毫秒） */
  randomPeriod2?: number;
  /** Pan 范围（±值） */
  panRange?: number;
  /** 低通滤波频率（Hz） */
  filterFrequency?: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 场景 LFO 配置矩阵（14 个场景）
 */
export const SCENE_LFO_CONFIGS: Record<string, SceneLFOConfig> = {
  // ==================== 深海组 ====================
  /** 深海呼吸 */
  'nature_deep_sea': {
    sceneId: 'nature_deep_sea',
    preset: 'deepSeaBreath',
    effects: [LFOEffectType.VOLUME],
    baseVolume: 1.0,
    volumeFluctuation: 0.35, // ±35% (0.65-1.0)
    randomPeriod1: 5000,
    randomPeriod2: 7000,
    enabled: true,
  },

  // ==================== 舟上雨组 ====================
  /** 舟上雨 */
  'scene_boat_rain': {
    sceneId: 'scene_boat_rain',
    preset: 'boatRainPanning',
    effects: [LFOEffectType.PANNING, LFOEffectType.VOLUME],
    baseVolume: 0.8,
    volumeFluctuation: 0.05, // ±5%
    randomPeriod1: 5000,
    randomPeriod2: 7000,
    panRange: 0.25,
    enabled: true,
  },

  // ==================== 书店组 ====================
  /** 午后书店 */
  'scene_bookstore': {
    sceneId: 'scene_bookstore',
    preset: 'bookstoreFocus',
    effects: [LFOEffectType.PANNING, LFOEffectType.VOLUME],
    baseVolume: 0.7,
    volumeFluctuation: 0.03, // ±3%
    randomPeriod1: 8000,
    randomPeriod2: 11000,
    panRange: 0.15,
    enabled: true,
  },

  // ==================== 森林组 ====================
  /** 迷雾森林 */
  'scene_misty_forest': {
    sceneId: 'scene_misty_forest',
    preset: 'forestBreathing',
    effects: [LFOEffectType.VOLUME, LFOEffectType.LOWPASS_FILTER],
    baseVolume: 0.7,
    volumeFluctuation: 0.08, // ±8%
    randomPeriod1: 6000,
    randomPeriod2: 9000,
    filterFrequency: 800, // 低通滤波，模拟雾气吸声
    enabled: true,
  },

  /** 林间迷雾 */
  'scene_forest_mist': {
    sceneId: 'scene_forest_mist',
    preset: 'forestBreathing',
    effects: [LFOEffectType.VOLUME, LFOEffectType.LOWPASS_FILTER],
    baseVolume: 0.7,
    volumeFluctuation: 0.08, // ±8%
    randomPeriod1: 6000,
    randomPeriod2: 9000,
    filterFrequency: 900,
    enabled: true,
  },

  // ==================== 禅意组 ====================
  /** 颂钵冥想 */
  'scene_singing_bowl': {
    sceneId: 'scene_singing_bowl',
    preset: 'zenVibration',
    effects: [LFOEffectType.VOLUME, LFOEffectType.PANNING],
    baseVolume: 0.75,
    volumeFluctuation: 0.02, // ±2%
    randomPeriod1: 10000,
    randomPeriod2: 15000,
    panRange: 0.05, // ±0.05 极小范围
    enabled: true,
  },

  /** 水晶钵 */
  'scene_crystal_bowl': {
    sceneId: 'scene_crystal_bowl',
    preset: 'zenVibration',
    effects: [LFOEffectType.VOLUME, LFOEffectType.PANNING],
    baseVolume: 0.75,
    volumeFluctuation: 0.02, // ±2%
    randomPeriod1: 10000,
    randomPeriod2: 15000,
    panRange: 0.05,
    enabled: true,
  },

  /** 洁净空间 */
  'scene_clean_space': {
    sceneId: 'scene_clean_space',
    preset: 'zenVibration',
    effects: [LFOEffectType.VOLUME, LFOEffectType.PANNING],
    baseVolume: 0.75,
    volumeFluctuation: 0.02, // ±2%
    randomPeriod1: 10000,
    randomPeriod2: 15000,
    panRange: 0.05,
    enabled: true,
  },

  // ==================== 流水组 ====================
  /** 晨间河畔 */
  'scene_morning_river': {
    sceneId: 'scene_morning_river',
    preset: 'riverFlow',
    effects: [LFOEffectType.VOLUME],
    baseVolume: 0.75,
    volumeFluctuation: 0.06, // ±6%
    randomPeriod1: 4000,
    randomPeriod2: 6000,
    enabled: true,
  },

  /** 静谧部落 */
  'scene_quiet_tribe': {
    sceneId: 'scene_quiet_tribe',
    preset: 'riverFlow',
    effects: [LFOEffectType.VOLUME],
    baseVolume: 0.75,
    volumeFluctuation: 0.06, // ±6%
    randomPeriod1: 4000,
    randomPeriod2: 6000,
    enabled: true,
  },

  // ==================== 脑波组 ====================
  /** Alpha 专注 */
  'brainwave_alpha': {
    sceneId: 'brainwave_alpha',
    preset: 'brainwaveSync',
    effects: [LFOEffectType.PANNING],
    baseVolume: 0.8,
    volumeFluctuation: 0.01, // ±1% 几乎静止
    randomPeriod1: 30000,
    randomPeriod2: 45000,
    panRange: 0.1, // 极慢漂移
    enabled: true,
  },

  /** Delta 入眠 */
  'brainwave_delta': {
    sceneId: 'brainwave_delta',
    preset: 'brainwaveSync',
    effects: [LFOEffectType.PANNING],
    baseVolume: 0.8,
    volumeFluctuation: 0.01, // ±1%
    randomPeriod1: 30000,
    randomPeriod2: 45000,
    panRange: 0.1,
    enabled: true,
  },

  // ==================== 其他场景（暂不启用 LFO） ====================
  /** 雨夜 */
  'scene_rainy_night': {
    sceneId: 'scene_rainy_night',
    preset: 'none',
    effects: [],
    enabled: false,
  },

  /** 自定义场景 */
  'scene_custom': {
    sceneId: 'scene_custom',
    preset: 'none',
    effects: [],
    enabled: false,
  },
};

/**
 * 获取场景 LFO 配置
 * @param sceneId 场景 ID
 * @returns 场景 LFO 配置
 */
export const getSceneLFOConfig = (sceneId: string): SceneLFOConfig => {
  return SCENE_LFO_CONFIGS[sceneId] || {
    sceneId,
    preset: 'none',
    effects: [],
    enabled: false,
  };
};

/**
 * 检查场景是否启用 LFO
 * @param sceneId 场景 ID
 * @returns 是否启用
 */
export const isLFOEnabled = (sceneId: string): boolean => {
  const config = SCENE_LFO_CONFIGS[sceneId];
  return config?.enabled || false;
};

/**
 * 检查场景是否启用特定效果
 * @param sceneId 场景 ID
 * @param effectType 效果类型
 * @returns 是否启用
 */
export const isEffectEnabled = (sceneId: string, effectType: LFOEffectType): boolean => {
  const config = SCENE_LFO_CONFIGS[sceneId];
  return config?.effects.includes(effectType) || false;
};
