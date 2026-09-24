// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import { NativeModules, Platform } from 'react-native'; 
import * as RNFS from '@dr.pogodin/react-native-fs';

const nativeChannel =
  Platform.OS === 'android' && NativeModules?.CrashReport?.getChannel
    ? NativeModules.CrashReport.getChannel()
    : null;

export const IS_GOOGLE_PLAY_VERSION = nativeChannel ? nativeChannel === 'googlePlay' : true;

export const GITHUB_URL = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/';
export const GHPROXY_URL = 'https://ghproxy.net/';

// 【国内最稳 GitHub Proxy 加速源】2025年最新可用
export const GHPROXY_NET_URL = 'https://ghproxy.net/https://raw.githubusercontent.com/';
export const MIRROR_GHPROXY_URL = 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/';
export const STATICALLY_URL = 'https://cdn.statically.io/gh/sunislee/sound-therapy-assets/main/';

// 【实测 2026-09-24 · curl 594KB 样本 / 宿主机直连】各源真实可用性与时延（ttfb / total）：
//   ghproxy.net        1.7s / 7.4s   ← 最快，主源
//   gh-proxy.com       6.8s / 7.7s   ← 实测活源
//   cdn.jsdelivr.net   7.4s / 8.8s   ← 实测活源（全球 CDN）
//   ghfast.top         7.5s / 9.3s   ← 实测活源
//   cdn.statically.io 11.7s / …      ← 活但极慢（且经 301 跳转）
//   raw.githubusercontent.com        ← 大陆污染性 404，仅海外直连兜底
//   mirror.ghproxy.com  http=000     ← 【已死】设备侧累计 158 次失败全砸在它身上 → 从故障转移链摘除
export const GH_PROXY_COM_URL = 'https://gh-proxy.com/https://raw.githubusercontent.com/';
export const GHFAST_TOP_URL = 'https://ghfast.top/https://raw.githubusercontent.com/';
export const JSDELIVR_URL = 'https://cdn.jsdelivr.net/gh/sunislee/sound-therapy-assets@main/';

/** 仓库 main 分支路径前缀（供各家 GitHub 代理拼接）。 */
const REPO_MAIN_PREFIX = 'sunislee/sound-therapy-assets/main/';

// 优先使用 ghproxy（kkgithub 国内已不可用）
export const PRIMARY_REMOTE_RESOURCE_BASE_URL = GHPROXY_NET_URL + 'sunislee/sound-therapy-assets/main/';
export const SECONDARY_REMOTE_RESOURCE_BASE_URL = MIRROR_GHPROXY_URL + 'sunislee/sound-therapy-assets/main/';
export const REMOTE_RESOURCE_BASE_URL = PRIMARY_REMOTE_RESOURCE_BASE_URL;

export const LOCAL_RESOURCE_PATH = `${RNFS.DocumentDirectoryPath}/audio_resources`; 

