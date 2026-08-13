// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import { Platform, ImageSourcePropType, Image } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { AUDIO_MANIFEST, PRIMARY_REMOTE_RESOURCE_BASE_URL, getLocalPath as getLocalPathHelper } from './audioAssets';

// 【背景图状态缓存】在应用启动时预加载所有文件存在性状态
let backgroundAvailabilityCache: Record<string, boolean> = {};

// 【辅助函数】异步检查并缓存背景图文件是否存在（应用启动 + 下载完成后调用）
// 📝 RNFS.exists() 会返回 true，但文件大小可能为 0（下载中断的临时文件），
//    因此必须同时验证 stat.size > 1KB 来确保图片可用。
const isBackgroundFileValid = async (localPath: string): Promise<boolean> => {
  try {
    const exists = await RNFS.exists(localPath);
    if (!exists) return false;
    const stat = await RNFS.stat(localPath);
    // 1KB 阈值：排除下载中断产生的空文件或损坏文件
    return (stat.size ?? 0) > 1024;
  } catch {
    return false;
  }
};

export const preloadBackgroundAvailability = async (): Promise<void> => {
  console.log('[scenes] 🔄 预加载/刷新 背景图可用性状态...');

  try {
    // 检查东方禅意场景的背景图（category 必须与 getSceneBackground 一致，确保缓存 key 匹配）
    for (const [sceneId, bgFilename] of Object.entries(ORIENTAL_BG_MAP)) {
      const localPath = getLocalPathHelper('oriental', `zen/${bgFilename}`);
      backgroundAvailabilityCache[localPath] = await isBackgroundFileValid(localPath);
    }

    // 检查西方教会场景的背景图
    for (const [sceneId, bgFilename] of Object.entries(WESTERN_CHURCH_BG_MAP)) {
      const localPath = getLocalPathHelper('scene_backgrounds', bgFilename);
      backgroundAvailabilityCache[localPath] = await isBackgroundFileValid(localPath);
    }

    const availableCount = Object.values(backgroundAvailabilityCache).filter(Boolean).length;
    console.log(`[scenes] ✅ 背景图可用性刷新完成: ${availableCount}/${Object.keys(backgroundAvailabilityCache).length} 个文件可用`);
  } catch (error) {
    console.warn('[scenes] ⚠️ 预加载背景图状态失败:', error);
  }
};

// 【辅助函数】检查背景图是否可用（同步查询缓存）
const isBackgroundImageAvailable = (localPath: string): boolean => {
  // 优先使用缓存结果
  if (localPath in backgroundAvailabilityCache) {
    return backgroundAvailabilityCache[localPath];
  }
  // 缓存未命中：默认返回 false（保守策略，避免显示损坏的图片）
  // 缓存会在 preloadBackgroundAvailability() 调用时刷新
  return false;
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
    source: require('../assets/images/scenes/buddha_morning.webp'),
    color: '#8b5e3c',
  },
};

// 【🔥 v1.4.3 修复】西方教会场景独立缩略图映射（Release 包使用 require() 静态资源）
const WESTERN_CHURCH_THUMBNAIL_MAP: Record<string, any> = {
  western_church_morning_bell: require('../assets/images/scenes/western_church_candlelight.webp'),
  western_church_gregorian: require('../assets/images/scenes/western_church_corridor.webp'),
  western_church_holy_waves: require('../assets/images/scenes/western_church_light_rays.webp'),
  western_church_urban_chant: require('../assets/images/scenes/western_church_sunlight_monastery.webp'),
  western_church_forest_echo: require('../assets/images/scenes/western_church_candlelight.webp'),
};

// 【 v1.4.6 修复】东方禅意场景独立缩略图映射（使用不同类别图片作为占位，下载完成后显示正确图片）
const ORIENTAL_THUMBNAIL_MAP: Record<string, any> = {
  oriental_zen_monastery: require('../assets/images/categories/category_nature.webp'), // 森林图作为寺院占位
  oriental_tibetan_bowl: require('../assets/images/categories/category_therapy.webp'), // 冥想图作为颂钵占位
  oriental_morning_buddha: require('../assets/images/scenes/buddha_morning.webp'), // 晨钟佛音用原图
};

