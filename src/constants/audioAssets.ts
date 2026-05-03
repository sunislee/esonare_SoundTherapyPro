import { NativeModules, Platform } from 'react-native'; 
import * as RNFS from 'react-native-fs'; 

const nativeChannel =
  Platform.OS === 'android' && NativeModules?.CrashReport?.getChannel
    ? NativeModules.CrashReport.getChannel()
    : null;

export const IS_GOOGLE_PLAY_VERSION = nativeChannel ? nativeChannel === 'googlePlay' : true;

const TENCENT_CLOUD_URL = 'https://43.138.58.71/';
export const GITEE_URL = 'https://gitee.com/sunislee/sound-therapy-assets/raw/main/';
export const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';
export const GHPROXY_URL = 'https://ghproxy.net/';

// Google Play 专用配置：GitHub 官方源（主源）+ ghproxy 镜像加速
// 专注海外市场，使用 GitHub 作为主源，通过镜像加速提升下载速度
export const PRIMARY_REMOTE_RESOURCE_BASE_URL = `${GHPROXY_URL}${GITHUB_URL}`;
export const SECONDARY_REMOTE_RESOURCE_BASE_URL = `${GHPROXY_URL}${GITHUB_URL}`;
export const REMOTE_RESOURCE_BASE_URL = PRIMARY_REMOTE_RESOURCE_BASE_URL;

export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

export const getLocalPath = (category: string, filename: string) => { 
    const rawPath = `${LOCAL_RESOURCE_PATH}/${filename}`; 
    return Platform.OS === 'ios' ? `file://${rawPath}` : rawPath; 
}; 

export const DEFAULT_FALLBACK_SOURCE = null;

export const AMBIENT_RESOURCES = {
  WHITE_NOISE: 'interactive/white_noise.m4a',
  WIND_CHIME: 'interactive/wind-chime.m4a',
  BREATH: 'interactive/breath.m4a',
  APPLE_CRUNCH: 'interactive/apple_crunch.m4a',
  MATCH_STRIKE: 'interactive/match_strike.wav',

  RAIN: 'base/final_healing_rain.m4a',
  OCEAN: 'base/ocean.mp3',
};