export const getLocalPath = (category: string, filename: string) => { 
    // 【🔥 v10 修复】正确处理 category 子目录（如 scene_backgrounds/zen）
    // 之前只用了 filename，导致背景图下载后找不到（路径不一致）
    const hasSubPath = category.includes('/');
    const subDir = hasSubPath ? category.replace(/^scene_backgrounds\//, '') : '';
    // 【 降噪音频修复】路径中的空格会导致 react-native-sound 在 Android 上加载失败
    // 将空格统一替换为下划线：noise reduction → noise_reduction
    const normalizedFilename = filename.replace(/ /g, '_');
    const rawPath = subDir 
        ? `${LOCAL_RESOURCE_PATH}/${subDir}/${normalizedFilename}` 
        : `${LOCAL_RESOURCE_PATH}/${normalizedFilename}`;
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

  // 【消失在雨中的老唱片店】录音机场景音频资源（复用现有资源）
  RECORD_SHOP_CRACKLE: 'interactive/white_noise.m4a',
  RECORD_SHOP_DOOR_CHIME: 'interactive/wind-chime.m4a',
  RECORD_SHOP_FOOTSTEPS: 'interactive/match_strike.wav',
  RECORD_SHOP_VINYL_POP: 'interactive/apple_crunch.m4a',
  RECORD_SHOP_RADIO_TUNING: 'western_church/western_church_morning_bell.m4a',
};

export const AUDIO_MANIFEST = [ 
  { id: 'nature_ocean', filename: 'base/deep_ocean_abyss.m4a', category: 'nature', title: 'scenes.nature_ocean.title', description: 'scenes.nature_ocean.desc', size: 1429191 }, 
  { id: 'nature_forest', filename: 'base/misty_woods_dripping.m4a', category: 'nature', title: 'scenes.nature_forest.title', description: 'scenes.nature_forest.desc', size: 680336 }, 
  { id: 'nature_deep_sea', filename: 'base/deep_sea_breathing_rhythm.m4a', category: 'nature', title: 'scenes.nature_deep_sea.title', description: 'scenes.nature_deep_sea.desc', size: 456030 },
  { id: 'nature_misty_forest', filename: 'base/foggy_forest_ritual.m4a', category: 'nature', title: 'scenes.nature_misty_forest.title', description: 'scenes.nature_misty_forest.desc', size: 1732906 },
  { id: 'nature_river', filename: 'base/morning_river_base.m4a', category: 'nature', title: 'scenes.nature_river.title', description: 'scenes.nature_river.desc', size: 1906585 }, 
  { id: 'nature_night', filename: 'base/night_tribe.mp3', category: 'nature', title: 'scenes.nature_night.title', description: 'scenes.nature_night.desc', size: 7201196 },

  { id: 'manual_morning_forest', filename: 'base/offroad_avenue.m4a', category: 'nature', title: 'scenes.manual_morning_forest.title', description: 'scenes.manual_morning_forest.desc', size: 784448 },
  { id: 'manual_serene_lakeside', filename: 'base/moonlight.m4a', category: 'nature', title: 'scenes.manual_serene_lakeside.title', description: 'scenes.manual_serene_lakeside.desc', size: 594199 },
  { id: 'manual_starlit_wilderness', filename: 'base/star_glass.m4a', category: 'nature', title: 'scenes.manual_starlit_wilderness.title', description: 'scenes.manual_starlit_wilderness.desc', size: 466422 },

  { id: 'life_rain_boat', filename: 'base/rain_boat.mp3', category: 'life', title: 'scenes.life_rain_boat.title', description: 'scenes.life_rain_boat.desc', size: 7201196 }, 
  { id: 'life_bookstore', filename: 'fx/library_vibe.m4a', category: 'life', title: 'scenes.life_bookstore.title', description: 'scenes.life_bookstore.desc', size: 907157 },
  { id: 'life_record_shop', filename: 'base/rain_boat.mp3', category: 'life', title: 'scenes.life_record_shop.title', description: 'scenes.life_record_shop.desc', size: 7201196 },
  { id: 'life_record_shop_vinyl_crackle', filename: AMBIENT_RESOURCES.RECORD_SHOP_CRACKLE, category: 'life', title: 'scenes.life_record_shop_vinyl_crackle.title', description: 'scenes.life_record_shop_vinyl_crackle.desc', size: 69881 },
  { id: 'life_record_shop_door_chime', filename: AMBIENT_RESOURCES.RECORD_SHOP_DOOR_CHIME, category: 'life', title: 'scenes.life_record_shop_door_chime.title', description: 'scenes.life_record_shop_door_chime.desc', size: 256806 },
  { id: 'life_record_shop_footsteps', filename: AMBIENT_RESOURCES.RECORD_SHOP_FOOTSTEPS, category: 'life', title: 'scenes.life_record_shop_footsteps.title', description: 'scenes.life_record_shop_footsteps.desc', size: 846284 },
  { id: 'life_record_shop_vinyl_pop', filename: AMBIENT_RESOURCES.RECORD_SHOP_VINYL_POP, category: 'life', title: 'scenes.life_record_shop_vinyl_pop.title', description: 'scenes.life_record_shop_vinyl_pop.desc', size: 32853 },
  { id: 'life_record_shop_radio_tuning', filename: AMBIENT_RESOURCES.RECORD_SHOP_RADIO_TUNING, category: 'life', title: 'scenes.life_record_shop_radio_tuning.title', description: 'scenes.life_record_shop_radio_tuning.desc', size: 194690 },

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

  { id: 'oriental_zen_monastery', filename: 'zen/zen_bell.mp3', category: 'oriental', title: 'scenes.oriental_zen_monastery.title', description: 'scenes.oriental_zen_monastery.desc', size: 482184 },
  { id: 'oriental_tibetan_bowl', filename: 'zen/zen_bowl.mp3', category: 'oriental', title: 'scenes.oriental_tibetan_bowl.title', description: 'scenes.oriental_tibetan_bowl.desc', size: 595869 },
  { id: 'oriental_morning_buddha', filename: 'zen/zen_hum.m4a', category: 'oriental', title: 'scenes.oriental_morning_buddha.title', description: 'scenes.oriental_morning_buddha.desc', size: 822079 },

  // ── Esonare EQ 新场景（CDN 下载，运行时从资源仓库拉取）──
  { id: 'city_rain_urban', filename: 'city_rain/roofusj.m4a', category: 'life', title: 'scenes.city_rain_urban.title', description: 'scenes.city_rain_urban.desc', size: 6041646 },

  // 8 轨音频资源（降噪实验室 EQ 调节用）
  // 【🔥 回归修复】恢复 8 条 balanced track 条目。
  // 66edb405 误将这 8 条替换为单文件 8track_balanced_m4a，但 NoiseResourceChecker 与 8TrackAudioService
  // 仍按 {folder}_track_N.mp3 检查/加载 8 轨 → balanced 组永远 not-ready → NoiseLab 卡"资源准备中"。
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

  // 东方禅意场景背景图（7张，zen/ 子目录）
  { id: 'bg_zen_temple_lantern_gate', filename: 'zen/bg_temple_lantern_gate.webp', category: 'scene_backgrounds', title: '东方禅意灯笼门', description: '场景背景图', size: 81976 },
  { id: 'bg_zen_temple_zen_lantern', filename: 'zen/bg_temple_zen_lantern.webp', category: 'scene_backgrounds', title: '东方禅意灯笼', description: '场景背景图', size: 76586 },
  { id: 'bg_zen_temple_roof', filename: 'zen/bg_temple_roof.webp', category: 'scene_backgrounds', title: '东方禅意屋顶', description: '场景背景图', size: 105480 },
  { id: 'bg_zen_bamboo_mist', filename: 'zen/bg_bamboo_mist.webp', category: 'scene_backgrounds', title: '东方禅意竹林', description: '场景背景图', size: 72590 },
  { id: 'bg_zen_bamboo_sunrise', filename: 'zen/bg_bamboo_sunrise.webp', category: 'scene_backgrounds', title: '东方禅意日出', description: '场景背景图', size: 70574 },
  { id: 'bg_zen_fountain_ritual', filename: 'zen/bg_fountain_ritual.webp', category: 'scene_backgrounds', title: '东方禅意喷泉', description: '场景背景图', size: 146774 },
  { id: 'bg_zen_guzheng_zen', filename: 'zen/bg_guzheng_zen.webp', category: 'scene_backgrounds', title: '东方禅意古筝', description: '场景背景图', size: 55704 },
  { id: 'bg_zen_buddha_morning', filename: 'zen/buddha_morning.webp', category: 'scene_backgrounds', title: '晨光佛意', description: '老僧古钟晨光场景背景图', size: 84908 },

  // 西方教会场景背景图（4张，根目录，第5张复用candlelight）
  { id: 'bg_western_church_candlelight', filename: 'western_church_candlelight.webp', category: 'scene_backgrounds', title: '西方教会烛光', description: '场景背景图', size: 150974 },
  { id: 'bg_western_church_corridor', filename: 'western_church_corridor.webp', category: 'scene_backgrounds', title: '西方教会走廊', description: '场景背景图', size: 205402 },
  { id: 'bg_western_church_light_rays', filename: 'western_church_light_rays.webp', category: 'scene_backgrounds', title: '西方教会光束', description: '场景背景图', size: 135480 },
  { id: 'bg_western_church_sunlight_monastery', filename: 'western_church_sunlight_monastery.webp', category: 'scene_backgrounds', title: '西方教会阳光修道院', description: '场景背景图', size: 223932 },
]; 

/**
 * 【内置场景 · single source of truth】
 * @architecture-constraint
 *   随 APK 打包、首启从 android_asset 拷入 DocumentDir 的核心场景，安装即离线可播、零网络。
 *   文件源位于 android/app/src/main/assets/sounds/builtin/（RNFS 以 file:///android_asset/... 读取）。
 *   ⚠️ 不要放 res/raw —— res/raw 是 react-native-sound MAIN_BUNDLE 专用，RNFS 读不了；两套别混。
 *   - isBuiltinScene()/BUILTIN_SCENE_IDS 是全局唯一判定源：DownloaderService.initQueue / bootstrap /
 *     OfflineService 就绪判定均以此为准，禁止在 UI 层散落场景 id 特判。
 *   - filename 必须与对应 AUDIO_MANIFEST[].filename 完全一致（basename），确保拷贝目标路径 ==
 *     getLocalPath() 的落盘路径，从而复用 OfflineService 既有的 exists+size 就绪真相判定。
 *   - expectedSize 与 AUDIO_MANIFEST.size 逐字节对齐（入库时已 md5+size 校验）。
 */
export const BUILTIN_SCENES: Readonly<Record<string, { filename: string; assetPath: string; expectedSize: number }>> = {
  // ⚠️ filename 必须与 AUDIO_MANIFEST[].filename 逐字节一致（含 base/ fx/ interactive/ city_rain/ 子目录前缀），
  //    否则 BuiltinAssetBootstrap 的落盘目标 ≠ OfflineService.getLocalPath(category, manifest.filename) 判定路径，
  //    内置短路会静默失效、场景回落下载。assetPath 相对路径镜像 filename。见 BuiltinSceneIntegrity.test.ts。
  city_rain_urban:           { filename: 'city_rain/roofusj.m4a',              assetPath: 'file:///android_asset/sounds/builtin/city_rain/roofusj.m4a',              expectedSize: 6041646 },
  nature_deep_sea:           { filename: 'base/deep_sea_breathing_rhythm.m4a', assetPath: 'file:///android_asset/sounds/builtin/base/deep_sea_breathing_rhythm.m4a', expectedSize: 456030 },
  nature_misty_forest:       { filename: 'base/foggy_forest_ritual.m4a',       assetPath: 'file:///android_asset/sounds/builtin/base/foggy_forest_ritual.m4a',       expectedSize: 1732906 },
  healing_zen_bowl:          { filename: 'fx/zen_bowl.m4a',                    assetPath: 'file:///android_asset/sounds/builtin/fx/zen_bowl.m4a',                    expectedSize: 391549 },
  interactive_white_noise:   { filename: 'interactive/white_noise.m4a',        assetPath: 'file:///android_asset/sounds/builtin/interactive/white_noise.m4a',        expectedSize: 69881 },
};

/** 内置场景 id 列表（唯一定义源）。 */
export const BUILTIN_SCENE_IDS: readonly string[] = Object.keys(BUILTIN_SCENES);

/** 该场景是否随包内置（唯一判定入口）。 */
export const isBuiltinScene = (sceneId: string): boolean => sceneId in BUILTIN_SCENES;


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
  { id: 'nature_river', expectedSize: 1906585 },        // 实际：1.82MB (新版本)
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
  
  // 东方禅意音频（3个，oriental/ 子目录）
  { id: 'oriental_zen_monastery', expectedSize: 482184 },    // zen/zen_bell.mp3
  { id: 'oriental_tibetan_bowl', expectedSize: 595869 },     // zen/zen_bowl.mp3
  { id: 'oriental_morning_buddha', expectedSize: 822079 },  // zen/zen_hum.m4a (sacred bell temple)
  { id: 'city_rain_urban', expectedSize: 6041646 },        // city_rain/roofusj.m4a (城市夜雨)
  
  { id: 'western_church_gregorian', expectedSize: 427392 },    // 实际：427KB
  { id: 'western_church_morning_bell', expectedSize: 194690 }, // 实际：195KB
  { id: 'western_church_holy_waves', expectedSize: 617365 },   // 实际：617KB
  { id: 'western_church_forest_echo', expectedSize: 732037 },  // 实际：732KB
  { id: 'western_church_urban_chant', expectedSize: 414572 },  // 实际：415KB
  { id: 'manual_morning_forest', expectedSize: 784448 },      // offroad_avenue.m4a
  { id: 'manual_serene_lakeside', expectedSize: 594199 },    // moonlight.m4a
  { id: 'manual_starlit_wilderness', expectedSize: 466422 }, // star_glass.m4a
  // 【消失在雨中的老唱片店】场景音频 + 随机 SFX
  { id: 'life_record_shop', expectedSize: 7201196 },        // rain_boat.mp3
  { id: 'life_record_shop_vinyl_crackle', expectedSize: 69881 }, // white_noise.m4a
  { id: 'life_record_shop_door_chime', expectedSize: 256806 },      // wind-chime.m4a
  { id: 'life_record_shop_footsteps', expectedSize: 846284 },      // match_strike.wav
  { id: 'life_record_shop_vinyl_pop', expectedSize: 32853 },      // apple_crunch.m4a
  { id: 'life_record_shop_radio_tuning', expectedSize: 194690 },   // morning_bell.m4a

  // 8 轨音频资源（降噪实验室 EQ 调节用）
  // 【回归修复】与 AUDIO_MANIFEST 保持一致，恢复 8 条 balanced track（详见上方注释）
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

  // 东方禅意场景背景图（7张，zen/ 子目录）
  { id: 'bg_zen_temple_lantern_gate', expectedSize: 81976 },
  { id: 'bg_zen_temple_zen_lantern', expectedSize: 76586 },
  { id: 'bg_zen_temple_roof', expectedSize: 105480 },
  { id: 'bg_zen_bamboo_mist', expectedSize: 72590 },
  { id: 'bg_zen_bamboo_sunrise', expectedSize: 70574 },
  { id: 'bg_zen_fountain_ritual', expectedSize: 146774 },
  { id: 'bg_zen_guzheng_zen', expectedSize: 55704 },
  { id: 'bg_zen_buddha_morning', expectedSize: 84908 },

  // 西方教会场景背景图（4张，根目录）
  { id: 'bg_western_church_candlelight', expectedSize: 150974 },
  { id: 'bg_western_church_corridor', expectedSize: 205402 },
  { id: 'bg_western_church_light_rays', expectedSize: 135480 },
  { id: 'bg_western_church_sunlight_monastery', expectedSize: 223932 },

   // 西方教会场景背景图（第5张复用 candlelight）
   // bg_western_church_forest_echo 复用 candlelight.webp，已在 AUDIO_MANIFEST 中定义，无需额外条目
];

