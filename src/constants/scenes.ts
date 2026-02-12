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
    source: require('../assets/images/ocean_scene_final_v7.webp'),
    color: '#0047AB',
  },
  'Healing': {
    source: require('../assets/images/forest_scene_final_v7.webp'),
    color: '#4a7a5a',
  },
  'Brainwave': {
    source: require('../assets/images/fire_scene_final_v7.webp'),
    color: '#1a1a2e',
  },
  'Life': {
    source: require('../assets/images/rain_scene_final_v7.webp'),
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
  if (id.includes('match')) return 'flame';
  if (id.includes('rain')) return 'rainy-outline';
  if (id.includes('ocean')) return 'boat-outline';
  return 'musical-notes-outline';
};

// 1. Explicitly specified small scene IDs (isBaseScene: false) - 7 global ambient sounds
export const SMALL_SCENE_IDS = [
  'interactive_match',
  'interactive_apple',
  'interactive_wind_chime',
  'interactive_breath',
  'life_summer',
  'interactive_rain',
  'interactive_ocean',
  'life_fireplace',
];

export const SCENES: Scene[] = AUDIO_MANIFEST
  .map((item) => {
    const category = getCategory(item.category);
    const bg = backgrounds[category];
    let resolvedBgUri = '';
    try {
      const resolved = Image.resolveAssetSource(bg.source);
      resolvedBgUri = resolved ? resolved.uri : '';
    } catch (e) {
      console.warn(`[Scenes] Failed to resolve asset source for ${item.id}`, e);
    }
    
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

    return new Scene({
      id: item.id,
      title: item.title,
      audioUrl: `${REMOTE_RESOURCE_BASE_URL}${item.filename}`,
      backgroundUrl: resolvedBgUri,
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
