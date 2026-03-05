import { NativeModules, Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

const nativeChannel =
  Platform.OS === 'android' && NativeModules?.CrashReport?.getChannel
    ? NativeModules.CrashReport.getChannel()
    : null;

export const IS_GOOGLE_PLAY_VERSION = nativeChannel ? nativeChannel === 'googlePlay' : true;

// 强制所有渠道使用腾讯云 - 但保留 GitHub 作为保底
const TENCENT_CLOUD_URL = 'http://43.138.58.71/resources/';
const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';

// 主源使用腾讯云，备源使用 GitHub
export const PRIMARY_REMOTE_RESOURCE_BASE_URL = TENCENT_CLOUD_URL;
export const SECONDARY_REMOTE_RESOURCE_BASE_URL = GITHUB_URL;
export const REMOTE_RESOURCE_BASE_URL = TENCENT_CLOUD_URL;

// 腾讯云专供常量 - 硬编码地址
export const RESOURCE_SERVER_URL = TENCENT_CLOUD_URL;

export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

export const getLocalPath = (category: string, filename: string) => { 
    const rawPath = `${LOCAL_RESOURCE_PATH}/${filename}`; 
    return Platform.OS === 'ios' ? `file://${rawPath}` : rawPath; 
}; 

export const DEFAULT_FALLBACK_SOURCE = null;
export const AUDIO_MAP: Record<string, any> = {};

export const AMBIENT_RESOURCES = {
  WHITE_NOISE: 'interactive/white_noise.m4a',
  WIND_CHIME: 'interactive/wind-chime.m4a',
  BREATH: 'interactive/breath.m4a',
  APPLE_CRUNCH: 'interactive/apple_crunch.m4a',
  MATCH_STRIKE: 'interactive/match_strike.wav',

  RAIN: 'base/final_healing_rain.m4a',
  OCEAN: 'base/ocean.mp3',
};

export const AUDIO_MANIFEST = [ 
  { id: 'nature_ocean', filename: 'base/deep_ocean_abyss.m4a', category: 'nature', title: '深海', description: '深海冥想', size: 1429191 }, 
  { id: 'nature_forest', filename: 'base/foggy_forest_ritual.m4a', category: 'nature', title: '森林', description: '森林冥想', size: 1732906 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea_breathing_rhythm.m4a', category: 'nature', title: '深海呼吸', description: '深海呼吸冥想', size: 5242880 },
  { id: 'nature_misty_forest', filename: 'base/misty_woods_dripping.m4a', category: 'nature', title: '迷雾森林', description: '迷雾森林冥想', size: 680336 },
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: '河流', description: '河流冥想', size: 3614091 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: '夜晚', description: '夜晚冥想', size: 7201196 },

  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: '雨声', description: '雨声冥想', size: 7201196 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: '书店', description: '书店冥想', size: 3145728 }, 

  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: '禅碗', description: '禅碗冥想', size: 2097152 }, 
  { id: 'healing_clean_space', filename: 'base/liquid_peace.m4a', category: 'healing', title: '净化空间', description: '净化空间冥想', size: 4574599 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: '水晶', description: '水晶冥想', size: 5242880 }, 

  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'α波', description: 'α波冥想', size: 3145728 }, 
  { id: 'brainwave_delta', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: 'δ波', description: 'δ波冥想', size: 3840754 }, 

  { id: 'interactive_white_noise', filename: AMBIENT_RESOURCES.WHITE_NOISE, category: 'interactive', title: '白噪音', description: '白噪音', size: 69881 }, 
  { id: 'interactive_wind_chime', filename: AMBIENT_RESOURCES.WIND_CHIME, category: 'interactive', title: '风铃', description: '风铃', size: 256806 }, 
  { id: 'interactive_breath', filename: AMBIENT_RESOURCES.BREATH, category: 'interactive', title: '呼吸', description: '呼吸', size: 1048576 }, 
  { id: 'interactive_apple', filename: AMBIENT_RESOURCES.APPLE_CRUNCH, category: 'interactive', title: '苹果', description: '苹果', size: 32853 }, 
  { id: 'interactive_match', filename: AMBIENT_RESOURCES.MATCH_STRIKE, category: 'interactive', title: '火柴', description: '火柴', size: 846284 },
]; 

// 【核心】定义 ASSET_LIST，手动写好每个文件的 expectedSize（根据实际文件大小更新）
export const ASSET_LIST = [
  { id: 'nature_ocean', expectedSize: 1429191 },
  { id: 'nature_forest', expectedSize: 1732906 },
  { id: 'nature_deep_sea', expectedSize: 5242880 },
  { id: 'nature_misty_forest', expectedSize: 680336 },
  { id: 'nature_river', expectedSize: 3614091 },
  { id: 'nature_night', expectedSize: 7201196 },
  { id: 'life_rain_boat', expectedSize: 7201196 },
  { id: 'life_bookstore', expectedSize: 3145728 },
  { id: 'healing_zen_bowl', expectedSize: 2097152 },
  { id: 'healing_clean_space', expectedSize: 4574599 },
  { id: 'healing_crystal', expectedSize: 5242880 },
  { id: 'brainwave_alpha', expectedSize: 3145728 },
  { id: 'brainwave_delta', expectedSize: 3840754 },
  { id: 'interactive_white_noise', expectedSize: 69881 },
  { id: 'interactive_wind_chime', expectedSize: 256806 },
  { id: 'interactive_breath', expectedSize: 1048576 },
  { id: 'interactive_apple', expectedSize: 32853 },
  { id: 'interactive_match', expectedSize: 846284 },
];

// 【核心】计算 GLOBAL_TOTAL_SIZE（算出来的，但不可篡改）
export const GLOBAL_TOTAL_SIZE = ASSET_LIST.reduce((sum, asset) => sum + asset.expectedSize, 0); // 56,623,104 bytes
export const GLOBAL_TOTAL_SIZE_MB = GLOBAL_TOTAL_SIZE / 1024 / 1024; // 54.00MB

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 【临时调整】所有渠道统一优先使用腾讯云（GitHub 在国内访问慢）
  // 正式提交 Google Play 前再切换回 GitHub 主源
  console.log(`[DownloadService] 当前渠道：${isGooglePlay ? 'GooglePlay' : '国内'}，优先腾讯云`);
  return [
    `${TENCENT_CLOUD_URL}${filename}`,            // 腾讯云主源（速度快）
    `${GITHUB_URL}${filename}`                    // GitHub 备源（保底）
  ];
};

export const getDownloadUrl = (assetIdOrFilename: string) => {
  const asset = AUDIO_MANIFEST.find(a => a.id === assetIdOrFilename);
  const filename = asset ? asset.filename : assetIdOrFilename;
  return getDownloadUrlByChannel(IS_GOOGLE_PLAY_VERSION, filename);
};

export const getRemoteUrl = (filename: string) => {
  return `${PRIMARY_REMOTE_RESOURCE_BASE_URL}${filename}`;
};

export const getLocalUri = (filename: string) => {
  // 更新：指向下载后的本地存储路径
  const localPath = getLocalPath('base', filename);
  return localPath;
};
