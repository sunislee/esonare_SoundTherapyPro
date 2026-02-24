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

export const DEFAULT_FALLBACK_SOURCE = require('../../android/app/src/main/res/raw/src_assets_audio_base_forest.mp3');

const BUILT_IN_FALLBACK_FILENAMES = [
  'interactive/match_strike.wav',
  'interactive/apple_crunch.m4a',
  'interactive/wind-chime.m4a',
  'interactive/breath.m4a',
  'base/summer_fireworks.m4a',
  'base/final_healing_rain.m4a',
  'base/ocean.mp3',
  'base/fire.mp3',
];

export const AUDIO_MAP: Record<string, any> = BUILT_IN_FALLBACK_FILENAMES.reduce(
  (acc, filename) => {
    acc[filename] = DEFAULT_FALLBACK_SOURCE;
    return acc;
  },
  {} as Record<string, any>
);

export const AMBIENT_RESOURCES = {
  WHITE_NOISE: 'interactive/white_noise.m4a',
  WIND_CHIME: 'interactive/wind-chime.m4a',
  BREATH: 'interactive/breath.m4a',
  APPLE_CRUNCH: 'interactive/apple_crunch.m4a',
  MATCH_STRIKE: 'interactive/match_strike.wav',
  FIREPLACE: 'base/fire.mp3',
  SUMMER_NIGHT: 'base/summer_fireworks.m4a',
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
  { id: 'life_fireplace', filename: AMBIENT_RESOURCES.FIREPLACE, category: 'life', title: 'scenes.life_fireplace.title', description: 'scenes.life_fireplace.desc', size: 4194304 }, 
  { id: 'life_summer', filename: AMBIENT_RESOURCES.SUMMER_NIGHT, category: 'life', title: 'scenes.life_summer.title', description: 'scenes.life_summer.desc', size: 5242880 }, 

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

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 国内渠道：腾讯云主源 + Gitee备源
  // 海外渠道：GitHub主源 + 腾讯云备源
  const primary = isGooglePlay ? GITHUB_URL : TENCENT_CLOUD_URL;
  const secondary = isGooglePlay ? TENCENT_CLOUD_URL : GITEE_URL;
  return [primary, secondary].map(base => `${base}${filename}`);
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
