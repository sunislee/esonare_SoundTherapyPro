import { Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

// 1. 远程资源地址 
export const REMOTE_RESOURCE_BASE_URL = 'https://gitee.com/sunislee/sound-therapy-assets/raw/master/'; 

// 2. 本地存储路径 
export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

// 3. 路径获取函数 (iOS 必须加 file:// 前缀) 
export const getLocalPath = (category: string, filename: string) => { 
    const rawPath = `${LOCAL_RESOURCE_PATH}/${filename}`; 
    return Platform.OS === 'ios' ? `file://${rawPath}` : rawPath; 
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
  { id: 'life_fireplace', filename: 'base/fireplace.m4a', category: 'life', title: '炉火', description: '温暖的冬夜', size: 4194304 }, 
  { id: 'life_summer', filename: 'base/summer_fireworks.m4a', category: 'life', title: '夏日烟火', description: '灿烂瞬间', size: 5242880 }, 
  { id: 'life_fire_pure', filename: 'base/fire.mp3', category: 'life', title: '篝火', description: '野外露营', size: 4194304 }, 

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
  { id: 'interactive_apple', filename: 'interactive/apple_crunch.m4a', category: 'interactive', title: '嚼苹果', description: '解压音效', size: 524288 }, 
  { id: 'interactive_match', filename: 'interactive/match_strike.wav', category: 'interactive', title: '划火柴', description: '触发音', size: 524288 }, 
]; 