// 【核心】计算 GLOBAL_TOTAL_SIZE（算出来的，但不可篡改）
export const GLOBAL_TOTAL_SIZE = ASSET_LIST.reduce((sum, asset) => sum + asset.expectedSize, 0);
export const GLOBAL_TOTAL_SIZE_MB = GLOBAL_TOTAL_SIZE / 1024 / 1024;

export const getDownloadUrlByChannel = (isGooglePlay: boolean, filename: string) => {
  // 【实测重排 · 2026-09-24】两条渠道统一走 getAssetUrls() 的实证活源序（死源 mirror.ghproxy 已摘除）。
  const urls = getAssetUrls(filename);
  if (!isGooglePlay) return urls;
  // 海外渠道：GitHub 官方直连最快最稳 → 前置，其余沿用实测序。
  return [`${GITHUB_URL}${encodeAssetPath(filename)}`, ...urls];
};

export const getDownloadUrl = (id: string) => {
  const asset = AUDIO_MANIFEST.find(item => item.id === id);
  if (!asset) {
    console.error(`[audioAssets] Asset not found: ${id}`);
    return [];
  }
  return getDownloadUrlByChannel(IS_GOOGLE_PLAY_VERSION, asset.filename);
};

// ════════════════════════════════════════════════════════════
// 【P1-1】统一 CDN 源生成 — 全 App 下载 URL 列表的唯一事实源 (Single Source of Truth)
// 【req#1 · 2026-09 curl 实证后重排】故障转移优先级：
//   ghproxy.net(可用但慢,主源) → cdn.statically.io(活但极慢,备源) → raw.githubusercontent.com(大陆污染性404,海外直连兜底)
//   → mirror.ghproxy.com(已死,降为末位；运行时由 DownloaderService 健康度冷却进一步跳过)。
// 各下载路径必须通过 getAssetUrls() 获取 URL 列表，消除历史上多处各自硬编码 base、互不一致的漂移问题。
// ════════════════════════════════════════════════════════════

