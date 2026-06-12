// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import { Platform, ImageSourcePropType, Image } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { AUDIO_MANIFEST, PRIMARY_REMOTE_RESOURCE_BASE_URL, IS_GOOGLE_PLAY_VERSION, GITEE_URL, GITHUB_URL, getLocalPath as getLocalPathHelper } from './audioAssets';

// 【背景图状态缓存】在应用启动时预加载所有文件存在性状态
let backgroundAvailabilityCache: Record<string, boolean> = {};

// 【辅助函数】异步检查并缓存背景图文件是否存在（仅在应用启动时调用一次）
export const preloadBackgroundAvailability = async (): Promise<void> => {
  console.log('[scenes] 🔄 预加载背景图可用性状态...');
  
  try {
    // 检查东方禅意场景的背景图
    for (const [sceneId, bgFilename] of Object.entries(ORIENTAL_BG_MAP)) {
      const localPath = getLocalPathHelper('scene_backgrounds', `zen/${bgFilename}`);
      backgroundAvailabilityCache[localPath] = await RNFS.exists(localPath);
    }
    
    // 检查西方教会场景的背景图
    for (const [sceneId, bgFilename] of Object.entries(WESTERN_CHURCH_BG_MAP)) {
      const localPath = getLocalPathHelper('scene_backgrounds', bgFilename);
      backgroundAvailabilityCache[localPath] = await RNFS.exists(localPath);
    }
    
    console.log('[scenes] ✅ 背景图可用性预加载完成，缓存了', Object.keys(backgroundAvailabilityCache).length, '个文件状态');
  } catch (error) {
    console.warn('[scenes] ⚠️ 预加载背景图状态失败:', error);
  }
};

// 【辅助函数】检查背景图是否可用（同步查询缓存）
const isBackgroundImageAvailable = (localPath: string): boolean => {
  return backgroundAvailabilityCache[localPath] ?? false;
};

// 本地背景图存储目录（与 audioAssets.ts 中的 LOCAL_RESOURCE_PATH 一致）
const LOCAL_BG_BASE = `${RNFS.DocumentDirectoryPath}/audio_resources`;

export type SceneCategory = 'Nature' | 'Healing' | 'Brainwave' | 'Life' | 'WesternChurch' | 'Oriental';

export class Scene {
  id: string;
  title: string;
  shortName?: string;
  audioUrl: string;
  backgroundUrl: string;
  primaryColor: string;
  audioSource: string;
  audioFile: any;
  filename: string;
  baseVolume: number;
  backgroundSource: any;
  category: SceneCategory;
  isBaseScene: boolean;
  order: number;

  constructor(data: Partial<Scene>) {
    this.id = data.id || '';
    this.title = data.title || '';
    this.shortName = data.shortName;
    this.audioUrl = data.audioUrl || '';
    this.backgroundUrl = data.backgroundUrl || '';
    this.primaryColor = data.primaryColor || '#000000';
    this.audioSource = data.audioSource || '';
    this.audioFile = data.audioFile;
    this.filename = data.filename || '';
    this.baseVolume = data.baseVolume ?? 1.0;
    this.backgroundSource = data.backgroundSource ?? null;
    this.category = data.category || 'Nature';
    this.isBaseScene = data.isBaseScene ?? true;
    this.order = data.order ?? 999;
  }

  static fromJson(json: any): Scene {
    return new Scene({
      id: json.id,
      title: json.title,
      shortName: json.shortName,
      audioUrl: json.audioUrl,
      backgroundUrl: json.backgroundUrl,
      primaryColor: json.primaryColor,
      audioSource: json.audioSource,
      audioFile: json.audioFile,
      filename: json.filename,
      baseVolume: json.baseVolume,
      backgroundSource: json.backgroundSource,
      category: json.category,
      isBaseScene: json.isBaseScene,
    });
  }

  toJson(): any {
    return {
      id: this.id,
      title: this.title,
      shortName: this.shortName,
      audioUrl: this.audioUrl,
      backgroundUrl: this.backgroundUrl,
      primaryColor: this.primaryColor,
      audioSource: this.audioSource,
      audioFile: this.audioFile,
      filename: this.filename,
      baseVolume: this.baseVolume,
      backgroundSource: this.backgroundSource,
      category: this.category,
      isBaseScene: this.isBaseScene,
    };
  }
}

