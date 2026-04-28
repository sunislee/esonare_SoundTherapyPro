import { Platform, ImageSourcePropType, Image } from 'react-native';
import { AUDIO_MANIFEST, PRIMARY_REMOTE_RESOURCE_BASE_URL, IS_GOOGLE_PLAY_VERSION, GITEE_URL, GITHUB_URL } from './audioAssets';

// 背景图 URL 根据渠道自动选择
const BG_BASE_URL = IS_GOOGLE_PLAY_VERSION ? GITHUB_URL : GITEE_URL;

export type SceneCategory = 'Nature' | 'Healing' | 'Brainwave' | 'Life' | 'WesternChurch';

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
};

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
    default:
      return 'Nature';
  }
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

// 西方教会场景背景图远程 URL 映射
const WESTERN_CHURCH_BG_MAP: Record<string, string> = {
  western_church_gregorian: 'western_church_candlelight.webp',    // 西班牙圣咏 → 烛光
  western_church_morning_bell: 'western_church_sunlight_monastery.webp', // 晨祷钟声 → 阳光修道院
  western_church_holy_waves: 'western_church_light_rays.webp',    // 神圣光流 → 光线
  western_church_forest_echo: 'western_church_corridor.webp',     // 石廊回响 → 走廊
  western_church_urban_chant: 'western_church_candlelight.webp',  // 烛光禅定 → 烛光
};

/**
 * 获取场景的背景资源
 * 西方教会场景使用远程 URL，其他场景使用本地 require
 */
const getSceneBackground = (sceneId: string, category: SceneCategory) => {
  // 西方教会场景：使用远程 URL
  if (sceneId.startsWith('western_church_')) {
    const bgFilename = WESTERN_CHURCH_BG_MAP[sceneId];
    if (bgFilename) {
      return {
        uri: `${BG_BASE_URL}${bgFilename}`,
      };
    }
  }
  
  // 其他场景：使用本地 require
  const bg = backgrounds[category];
  return bg?.source || null;
};

export const SCENES: Scene[] = AUDIO_MANIFEST
  .map((item) => {
    const category = getCategory(item.category);
    const bg = backgrounds[category];
    let resolvedBgUri = '';
    
    // 2. Explicitly specified big scene IDs (isBaseScene: true)
    const baseSceneIds = [
      'nature_ocean',
      'nature_forest',
      'nature_river',
      'nature_night',
      'life_rain_boat',
      'life_bookstore',
      'healing_zen_bowl',
      'healing_clean_space',
      'healing_crystal',
      'brainwave_alpha',
      'brainwave_delta',
    ];

    let isBase = true;
    
    if (SMALL_SCENE_IDS.includes(item.id)) {
      isBase = false;
    } else if (baseSceneIds.includes(item.id)) {
      isBase = true;
    } else {
      // Default logic: small scenes if in fx/ directory or interactive category
      isBase = !item.filename.startsWith('fx/') && item.category !== 'interactive';
    }

    // Bellcoda 新场景自定义主题色
    const customColors: Record<string, string> = {
      nature_moonlight: '#0A0F1E',   // 月光-深蓝
      nature_star_glass: '#120B1A',  // 星璃-暗紫
      nature_offroad: '#0E1A14',     // 旷野-墨绿
    };

    const scene = new Scene({
      id: item.id,
      title: item.title,
      audioUrl: `${PRIMARY_REMOTE_RESOURCE_BASE_URL}${item.filename}`,
      backgroundUrl: '',
      primaryColor: customColors[item.id] || bg.color,
      audioSource: item.id,
      audioFile: null,
      filename: item.filename,
      baseVolume: 1.0,
      backgroundSource: getSceneBackground(item.id, category),
      category: category,
      isBaseScene: isBase,
    });
    return scene;
  });

console.log('大哥，背景图已焊死，双源逻辑已并存！');
