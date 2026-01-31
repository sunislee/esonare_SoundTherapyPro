import { Platform, ImageSourcePropType, Image } from 'react-native';
import { AUDIO_MANIFEST } from './audioAssets';

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
    this.baseVolume = data.baseVolume ?? 1.0;
    this.backgroundSource = data.backgroundSource;
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

export const SCENES: Scene[] = AUDIO_MANIFEST
  .filter(item => item.category !== 'interactive')
  .map((item) => {
    const category = getCategory(item.category);
    const bg = backgrounds[category];
    const resolvedBg = Image.resolveAssetSource(bg.source);
    
    // 1. 明确指定的大场景 ID (isBaseScene: true)
    const baseSceneIds = [
      'nature_ocean',         // 深海
      'nature_forest',        // 迷雾森林
      'nature_river',         // 晨间河畔
      'life_rain_boat',       // 舟上雨
      'life_bookstore',       // 午后书店
      'healing_zen_bowl',     // 颂钵冥想
      'healing_clean_space',  // 洁净空间
      'brainwave_alpha',      // Alpha专注
      'brainwave_delta',      // Delta入眠
    ];

    // 2. 明确指定的小场景 ID (isBaseScene: false)
    const smallSceneIds = [
      'life_fireplace',       // 炉火
      'life_summer',          // 夏日烟火
      'life_fire_pure',       // 篝火
    ];

    let isBase = true;
    
    if (smallSceneIds.includes(item.id)) {
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
      audioUrl: Platform.select({
        android: item.id,
        default: `asset:///${item.id}`,
      }) as string,
      backgroundUrl: resolvedBg.uri,
      primaryColor: bg.color,
      audioSource: item.id,
      audioFile: null,
      baseVolume: 1.0,
      backgroundSource: bg.source,
      category: category,
      isBaseScene: isBase,
    });
  });
