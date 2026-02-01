import { Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

// 0. 版本开关
export const IS_GOOGLE_PLAY_VERSION = true;

// 1. 远程资源地址 
const GITEE_URL = 'https://gitee.com/sunislee/sound-therapy-assets/raw/master/';
const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';

export const REMOTE_RESOURCE_BASE_URL = IS_GOOGLE_PLAY_VERSION ? GITHUB_URL : GITEE_URL;

// 2. 本地存储路径 
export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

// 3. 路径获取函数 (iOS 必须加 file:// 前缀) 
export const getLocalPath = (category: string, filename: string) => { 
    const rawPath = `${LOCAL_RESOURCE_PATH}/${filename}`; 
    return Platform.OS === 'ios' ? `file://${rawPath}` : rawPath; 
}; 

// 5. 氛围音常量 (用于代码内引用)
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

// 4. 音频清单 (最终修正版 - 严格对齐分类与场景属性) 
export const AUDIO_MANIFEST = [ 
  // ========================= 
  // Tab 1: 自然 (Nature) 
  // ========================= 
  { id: 'nature_ocean', filename: 'base/ocean.mp3', category: 'nature', title: '深海', description: '深蓝色的宁静', size: 5242880 }, 
  { id: 'nature_forest', filename: 'base/forest.mp3', category: 'nature', title: '迷雾森林', description: '林间漫步', size: 4194304 }, 
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: '晨间河畔', description: '清泉石上流', size: 4194304 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: '静谧部落', description: '远古的呼唤', size: 4194304 }, 

  // ========================= 
  // Tab 2: 生活 (Life) 
  // ========================= 
  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: '舟上雨', description: '微雨落孤舟', size: 4194304 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: '午后书店', description: '纸张与宁静', size: 3145728 }, 
  { id: 'life_fireplace', filename: AMBIENT_RESOURCES.FIREPLACE, category: 'life', title: '炉火', description: '温暖的冬夜', size: 4194304 }, 
  { id: 'life_summer', filename: AMBIENT_RESOURCES.SUMMER_NIGHT, category: 'life', title: '夏日烟火', description: '灿烂瞬间', size: 5242880 }, 

  // ========================= 
  // Tab 3: 疗愈 (Healing) 
  // ========================= 
  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: '颂钵冥想', description: '瞬间定静', size: 2097152 }, 
  { id: 'healing_clean_space', filename: 'base/liquid_peace.m4a', category: 'healing', title: '洁净空间', description: '如水般流动', size: 4194304 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: '水晶钵', description: '高频能量共振', size: 5242880 }, 

  // ========================= 
  // Tab 4: 脑波 (Brainwave) 
  // ========================= 
  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'Alpha专注', description: '专注与放松', size: 3145728 }, 
  { id: 'brainwave_delta', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: 'Delta入眠', description: '左右脑同步', size: 3145728 }, 

  // ========================= 
  // 交互音效 (Interactive) 
  // ========================= 
  { id: 'interactive_white_noise', filename: AMBIENT_RESOURCES.WHITE_NOISE, category: 'interactive', title: '白噪音', description: '深层专注', size: 1048576 }, 
  { id: 'interactive_wind_chime', filename: AMBIENT_RESOURCES.WIND_CHIME, category: 'interactive', title: '风铃', description: '空灵之声', size: 1048576 }, 
  { id: 'interactive_breath', filename: AMBIENT_RESOURCES.BREATH, category: 'interactive', title: '呼吸', description: '正念引导', size: 1048576 }, 
  { id: 'interactive_apple', filename: AMBIENT_RESOURCES.APPLE_CRUNCH, category: 'interactive', title: '嚼苹果', description: '解压音效', size: 524288 }, 
  { id: 'interactive_match', filename: AMBIENT_RESOURCES.MATCH_STRIKE, category: 'interactive', title: '划火柴', description: '触发音', size: 524288 }, 
  { id: 'interactive_rain', filename: AMBIENT_RESOURCES.RAIN, category: 'interactive', title: '听雨', description: '雨落窗前', size: 4194304 },
  { id: 'interactive_ocean', filename: AMBIENT_RESOURCES.OCEAN, category: 'interactive', title: '观海', description: '海浪声声', size: 5242880 },
]; 
