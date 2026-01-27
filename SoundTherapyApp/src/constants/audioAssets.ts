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

// 4. 音频清单 (最终修正版) 
export const AUDIO_MANIFEST = [ 
  // ========================= 
  // Tab 1: 自然 (Nature) 
  // ========================= 
  { id: 'nature_ocean', filename: 'base/ocean.mp3', category: 'nature', title: '深海', description: '深蓝色的宁静', size: 5242880 }, 
  { id: 'nature_rain', filename: 'base/rain_boat.mp3', category: 'nature', title: '舟上雨', description: '微雨落孤舟', size: 4194304 }, 
  { id: 'nature_forest', filename: 'base/forest.mp3', category: 'nature', title: '迷雾森林', description: '林间漫步', size: 4194304 }, 
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: '晨间河流', description: '清泉石上流', size: 4194304 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: '静谧部落', description: '远古的呼唤', size: 4194304 }, 
  { id: 'nature_wolf', filename: 'fx/wolf_howl.wav', category: 'nature', title: '远山狼啸', description: '荒野之声', size: 524288 }, 
  { id: 'nature_ice', filename: 'fx/icy_rain.wav', category: 'nature', title: '冰雨', description: '极寒之境', size: 1048576 }, 
  { id: 'nature_sweden', filename: 'fx/sweden_lake.m4a', category: 'nature', title: '瑞典湖畔', description: '北欧清晨', size: 3145728 }, 

  // ========================= 
  // Tab 2: 疗愈 (Healing) 
  // ========================= 
  { id: 'healing_dream', filename: 'base/dream_drift.mp3', category: 'healing', title: '入梦漂流', description: '深度助眠引导', size: 8388608 }, 
  { id: 'healing_asmr', filename: 'base/asmr_relax.mp3', category: 'healing', title: 'ASMR 放松', description: '颅内高潮体验', size: 6291456 }, 
  { id: 'healing_dimension', filename: 'base/dimension_meditation.mp3', category: 'healing', title: '维度冥想', description: '扩展意识边界', size: 7340032 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: '水晶钵', description: '高频能量共振', size: 5242880 }, 
  { id: 'healing_liquid', filename: 'base/liquid_peace.m4a', category: 'healing', title: '液态宁静', description: '如水般流动', size: 4194304 }, 
  { id: 'healing_rain', filename: 'base/final_healing_rain.m4a', category: 'healing', title: '疗愈之雨', description: '洗涤心灵', size: 5242880 }, 
  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: '禅意颂钵', description: '瞬间定静', size: 2097152 }, 

  // ========================= 
  // Tab 3: 脑波 (Brainwave) 
  // ========================= 
  { id: 'brainwave_binaural', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: '双声拍', description: '左右脑同步', size: 3145728 }, 
  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'Alpha 波', description: '专注与放松', size: 3145728 }, 

  // ========================= 
  // Tab 4: 生活 (Life) - 纯净版 (不含苹果/火柴) 
  // ========================= 
  { id: 'life_fireplace', filename: 'base/fireplace.m4a', category: 'life', title: '炉火', description: '温暖的冬夜', size: 4194304 }, 
  { id: 'life_fire_pure', filename: 'base/fire.mp3', category: 'life', title: '篝火', description: '野外露营', size: 4194304 }, 
  { id: 'life_study', filename: 'base/study.mp3', category: 'life', title: '专注空间', description: '沉浸式学习', size: 5242880 }, 
  { id: 'life_library', filename: 'fx/library_vibe.m4a', category: 'life', title: '图书馆', description: '纸张与宁静', size: 3145728 }, 
  { id: 'life_summer', filename: 'base/summer_fireworks.m4a', category: 'life', title: '夏日烟火', description: '灿烂瞬间', size: 5242880 }, 

  // ========================= 
  // 交互音效 (Interactive) - 仅混音页使用 
  // ========================= 
  { id: 'interactive_apple', filename: 'interactive/apple_crunch.m4a', category: 'interactive', title: '嚼苹果', description: '解压音效', size: 524288 }, 
  { id: 'interactive_match', filename: 'interactive/match_strike.wav', category: 'interactive', title: '划火柴', description: '触发音', size: 524288 }, 
]; 