export const AUDIO_MANIFEST = [ 
  { id: 'nature_ocean', filename: 'base/deep_ocean_abyss.m4a', category: 'nature', title: 'scenes.nature_ocean.title', description: 'scenes.nature_ocean.desc', size: 1429191 }, 
  { id: 'nature_forest', filename: 'base/misty_woods_dripping.m4a', category: 'nature', title: 'scenes.nature_forest.title', description: 'scenes.nature_forest.desc', size: 680336 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea_breathing_rhythm.m4a', category: 'nature', title: 'scenes.nature_deep_sea.title', description: 'scenes.nature_deep_sea.desc', size: 456030 },
  { id: 'nature_misty_forest', filename: 'base/foggy_forest_ritual.m4a', category: 'nature', title: 'scenes.nature_misty_forest.title', description: 'scenes.nature_misty_forest.desc', size: 1732906 },
  { id: 'nature_river', filename: 'base/morning_river.mp3', category: 'nature', title: 'scenes.nature_river.title', description: 'scenes.nature_river.desc', size: 7201196 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: 'scenes.nature_night.title', description: 'scenes.nature_night.desc', size: 7201196 },

  { id: 'manual_morning_forest', filename: 'base/offroad_avenue.m4a', category: 'nature', title: 'scenes.manual_morning_forest.title', description: 'scenes.manual_morning_forest.desc', size: 7201196 },
  { id: 'manual_serene_lakeside', filename: 'base/moonlight.m4a', category: 'nature', title: 'scenes.manual_serene_lakeside.title', description: 'scenes.manual_serene_lakeside.desc', size: 7201196 },
  { id: 'manual_starlit_wilderness', filename: 'base/star_glass.m4a', category: 'nature', title: 'scenes.manual_starlit_wilderness.title', description: 'scenes.manual_starlit_wilderness.desc', size: 7201196 },

  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: 'scenes.life_rain_boat.title', description: 'scenes.life_rain_boat.desc', size: 7201196 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: 'scenes.life_bookstore.title', description: 'scenes.life_bookstore.desc', size: 907157 },
 

  { id: 'healing_zen_bowl', filename: 'fx/zen_bowl.m4a', category: 'healing', title: 'scenes.healing_zen_bowl.title', description: 'scenes.healing_zen_bowl.desc', size: 391549 }, 
  { id: 'healing_clean_space', filename: 'base/liquid_peace.m4a', category: 'healing', title: 'scenes.healing_clean_space.title', description: 'scenes.healing_clean_space.desc', size: 4574599 }, 
  { id: 'healing_crystal', filename: 'base/crystal_bowl.m4a', category: 'healing', title: 'scenes.healing_crystal.title', description: 'scenes.healing_crystal.desc', size: 5242880 }, 

  { id: 'brainwave_alpha', filename: 'base/alpha_wave.m4a', category: 'brainwave', title: 'scenes.brainwave_alpha.title', description: 'scenes.brainwave_alpha.desc', size: 3095272 }, 
  { id: 'brainwave_delta', filename: 'base/binaural_beat.mp3', category: 'brainwave', title: 'scenes.brainwave_delta.title', description: 'scenes.brainwave_delta.desc', size: 3840754 }, 

  { id: 'interactive_white_noise', filename: AMBIENT_RESOURCES.WHITE_NOISE, category: 'interactive', title: 'scenes.interactive_white_noise.title', description: 'scenes.interactive_white_noise.desc', size: 69881 }, 
  { id: 'interactive_wind_chime', filename: AMBIENT_RESOURCES.WIND_CHIME, category: 'interactive', title: 'scenes.interactive_wind_chime.title', description: 'scenes.interactive_wind_chime.desc', size: 256806 }, 
  { id: 'interactive_breath', filename: AMBIENT_RESOURCES.BREATH, category: 'interactive', title: 'scenes.interactive_breath.title', description: 'scenes.interactive_breath.desc', size: 1048576 }, 
  { id: 'interactive_apple', filename: AMBIENT_RESOURCES.APPLE_CRUNCH, category: 'interactive', title: 'scenes.interactive_apple.title', description: 'scenes.interactive_apple.desc', size: 32853 }, 
  { id: 'interactive_match', filename: AMBIENT_RESOURCES.MATCH_STRIKE, category: 'interactive', title: 'scenes.interactive_match.title', description: 'scenes.interactive_match.desc', size: 846284 },

  { id: 'western_church_gregorian', filename: 'western_church/western_church_gregorian_chant.mp3', category: 'western_church', title: 'scenes.western_church_gregorian.title', description: 'scenes.western_church_gregorian.desc', size: 427392 },
  { id: 'western_church_morning_bell', filename: 'western_church/western_church_morning_bell.m4a', category: 'western_church', title: 'scenes.western_church_morning_bell.title', description: 'scenes.western_church_morning_bell.desc', size: 194690 },
  { id: 'western_church_holy_waves', filename: 'western_church/western_church_holy_waves.m4a', category: 'western_church', title: 'scenes.western_church_holy_waves.title', description: 'scenes.western_church_holy_waves.desc', size: 617365 },
  { id: 'western_church_forest_echo', filename: 'western_church/western_church_forest_echo.m4a', category: 'western_church', title: 'scenes.western_church_forest_echo.title', description: 'scenes.western_church_forest_echo.desc', size: 732037 },
  { id: 'western_church_urban_chant', filename: 'western_church/western_church_urban_chant.m4a', category: 'western_church', title: 'scenes.western_church_urban_chant.title', description: 'scenes.western_church_urban_chant.desc', size: 414572 },

  { id: 'oriental_zen_monastery', filename: 'zen/zen_bell.mp3', category: 'oriental', title: 'scenes.oriental_zen_monastery.title', description: 'scenes.oriental_zen_monastery.desc', size: 1048576 },
  { id: 'oriental_tibetan_bowl', filename: 'zen/zen_bowl.mp3', category: 'oriental', title: 'scenes.oriental_tibetan_bowl.title', description: 'scenes.oriental_tibetan_bowl.desc', size: 1048576 },
  { id: 'oriental_morning_buddha', filename: 'zen/zen_hum.mp3', category: 'oriental', title: 'scenes.oriental_morning_buddha.title', description: 'scenes.oriental_morning_buddha.desc', size: 1048576 },

  // 8 轨音频资源（降噪实验室 EQ 调节用）
  { id: '8track_balanced_1', filename: 'noise reduction/balanced_noise_track_1.mp3', category: 'noise_reduction', title: '均衡降噪 Track 1', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_2', filename: 'noise reduction/balanced_noise_track_2.mp3', category: 'noise_reduction', title: '均衡降噪 Track 2', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_3', filename: 'noise reduction/balanced_noise_track_3.mp3', category: 'noise_reduction', title: '均衡降噪 Track 3', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_4', filename: 'noise reduction/balanced_noise_track_4.mp3', category: 'noise_reduction', title: '均衡降噪 Track 4', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_5', filename: 'noise reduction/balanced_noise_track_5.mp3', category: 'noise_reduction', title: '均衡降噪 Track 5', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_6', filename: 'noise reduction/balanced_noise_track_6.mp3', category: 'noise_reduction', title: '均衡降噪 Track 6', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_7', filename: 'noise reduction/balanced_noise_track_7.mp3', category: 'noise_reduction', title: '均衡降噪 Track 7', description: '8 轨均衡降噪音频', size: 4438143 },
  { id: '8track_balanced_8', filename: 'noise reduction/balanced_noise_track_8.mp3', category: 'noise_reduction', title: '均衡降噪 Track 8', description: '8 轨均衡降噪音频', size: 4438143 },

  { id: '8track_wind_1', filename: 'noise reduction/wind_noise_track_1.mp3', category: 'noise_reduction', title: '风声降噪 Track 1', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_2', filename: 'noise reduction/wind_noise_track_2.mp3', category: 'noise_reduction', title: '风声降噪 Track 2', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_3', filename: 'noise reduction/wind_noise_track_3.mp3', category: 'noise_reduction', title: '风声降噪 Track 3', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_4', filename: 'noise reduction/wind_noise_track_4.mp3', category: 'noise_reduction', title: '风声降噪 Track 4', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_5', filename: 'noise reduction/wind_noise_track_5.mp3', category: 'noise_reduction', title: '风声降噪 Track 5', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_6', filename: 'noise reduction/wind_noise_track_6.mp3', category: 'noise_reduction', title: '风声降噪 Track 6', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_7', filename: 'noise reduction/wind_noise_track_7.mp3', category: 'noise_reduction', title: '风声降噪 Track 7', description: '8 轨风声降噪音频', size: 531061 },
  { id: '8track_wind_8', filename: 'noise reduction/wind_noise_track_8.mp3', category: 'noise_reduction', title: '风声降噪 Track 8', description: '8 轨风声降噪音频', size: 531061 },

  { id: '8track_crowd_1', filename: 'noise reduction/crowd_noise_track_1.mp3', category: 'noise_reduction', title: '人声降噪 Track 1', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_2', filename: 'noise reduction/crowd_noise_track_2.mp3', category: 'noise_reduction', title: '人声降噪 Track 2', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_3', filename: 'noise reduction/crowd_noise_track_3.mp3', category: 'noise_reduction', title: '人声降噪 Track 3', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_4', filename: 'noise reduction/crowd_noise_track_4.mp3', category: 'noise_reduction', title: '人声降噪 Track 4', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_5', filename: 'noise reduction/crowd_noise_track_5.mp3', category: 'noise_reduction', title: '人声降噪 Track 5', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_6', filename: 'noise reduction/crowd_noise_track_6.mp3', category: 'noise_reduction', title: '人声降噪 Track 6', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_7', filename: 'noise reduction/crowd_noise_track_7.mp3', category: 'noise_reduction', title: '人声降噪 Track 7', description: '8 轨人声降噪音频', size: 4324040 },
  { id: '8track_crowd_8', filename: 'noise reduction/crowd_noise_track_8.mp3', category: 'noise_reduction', title: '人声降噪 Track 8', description: '8 轨人声降噪音频', size: 4324040 },

  { id: '8track_traffic_1', filename: 'noise reduction/traffic_noise_track_1.mp3', category: 'noise_reduction', title: '交通降噪 Track 1', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_2', filename: 'noise reduction/traffic_noise_track_2.mp3', category: 'noise_reduction', title: '交通降噪 Track 2', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_3', filename: 'noise reduction/traffic_noise_track_3.mp3', category: 'noise_reduction', title: '交通降噪 Track 3', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_4', filename: 'noise reduction/traffic_noise_track_4.mp3', category: 'noise_reduction', title: '交通降噪 Track 4', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_5', filename: 'noise reduction/traffic_noise_track_5.mp3', category: 'noise_reduction', title: '交通降噪 Track 5', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_6', filename: 'noise reduction/traffic_noise_track_6.mp3', category: 'noise_reduction', title: '交通降噪 Track 6', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_7', filename: 'noise reduction/traffic_noise_track_7.mp3', category: 'noise_reduction', title: '交通降噪 Track 7', description: '8 轨交通降噪音频', size: 4322786 },
  { id: '8track_traffic_8', filename: 'noise reduction/traffic_noise_track_8.mp3', category: 'noise_reduction', title: '交通降噪 Track 8', description: '8 轨交通降噪音频', size: 4322786 },
]; 