/** 按段编码仓库相对路径（处理 'noise reduction' 等目录名中的空格） */
const encodeAssetPath = (path: string): string =>
    path.split('/').map(part => encodeURIComponent(part)).join('/');

/**
 * 【P1-1】返回某资源的 CDN URL 列表（按故障转移优先级排序）。
 * @param assetKey 资源 id（会查 AUDIO_MANIFEST 取仓库相对路径）或直接的仓库相对路径
 *                 （例如 'noise reduction/balanced_noise_track_1.mp3'、'base/deep_ocean_abyss.m4a'）
 */
export const getAssetUrls = (assetKey: string): string[] => {
    if (!assetKey) return [];
    const manifestItem = AUDIO_MANIFEST.find(item => item.id === assetKey);
    const repoPath = encodeAssetPath(manifestItem ? manifestItem.filename : assetKey);
    // 【实测排序 · 2026-09-24】只保留 curl 实证的活源，按真实时延升序；死源 mirror.ghproxy 已摘除。
    //   故障转移的意义在于"下一家真的能下"——旧列表里第 3/4 家在大陆必挂，
    //   等于每个文件白烧两轮超时，直接把整条串行队列拖成满屏失败/永久转圈。
    return [
        `${GHPROXY_NET_URL}${REPO_MAIN_PREFIX}${repoPath}`,   // 主源：实测最快 (ttfb 1.7s)
        `${GH_PROXY_COM_URL}${REPO_MAIN_PREFIX}${repoPath}`,  // 备源 2：实测活 (7.7s/594KB)
        `${GHFAST_TOP_URL}${REPO_MAIN_PREFIX}${repoPath}`,    // 备源 3：实测活 (9.3s/594KB)
        `${JSDELIVR_URL}${repoPath}`,                          // 备源 4：全球 CDN（注意 @main 语法）
        `${STATICALLY_URL}${repoPath}`,                        // 备源 5：活但极慢 (ttfb 11.7s) → 靠后
        `${GITHUB_URL}${repoPath}`,                            // 大陆污染性 404；海外直连末级兜底
    ];
};
