import { Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

export const IS_GOOGLE_PLAY_VERSION = true;

const GITEE_URL = 'https://gitee.com/sunislee/sound-therapy-assets/raw/master/';
const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';

export const REMOTE_RESOURCE_BASE_URL = IS_GOOGLE_PLAY_VERSION ? GITHUB_URL : GITEE_URL;

export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

export const getLocalPath = (category: string, filename: string) => { 
    const rawPath = `${LOCAL_RESOURCE_PATH}/${filename}`; 
    return Platform.OS === 'ios' ? `file://${rawPath}` : rawPath; 
}; 

// 静态资源映射表 - 1.0.2 版本已全面切换为远端加载，不再引用本地 assets/audio
export const AUDIO_MAP: Record<string, any> = {};

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
  { id: 'nature_ocean', filename: 'base/ocean.mp3', category: 'nature', title: 'scenes.nature_ocean.title', description: 'scenes.nature_ocean.desc', size: 5242880 }, 
  { id: 'nature_forest', filename: 'base/forest.mp3', category: 'nature', title: 'scenes.nature_forest.title', description: 'scenes.nature_forest.desc', size: 4194304 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea.mp3', category: 'nature', title: 'scenes.nature_deep_sea.title', description: 'scenes.nature_deep_sea.desc', size: 5242880 },
  { id: 'nature_misty_forest', filename: 'base/forest.mp3', category: 'nature', title: 'scenes.nature_misty_forest.title', description: 'scenes.nature_misty_forest.desc', size: 4194304 },
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
  { id: 'interactive_rain', filename: AMBIENT_RESOURCES.RAIN, category: 'interactive', title: 'scenes.interactive_rain.title', description: 'scenes.interactive_rain.desc', size: 4194304 },
  { id: 'interactive_ocean', filename: AMBIENT_RESOURCES.OCEAN, category: 'interactive', title: 'scenes.interactive_ocean.title', description: 'scenes.interactive_ocean.desc', size: 5242880 },
]; 