// 【核心】初始化 AUDIO_MAP，将 filename 映射到本地路径
export const AUDIO_MAP: Record<string, string> = {};

// 【RN 0.81 兼容性】添加 Array.isArray 非空保护
if (Array.isArray(AUDIO_MANIFEST)) {
  AUDIO_MANIFEST.forEach(item => {
    if (item && item.filename && item.category) {
      AUDIO_MAP[item.filename] = getLocalPath(item.category, item.filename);
    }
  });
} else {
  console.error('[audioAssets] ❌ AUDIO_MANIFEST is not an array!');
}

// 【核心】定义 ASSET_LIST，手动写好每个文件的 expectedSize（根据实际下载大小更新）
export const ASSET_LIST = [
  { id: 'nature_ocean', expectedSize: 1429191 },        // 实际：1.43MB
  { id: 'nature_forest', expectedSize: 680336 },        // 已替换为纯净森林素材：680KB
  { id: 'nature_deep_sea', expectedSize: 456030 },      // 实际：456KB
  { id: 'nature_misty_forest', expectedSize: 1732906 }, // 实际：1.73MB
  { id: 'nature_river', expectedSize: 7201196 },        // 实际：7.2MB
  { id: 'nature_night', expectedSize: 7201196 },        // 实际：7.2MB
  { id: 'life_rain_boat', expectedSize: 7201196 },      // 实际：7.2MB
  { id: 'life_bookstore', expectedSize: 907157 },       // 实际：907KB
  { id: 'healing_zen_bowl', expectedSize: 391549 },    // 实际：391KB
  { id: 'healing_clean_space', expectedSize: 4574599 }, // 实际：4.57MB
  { id: 'healing_crystal', expectedSize: 5242880 },    // 保持原值
  { id: 'brainwave_alpha', expectedSize: 3095272 },     // 实际：3.09MB
  { id: 'brainwave_delta', expectedSize: 3840754 },     // 实际：3.84MB
  { id: 'interactive_white_noise', expectedSize: 69881 },  // 实际：70KB
  { id: 'interactive_wind_chime', expectedSize: 256806 },  // 实际：257KB
  { id: 'interactive_breath', expectedSize: 1048576 },     // 保持原值
  { id: 'interactive_apple', expectedSize: 32853 },        // 实际：33KB
  { id: 'interactive_match', expectedSize: 846284 },       // 实际：846KB
  { id: 'western_church_gregorian', expectedSize: 427392 },    // 实际：427KB
  { id: 'western_church_morning_bell', expectedSize: 194690 }, // 实际：195KB
  { id: 'western_church_holy_waves', expectedSize: 617365 },   // 实际：617KB
  { id: 'western_church_forest_echo', expectedSize: 732037 },  // 实际：732KB
  { id: 'western_church_urban_chant', expectedSize: 414572 },  // 实际：415KB
  { id: 'manual_morning_forest', expectedSize: 784448 },      // offroad_avenue.m4a
  { id: 'manual_serene_lakeside', expectedSize: 594199 },    // moonlight.m4a
  { id: 'manual_starlit_wilderness', expectedSize: 466422 }, // star_glass.m4a

  // 8 轨音频资源（降噪实验室 EQ 调节用）
  { id: '8track_balanced_1', expectedSize: 4438143 },
  { id: '8track_balanced_2', expectedSize: 4438143 },
  { id: '8track_balanced_3', expectedSize: 4438143 },
  { id: '8track_balanced_4', expectedSize: 4438143 },
  { id: '8track_balanced_5', expectedSize: 4438143 },
  { id: '8track_balanced_6', expectedSize: 4438143 },
  { id: '8track_balanced_7', expectedSize: 4438143 },
  { id: '8track_balanced_8', expectedSize: 4438143 },

  { id: '8track_wind_1', expectedSize: 531061 },
  { id: '8track_wind_2', expectedSize: 531061 },
  { id: '8track_wind_3', expectedSize: 531061 },
  { id: '8track_wind_4', expectedSize: 531061 },
  { id: '8track_wind_5', expectedSize: 531061 },
  { id: '8track_wind_6', expectedSize: 531061 },
  { id: '8track_wind_7', expectedSize: 531061 },
  { id: '8track_wind_8', expectedSize: 531061 },

  { id: '8track_crowd_1', expectedSize: 4324040 },
  { id: '8track_crowd_2', expectedSize: 4324040 },
  { id: '8track_crowd_3', expectedSize: 4324040 },
  { id: '8track_crowd_4', expectedSize: 4324040 },
  { id: '8track_crowd_5', expectedSize: 4324040 },
  { id: '8track_crowd_6', expectedSize: 4324040 },
  { id: '8track_crowd_7', expectedSize: 4324040 },
  { id: '8track_crowd_8', expectedSize: 4324040 },

  { id: '8track_traffic_1', expectedSize: 4322786 },
  { id: '8track_traffic_2', expectedSize: 4322786 },
  { id: '8track_traffic_3', expectedSize: 4322786 },
  { id: '8track_traffic_4', expectedSize: 4322786 },
  { id: '8track_traffic_5', expectedSize: 4322786 },
  { id: '8track_traffic_6', expectedSize: 4322786 },
  { id: '8track_traffic_7', expectedSize: 4322786 },
  { id: '8track_traffic_8', expectedSize: 4322786 },
];

