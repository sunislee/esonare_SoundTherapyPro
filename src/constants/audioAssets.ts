import { NativeModules, Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

const nativeChannel =
  Platform.OS === 'android' && NativeModules?.CrashReport?.getChannel
    ? NativeModules.CrashReport.getChannel()
    : null;

export const IS_GOOGLE_PLAY_VERSION = nativeChannel ? nativeChannel === 'googlePlay' : true;

const TENCENT_CLOUD_URL = 'https://43.138.58.71/';
const GITEE_URL = 'https://gitee.com/sunislee/sound-therapy-assets/raw/master/';
const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';

// 国内渠道：腾讯云主源 + Gitee备源（更稳定）
// 海外渠道：GitHub主源 + 腾讯云备源
export const PRIMARY_REMOTE_RESOURCE_BASE_URL = IS_GOOGLE_PLAY_VERSION ? GITHUB_URL : TENCENT_CLOUD_URL;
export const SECONDARY_REMOTE_RESOURCE_BASE_URL = IS_GOOGLE_PLAY_VERSION ? TENCENT_CLOUD_URL : GITEE_URL;
export const REMOTE_RESOURCE_BASE_URL = PRIMARY_REMOTE_RESOURCE_BASE_URL;

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
  { id: 'nature_ocean', filename: 'base/deep_ocean_abyss.m4a', category: 'nature', title: 'scenes.nature_ocean.title', description: 'scenes.nature_ocean.desc', size: 5242880 }, 
  { id: 'nature_forest', filename: 'base/foggy_forest_ritual.m4a', category: 'nature', title: 'scenes.nature_forest.title', description: 'scenes.nature_forest.desc', size: 4194304 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea_breathing_rhythm.m4a', category: 'nature', title: 'scenes.nature_deep_sea.title', description: 'scenes.nature_deep_sea.desc', size: 5242880 },
  { id: 'nature_misty_forest', filename: 'base/misty_woods_dripping.m4a', category: 'nature', title: 'scenes.nature_misty_forest.title', description: 'scenes.nature_misty_forest.desc', size: 4194304 },
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: 'scenes.nature_river.title', description: 'scenes.nature_river.desc', size: 4194304 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: 'scenes.nature_night.title', description: 'scenes.nature_night.desc', size: 4194304 },

  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: 'scenes.life_rain_boat.title', description: 'scenes.life_rain_boat.desc', size: 4194304 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: 'scenes.life_bookstore.title', description: 'scenes.life_bookstore.desc', size: 3145728 }, 

  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: 'scenes.healing_zen_bowl.title', description: 'scenes.healing_zen_bowl.desc', size: 2097152 }, 
  { id: 'healing_clean_space', filename: 'base/liquid_peace.m4a', category: 'healing', title: 'scenes.healing_clean_space.title', description: 'scenes.healing_clean_space.desc', size: 4194304 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: 'scenes.healing_crystal.title', description: 'scenes.healing_crystal.desc', size: 5242880 }, 

  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'scenes.brainwave_alpha.title', description: 'scenes.brainwave_alpha.desc', size: 3145728 }, 
  { id: 'brainwave_delta', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: 'scenes.brainwave_delta.title', description: 'scenes.brainwave_delta.desc', size: 3145728 }, 

  { id: 'interactive_white_noise', filename: AMBIENT_RESOURCES.WHITE_NOISE, category: 'interactive', title: 'scenes.interactive_white_noise.title', description: 'scenes.interactive_white_noise.desc', size: 1048576 }, 
  { id: 'interactive_wind_chime', filename: AMBIENT_RESOURCES.WIND_CHIME, category: 'interactive', title: 'scenes.interactive_wind_chime.title', description: 'scenes.interactive_wind_chime.desc', size: 1048576 }, 
  { id: 'interactive_breath', filename: AMBIENT_RESOURCES.BREATH, category: 'interactive', title: 'scenes.interactive_breath.title', description: 'scenes.interactive_breath.desc', size: 1048576 }, 
  { id: 'interactive_apple', filename: AMBIENT_RESOURCES.APPLE_CRUNCH, category: 'interactive', title: 'scenes.interactive_apple.title', description: 'scenes.interactive_apple.desc', size: 524288 }, 
  { id: 'interactive_match', filename: AMBIENT_RESOURCES.MATCH_STRIKE, category: 'interactive', title: 'scenes.interactive_match.title', description: 'scenes.interactive_match.desc', size: 524288 },
]; 

// 【核心】定义 ASSET_LIST，手动写好每个文件的 expectedSize（不可篡改的基准）
export const ASSET_LIST = [
  { id: 'nature_ocean', expectedSize: 5242880 },
  { id: 'nature_forest', expectedSize: 4194304 },
  { id: 'nature_deep_sea', expectedSize: 5242880 },
  { id: 'nature_misty_forest', expectedSize: 4194304 },
  { id: 'nature_river', expectedSize: 4194304 },
  { id: 'nature_night', expectedSize: 4194304 },
  { id: 'life_rain_boat', expectedSize: 4194304 },
  { id: 'life_bookstore', expectedSize: 3145728 },
  { id: 'healing_zen_bowl', expectedSize: 2097152 },
  { id: 'healing_clean_space', expectedSize: 4194304 },
  { id: 'healing_crystal', expectedSize: 5242880 },
  { id: 'brainwave_alpha', expectedSize: 3145728 },
  { id: 'brainwave_delta', expectedSize: 3145728 },
  { id: 'interactive_white_noise', expectedSize: 1048576 },
  { id: 'interactive_wind_chime', expectedSize: 1048576 },
  { id: 'interactive_breath', expectedSize: 1048576 },
  { id: 'interactive_apple', expectedSize: 524288 },
  { id: 'interactive_match', expectedSize: 524288 },
];

// 【核心】计算 GLOBAL_TOTAL_SIZE（算出来的，但不可篡改）
export const GLOBAL_TOTAL_SIZE = ASSET_LIST.reduce((sum, asset) => sum + asset.expectedSize, 0); // 56,623,104 bytes
export const GLOBAL_TOTAL_SIZE_MB = GLOBAL_TOTAL_SIZE / 1024 / 1024; // 54.00MB

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 国内渠道：腾讯云主源 + Gitee备源
  // 海外渠道：ghproxy.net 加速镜像 → mirror.ghproxy.com → GitHub官方 → 腾讯云备源
  if (isGooglePlay) {
    // Google渠道：ghproxy.net 加速镜像（主源）→ mirror.ghproxy.com → GitHub官方 → 腾讯云备源
    const MIRROR_URL = 'https://ghproxy.net/';
    const MIRROR_URL_2 = 'https://mirror.ghproxy.com/';
    console.error(`[DownloadService] Google渠道配置双加速源: A= \`${MIRROR_URL}\`, B= \`${MIRROR_URL_2}\``);
    return [
      `${MIRROR_URL}${GITHUB_URL}${filename}`,    // ghproxy.net 加速镜像（主源）
      `${MIRROR_URL_2}${GITHUB_URL}${filename}`,  // mirror.ghproxy.com（备源）
      `${GITHUB_URL}${filename}`,                  // GitHub官方
      `${TENCENT_CLOUD_URL}${filename}`            // 腾讯云备源
    ];
  }
  // 国内渠道
  return [
    `${TENCENT_CLOUD_URL}${filename}`,
    `${GITEE_URL}${filename}`
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
