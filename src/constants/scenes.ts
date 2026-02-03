import { Platform, ImageSourcePropType, Image } from 'react-native';
import { AUDIO_MANIFEST, REMOTE_RESOURCE_BASE_URL } from './audioAssets';

export type SceneCategory = 'Nature' | 'Healing' | 'Brainwave' | 'Life';

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
    this.backgroundSource = data.backgroundSource || { uri: '' };
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

const backgrounds: Record<SceneCategory, { source: ImageSourcePropType; color: string }> = {
  'Nature': {
    source: require('../assets/images/sea_bg.jpg'),
    color: '#0047AB',
  },
  'Healing': {
    source: require('../assets/images/forest_bg.jpg'),
    color: '#4a7a5a',
  },
  'Brainwave': {
    source: require('../assets/images/fire_bg.jpg'),
    color: '#1a1a2e',
  },
  'Life': {
    source: require('../assets/images/rain_bg.jpg'),
    color: '#3b5c99',
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
    default:
      return 'Nature';
  }
};

export const getIconName = (id: string) => {
  if (id.includes('fireplace')) return 'flame-outline';
  if (id.includes('summer')) return 'sunny-outline';
  if (id.includes('white_noise')) return 'radio-outline';
  if (id.includes('wind_chime')) return 'notifications-outline';
  if (id.includes('breath')) return 'heart-outline';
  if (id.includes('apple')) return 'nutrition-outline';
  if (id.includes('match')) return 'flame'; // 划火柴使用实心火焰图标
  if (id.includes('rain')) return 'rainy-outline';
  if (id.includes('ocean')) return 'boat-outline';
  return 'musical-notes-outline';
};

// 1. 明确指定的小场景 ID (isBaseScene: false) - 7 大全局氛围音
export const SMALL_SCENE_IDS = [
  'interactive_match',       // 点燃 (划火柴)
  'interactive_apple',       // 清脆 (嚼苹果)
  'interactive_wind_chime',  // 空灵 (风铃)
  'interactive_breath',      // 呼吸
  'life_summer',             // 夏夜 (夏日烟火)
  'interactive_rain',        // 听雨
  'interactive_ocean',       // 观海
  'life_fireplace',          // 围炉 (炉火)
];

export const SCENES: Scene[] = AUDIO_MANIFEST
  .map((item) => {
    const category = getCategory(item.category);
    const bg = backgrounds[category];
    const resolvedBg = Image.resolveAssetSource(bg.source);
    
    // 2. 明确指定的大场景 ID (isBaseScene: true)
    const baseSceneIds = [
      'nature_ocean',         // 深海
      'nature_forest',        // 迷雾森林
      'nature_river',         // 晨间河畔
      'nature_night',         // 静谧部落
      'life_rain_boat',       // 舟上雨
      'life_bookstore',       // 午后书店
      'healing_zen_bowl',     // 颂钵冥想
      'healing_clean_space',  // 洁净空间
      'healing_crystal',      // 水晶钵
      'brainwave_alpha',      // Alpha专注
      'brainwave_delta',      // Delta入眠
    ];

    let isBase = true;
    
    if (SMALL_SCENE_IDS.includes(item.id)) {
      isBase = false;
    } else if (baseSceneIds.includes(item.id)) {
      isBase = true;
    } else {
      // 默认逻辑：fx/ 目录下或 interactive 分类为小场景
      isBase = !item.filename.startsWith('fx/') && item.category !== 'interactive';
    }

    return new Scene({
      id: item.id,
      title: item.title,
      audioUrl: `${REMOTE_RESOURCE_BASE_URL}${item.filename}`,
      backgroundUrl: resolvedBg.uri,
      primaryColor: bg.color,
      audioSource: item.id,
      audioFile: null,
      filename: item.filename,
      baseVolume: 1.0,
      backgroundSource: bg.source,
      category: category,
      isBaseScene: isBase,
    });
  });