const backgrounds: Record<SceneCategory, { source: any; color: string }> = {
  'Nature': {
    source: require('../assets/images/categories/category_nature.webp'),
    color: '#2d5a3d',
  },
  'Healing': {
    source: require('../assets/images/categories/category_therapy.webp'),
    color: '#6b4c9a',
  },
  'Brainwave': {
    source: require('../assets/images/categories/category_focus.webp'),
    color: '#1a1a4e',
  },
  'Life': {
    source: require('../assets/images/categories/category_life.webp'),
    color: '#8b7355',
  },
  'WesternChurch': {
    source: require('../assets/images/categories/category_western_church.webp'),
    color: '#4a3728',
  },
  'Oriental': {
    source: require('../assets/images/categories/category_nature.webp'),
    color: '#8b5e3c',
  },
};

// 【背景图缓存】避免重复创建引用，防止 Image 组件闪烁
const backgroundSourceCache: Record<string, any> = {};

const getCategory = (cat: string): SceneCategory => {
  switch (cat.toLowerCase()) {
    case 'nature':
      return 'Nature';
    case 'healing':
      return 'Healing';
    case 'brainwave':
      return 'Brainwave';
    case 'life':
      return 'Life';
    case 'western_church':
      return 'WesternChurch';
    case 'oriental':
      return 'Oriental';
    default:
      return 'Nature';
  }
};

// 【背景图缓存工具】返回相同 URI 的相同引用
const getCachedBackgroundSource = (uri: string) => {
  if (!backgroundSourceCache[uri]) {
    backgroundSourceCache[uri] = { uri };
  }
  return backgroundSourceCache[uri];
};

export const getIconName = (id: string) => {
  if (id.includes('white_noise')) return 'radio-outline';
  if (id.includes('wind_chime')) return 'notifications-outline';
  if (id.includes('breath')) return 'heart-outline';
  if (id.includes('apple')) return 'nutrition-outline';
  if (id.includes('match')) return 'flame';
  if (id.includes('rain')) return 'rainy-outline';
  if (id.includes('ocean')) return 'boat-outline';
  return 'musical-notes-outline';
};

// 1. Explicitly specified small scene IDs (isBaseScene: false) - 5 real interactive sounds
export const SMALL_SCENE_IDS = [
  'interactive_match',
  'interactive_apple',
  'interactive_wind_chime',
  'interactive_breath',
  'interactive_white_noise',
];

// 西方教会场景背景图本地路径映射
const WESTERN_CHURCH_BG_MAP: Record<string, string> = {
  western_church_morning_bell: 'western_church_candlelight.webp',
  western_church_gregorian: 'western_church_corridor.webp',
  western_church_holy_waves: 'western_church_light_rays.webp',
  western_church_urban_chant: 'western_church_sunlight_monastery.webp',
  western_church_forest_echo: 'western_church_candlelight.webp',
};

// 东方禅意场景背景图本地路径映射（只包含文件名，不包含 zen/ 前缀）
const ORIENTAL_BG_MAP: Record<string, string> = {
  oriental_zen_monastery: 'bg_temple_lantern_gate.webp',
  oriental_tibetan_bowl: 'bg_temple_zen_lantern.webp',
  oriental_morning_buddha: 'buddha_morning.webp',
};

// 【🔥 Release 兼容】新增自然场景必须使用 require() 静态资源（因为这些图在 assets 目录中）
const NEW_NATURE_BG_FALLBACK: Record<string, any> = {
  manual_morning_forest: require('../assets/scenes/morning_forest.webp'),
  manual_serene_lakeside: require('../assets/scenes/serene_lakeside.webp'),
  manual_starlit_wilderness: require('../assets/scenes/starlit_wilderness.webp'),
};

/**
 * 获取场景的背景资源
 * 
 * 资源来源优先级：
 * 1. 新增自然场景 → require() 静态资源（Release 兼容）
 * 2. 东方禅意/西方教会 → file:// 动态路径（需先下载）
 *    - 已下载 → 返回 { uri: 'file://...' }
 *    - 未下载 → 返回 null（触发 HomeScreen 占位块显示 🏯/⛪）
 * 3. 其他场景 → backgrounds[category] 的 require() 静态资源
 */
export const getSceneBackground = (sceneId: string, category: SceneCategory) => {
  // 新增自然场景：优先使用静态资源 fallback
  if (NEW_NATURE_BG_FALLBACK[sceneId]) {
    return NEW_NATURE_BG_FALLBACK[sceneId];
  }

  // 东方禅意场景：使用动态路径（需下载后才能显示）
  if (sceneId.startsWith('oriental_')) {
    const bgFilename = ORIENTAL_BG_MAP[sceneId];
    if (bgFilename) {
      const localPath = getLocalPathHelper('scene_backgrounds', `zen/${bgFilename}`);
      // 【🔥修复闪烁】检查缓存中文件是否存在状态
      if (isBackgroundImageAvailable(localPath)) {
        const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
        return getCachedBackgroundSource(uri);
      }
      // 文件不存在，返回 fallback 背景图
      return backgrounds['Oriental']?.source || null;
    }
  }
  
  // 西方教会场景：使用动态路径（需下载后才能显示）
  if (sceneId.startsWith('western_church_')) {
    const bgFilename = WESTERN_CHURCH_BG_MAP[sceneId];
    if (bgFilename) {
      const localPath = getLocalPathHelper('scene_backgrounds', bgFilename);
      // 【🔥修复闪烁】检查缓存中文件是否存在状态
      if (isBackgroundImageAvailable(localPath)) {
        const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
        return getCachedBackgroundSource(uri);
      }
      // 文件不存在，返回 fallback 背景图
      return backgrounds['WesternChurch']?.source || null;
    }
  }
  
  // 其他场景：使用本地 require 静态资源
  const bg = backgrounds[category];
  return bg?.source || null;
};