// 【核心】计算 GLOBAL_TOTAL_SIZE（算出来的，但不可篡改）
export const GLOBAL_TOTAL_SIZE = ASSET_LIST.reduce((sum, asset) => sum + asset.expectedSize, 0);
export const GLOBAL_TOTAL_SIZE_MB = GLOBAL_TOTAL_SIZE / 1024 / 1024;

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 国内渠道：腾讯云主源 + Gitee备源
  // 海外渠道：ghproxy.net 加速镜像 → mirror.ghproxy.com → GitHub官方 → 腾讯云备源
  if (isGooglePlay) {
    // Google渠道：ghproxy.net 加速镜像（主源）→ mirror.ghproxy.com → GitHub官方 → 腾讯云备源
    const MIRROR_URL = 'https://ghproxy.net/';
    const MIRROR_URL_2 = 'https://mirror.ghproxy.com/';
    console.log(`[DownloadService] Google渠道配置双加速源: A= \`${MIRROR_URL}\`, B= \`${MIRROR_URL_2}\``);
    return [
      `${MIRROR_URL}${GITHUB_URL}${filename}`,    // ghproxy.net 加速镜像（主源）
      `${MIRROR_URL_2}${GITHUB_URL}${filename}`,  // mirror.ghproxy.com（备源）
      `${GITHUB_URL}${filename}`,                  // GitHub官方
      `${TENCENT_CLOUD_URL}${filename}`            // 腾讯云备源
    ];
  }
  // 国内渠道：Gitee 主源 + 腾讯云备源（如果 Gitee 不可用）
  return [
    `${GITEE_URL}${filename}`,
    `${TENCENT_CLOUD_URL}${filename}`
  ];
};

export const getDownloadUrl = (id: string) => {
  const asset = AUDIO_MANIFEST.find(item => item.id === id);
  if (!asset) {
    console.error(`[audioAssets] Asset not found: ${id}`);
    return [];
  }
  return getDownloadUrlByChannel(IS_GOOGLE_PLAY_VERSION, asset.filename);
};
