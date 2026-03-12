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
  { id: 'nature_ocean', filename: 'base/deep_ocean_abyss.m4a', category: 'nature', title: 'scenes.nature_ocean.title', description: 'scenes.nature_ocean.desc', size: 1429191 }, 
  { id: 'nature_forest', filename: 'base/foggy_forest_ritual.m4a', category: 'nature', title: 'scenes.nature_forest.title', description: 'scenes.nature_forest.desc', size: 1732906 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea_breathing_rhythm.m4a', category: 'nature', title: 'scenes.nature_deep_sea.title', description: 'scenes.nature_deep_sea.desc', size: 456030 },
  { id: 'nature_misty_forest', filename: 'base/misty_woods_dripping.m4a', category: 'nature', title: 'scenes.nature_misty_forest.title', description: 'scenes.nature_misty_forest.desc', size: 680336 },
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: 'scenes.nature_river.title', description: 'scenes.nature_river.desc', size: 7201196 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: 'scenes.nature_night.title', description: 'scenes.nature_night.desc', size: 7201196 },

  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: 'scenes.life_rain_boat.title', description: 'scenes.life_rain_boat.desc', size: 7201196 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: 'scenes.life_bookstore.title', description: 'scenes.life_bookstore.desc', size: 907157 }, 

  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: 'scenes.healing_zen_bowl.title', description: 'scenes.healing_zen_bowl.desc', size: 391549 }, 
  { id: 'healing_clean_space', filename: 'base/liquid_peace.m4a', category: 'healing', title: 'scenes.healing_clean_space.title', description: 'scenes.healing_clean_space.desc', size: 4574599 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: 'scenes.healing_crystal.title', description: 'scenes.healing_crystal.desc', size: 5242880 }, 

  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'scenes.brainwave_alpha.title', description: 'scenes.brainwave_alpha.desc', size: 3095272 }, 
  { id: 'brainwave_delta', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: 'scenes.brainwave_delta.title', description: 'scenes.brainwave_delta.desc', size: 3840754 }, 

  { id: 'interactive_white_noise', filename: AMBIENT_RESOURCES.WHITE_NOISE, category: 'interactive', title: 'scenes.interactive_white_noise.title', description: 'scenes.interactive_white_noise.desc', size: 69881 }, 
  { id: 'interactive_wind_chime', filename: AMBIENT_RESOURCES.WIND_CHIME, category: 'interactive', title: 'scenes.interactive_wind_chime.title', description: 'scenes.interactive_wind_chime.desc', size: 256806 }, 
  { id: 'interactive_breath', filename: AMBIENT_RESOURCES.BREATH, category: 'interactive', title: 'scenes.interactive_breath.title', description: 'scenes.interactive_breath.desc', size: 1048576 }, 
  { id: 'interactive_apple', filename: AMBIENT_RESOURCES.APPLE_CRUNCH, category: 'interactive', title: 'scenes.interactive_apple.title', description: 'scenes.interactive_apple.desc', size: 32853 }, 
  { id: 'interactive_match', filename: AMBIENT_RESOURCES.MATCH_STRIKE, category: 'interactive', title: 'scenes.interactive_match.title', description: 'scenes.interactive_match.desc', size: 846284 },
]; 

// 【核心】定义 ASSET_LIST，手动写好每个文件的 expectedSize（根据实际下载大小更新）
export const ASSET_LIST = [
  { id: 'nature_ocean', expectedSize: 1429191 },        // 实际：1.43MB
  { id: 'nature_forest', expectedSize: 1732906 },       // 实际：1.73MB
  { id: 'nature_deep_sea', expectedSize: 456030 },      // 实际：456KB
  { id: 'nature_misty_forest', expectedSize: 680336 },  // 实际：680KB
  { id: 'nature_river', expectedSize: 7201196 },        // 实际：7.2MB
  { id: 'nature_night', expectedSize: 7201196 },        // 实际：7.2MB
  { id: 'life_rain_boat', expectedSize: 7201196 },      // 实际：7.2MB
  { id: 'life_bookstore', expectedSize: 907157 },       // 实际：907KB
  { id: 'healing_zen_bowl', expectedSize: 391549 },    // 实际：391KB
  { id: 'healing_clean_space', expectedSize: 4574599 }, // 实际：4.57MB
  { id: 'healing_crystal', expectedSize: 5242880 },    // 保持原值
  { id: 'brainwave_alpha', expectedSize: 3095272 },     // 实际：3.09MB
  { id: 'brainwave_delta', expectedSize: 3840754 },     // 实际：3.84MB
  { id: 'interactive_white_noise', expectedSize: 69881 },  // 实际：70KB
  { id: 'interactive_wind_chime', expectedSize: 256806 },  // 实际：257KB
  { id: 'interactive_breath', expectedSize: 1048576 },     // 保持原值
  { id: 'interactive_apple', expectedSize: 32853 },        // 实际：33KB
  { id: 'interactive_match', expectedSize: 846284 },       // 实际：846KB
];

// 【核心】计算 GLOBAL_TOTAL_SIZE（算出来的，但不可篡改）
export const GLOBAL_TOTAL_SIZE = ASSET_LIST.reduce((sum, asset) => sum + asset.expectedSize, 0);
export const GLOBAL_TOTAL_SIZE_MB = GLOBAL_TOTAL_SIZE / 1024 / 1024;

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 国内渠道：腾讯云主源 + Gitee备源
  // 海外渠道：ghproxy.net 加速镜像 → mirror.ghproxy.com → GitHub官方 → 腾讯云备源
  if (isGooglePlay) {
    // Google渠道：ghproxy.net 加速镜像（主源）→ mirror.ghproxy.com → GitHub官方 → 腾讯云备源
    const MIRROR_URL = 'https://ghproxy.net/';
    const MIRROR_URL_2 = 'https://mirror.ghproxy.com/';
    console.log(`[DownloadService] Google渠道配置双加速源: A= \`${MIRROR_URL}\`, B= \`${MIRROR_URL_2}\``);
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

export const getDownloadUrl = (id: string) => {
  const asset = AUDIO_MANIFEST.find(item => item.id === id);
  if (!asset) {
    console.error(`[audioAssets] Asset not found: ${id}`);
    return [];
  }
  return getDownloadUrlByChannel(IS_GOOGLE_PLAY_VERSION, asset.filename);
};
