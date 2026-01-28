import { Platform, ImageSourcePropType, Image } from 'react-native';
import { AUDIO_MANIFEST } from './audioAssets';

export type SceneCategory = 'Nature' | 'Healing' | 'Brainwave' | 'Life';

export type Scene = {
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
};

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
    return {
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
    };
  });