// 场景顺序配置（严格按照配置表排列）
const SCENE_ORDER: Record<string, number> = {
  // Nature 自然场景 (order 1-10)
  nature_ocean: 1,
  nature_forest: 2,
  nature_deep_sea: 3,
  nature_misty_forest: 4,
  nature_river: 5,
  nature_night: 6,
  manual_morning_forest: 7,
  manual_serene_lakeside: 8,
  manual_starlit_wilderness: 9,
  
  // Life 生活场景 (order 11-20)
  life_rain_boat: 11,
  life_bookstore: 12,
  
  // Healing 疗愈场景 (order 21-30)
  healing_zen_bowl: 21,
  healing_clean_space: 22,
  healing_crystal: 23,
  
  // Brainwave 脑波场景 (order 31-40)
  brainwave_alpha: 31,
  brainwave_delta: 32,
  
  // Interactive 交互场景 (order 41-50)
  interactive_white_noise: 41,
  interactive_wind_chime: 42,
  interactive_breath: 43,
  interactive_apple: 44,
  interactive_match: 45,
  
  // WesternChurch 西方教会 (order 51-60)
  western_church_gregorian: 51,
  western_church_morning_bell: 52,
  western_church_holy_waves: 53,
  western_church_forest_echo: 54,
  western_church_urban_chant: 55,
  
  // Oriental 东方禅意 (order 61-70)
  oriental_zen_monastery: 61,
  oriental_tibetan_bowl: 62,
  oriental_morning_buddha: 63,
};

export const SCENES: Scene[] = AUDIO_MANIFEST
  .filter((item) => {
    // 【关键过滤】排除 8 轨音频文件和背景图资源
    return !item.id.startsWith('8track_') && !item.id.startsWith('bg_');
  })
  .map((item) => {
    const category = getCategory(item.category);
    const bg = backgrounds[category];
    let resolvedBgUri = '';
    
    // 2. Explicitly specified big scene IDs (isBaseScene: true)
    const baseSceneIds = [
      'nature_ocean',
      'nature_forest',
      'nature_deep_sea',
      'nature_misty_forest',
      'nature_river',
      'nature_night',
      'manual_morning_forest',
      'manual_serene_lakeside',
      'manual_starlit_wilderness',
      'life_rain_boat',
      'life_bookstore',
      'healing_zen_bowl',
      'healing_clean_space',
      'healing_crystal',
      'brainwave_alpha',
      'brainwave_delta',
      'western_church_gregorian',
      'western_church_morning_bell',
      'western_church_holy_waves',
      'western_church_forest_echo',
      'western_church_urban_chant',
      'oriental_zen_monastery',
      'oriental_tibetan_bowl',
      'oriental_morning_buddha',
    ];

    let isBase = false;
    
    if (SMALL_SCENE_IDS.includes(item.id)) {
      isBase = false;
    } else if (baseSceneIds.includes(item.id)) {
      isBase = true;
    } else {
      // Default logic: small scenes if in fx/ directory or interactive category
      isBase = !item.filename.startsWith('fx/') && item.category !== 'interactive';
    }

    const scene = new Scene({
      id: item.id,
      title: item.title,
      audioUrl: `${PRIMARY_REMOTE_RESOURCE_BASE_URL}${item.filename}`,
      backgroundUrl: `${PRIMARY_REMOTE_RESOURCE_BASE_URL}${item.filename}`,
      primaryColor: bg.color,
      audioSource: item.id,
      audioFile: null,
      filename: item.filename,
      baseVolume: 1.0,
      backgroundSource: getSceneBackground(item.id, category),
      category: category,
      isBaseScene: isBase,
      order: SCENE_ORDER[item.id] ?? 999,
    });
    return scene;
  })
  .sort((a, b) => a.order - b.order);

console.log('[scenes] 场景已按 order 强制排序，共', SCENES.length, '个场景');
console.log('[scenes] 场景顺序:', SCENES.map(s => s.id).join(', '));