// 【🔥 v1.4.5 修复】东方禅意场景背景图下载路径修正
// DownloadService 使用 manifest.filename='zen/xxx.webp'，getLocalPath 忽略 category
// 实际下载路径: audio_resources/zen/xxx.webp（不是 scene_backgrounds/zen/）
const getOrientalLocalPath = (bgFilename: string): string => {
  return getLocalPathHelper('oriental', `zen/${bgFilename}`);
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
  if (id.includes('record_shop')) return 'musical-note-outline';
  if (id.includes('bookstore')) return 'book-outline';
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

// 2. SFX-only entries for the record shop scene — not standalone scenes on HomeScreen
export const RECORD_SHOP_SFX_IDS = [
  'life_record_shop_vinyl_crackle',
  'life_record_shop_door_chime',
  'life_record_shop_footsteps',
  'life_record_shop_vinyl_pop',
  'life_record_shop_radio_tuning',
];

// 西方教会场景背景图文件名映射（远程CDN下载到本地后使用，与东方禅意模式一致）
// 【🔥 v1.4.2 修复】每个场景必须使用独立的背景图片，不能重复！
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
  // 【🔥 v1.4.2 修复】morning_buddha 使用独立的 buddha_morning.webp（与 zen/ 目录下的同名单元）
  oriental_morning_buddha: 'buddha_morning.webp',
};

// 【🔥 Release 兼容】新增自然场景必须使用 require() 静态资源（因为这些图在 assets 目录中）
const NEW_NATURE_BG_FALLBACK: Record<string, any> = {
  manual_morning_forest: require('../assets/scenes/morning_forest.webp'),
  manual_serene_lakeside: require('../assets/scenes/serene_lakeside.webp'),
  manual_starlit_wilderness: require('../assets/scenes/starlit_wilderness.webp'),
};

export const getSceneBackground = (sceneId: string, category: SceneCategory) => {
  if (NEW_NATURE_BG_FALLBACK[sceneId]) {
    return NEW_NATURE_BG_FALLBACK[sceneId];
  }

  if (sceneId.startsWith('oriental_')) {
    const bgFilename = ORIENTAL_BG_MAP[sceneId];
    if (bgFilename) {
      // 【🔥 v1.4.5 修复】路径与 DownloadService 一致：audio_resources/zen/xxx.webp
      // DownloadService 用 manifest.filename='zen/xxx.webp'，getLocalPath 忽略 category
      const localPath = getLocalPathHelper('oriental', `zen/${bgFilename}`);
      if (isBackgroundImageAvailable(localPath)) {
        const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
        return getCachedBackgroundSource(uri);
      }
    }
    // 静态 fallback：每个场景用不同的图
    if (ORIENTAL_THUMBNAIL_MAP[sceneId]) {
      return ORIENTAL_THUMBNAIL_MAP[sceneId];
    }
    return backgrounds['Oriental']?.source || backgrounds[category]?.source || null;
  }
  
  if (sceneId.startsWith('western_church_')) {
    const bgFilename = WESTERN_CHURCH_BG_MAP[sceneId];
    if (bgFilename) {
      const localPath = getLocalPathHelper('scene_backgrounds', bgFilename);
      if (isBackgroundImageAvailable(localPath)) {
        const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
        return getCachedBackgroundSource(uri);
      }
    }
    // 【🔥 v1.4.3 修复】使用独立缩略图映射，避免所有场景显示同一张图
    if (WESTERN_CHURCH_THUMBNAIL_MAP[sceneId]) {
      return WESTERN_CHURCH_THUMBNAIL_MAP[sceneId];
    }
    return backgrounds['WesternChurch']?.source || backgrounds[category]?.source || null;
  }
  
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
  life_record_shop: 13,
  
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
      'life_record_shop',
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
    } else if (RECORD_SHOP_SFX_IDS.includes(item.id)) {
      isBase = false;
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
