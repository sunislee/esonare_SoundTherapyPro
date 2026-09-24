/**
 * 冷启动「自动下载白名单」—— 精选高频非内置场景，单一真相源 (Single Source of Truth)。
 *
 * 背景（2026-09 · 满屏 loading 心烦）：旧实现冷启动把【全部】基础场景一次性塞进下载队列
 *   （HomeScreen「热启动自动下载」effect 遍历所有 isBaseScene → prioritizeScene），慢代理下
 *   整页转圈数分钟，观感像坏了。改为「精选自动 + 其余按需」：
 *     - 内置 5 场景（见 audioAssets.BUILTIN_SCENES）随包落盘，离线即 Ready，不进队列；
 *     - 本白名单（精选高频非内置）= 冷启动唯一自动入队的一批，只有它们会转圈；
 *     - 其余场景默认不排队 → 卡片显示安静的 ↓ 图标，点图标 / 进播放页时才按需 prioritizeScene。
 *
 * @architecture-constraint
 *   - 本数组是「冷启动自动下载范围」的唯一真相源：HomeScreen 仅对命中本名单的场景自动入队；
 *     新增/调整自动下载场景只改这里，禁止在 UI 层散落 id 特判。
 *   - 元素必须是【非内置】场景 id（内置由 BuiltinAssetBootstrap 落盘，绝不进下载队列），
 *     且必须存在于 SCENES —— 由 downloadWhitelist.test.ts 逐条锁死，防拼错静默失效。
 *   - 选取口径：按 scenes.SCENE_ORDER 展示优先级取【非内置】头部（order 越小越高频/越靠前）。
 */

/** 冷启动自动下载的精选高频非内置场景 id（SCENE_ORDER 头部，6~8 个）。 */
export const CURATED_DOWNLOAD_SCENE_IDS: readonly string[] = [
  'nature_ocean',            // order 1  海洋
  'nature_forest',           // order 2  森林
  'nature_river',            // order 5  晨间河畔（跳过内置 deep_sea/misty_forest）
  'nature_night',            // order 6  静夜
  'manual_morning_forest',   // order 7  晨曦森林
  'manual_serene_lakeside',  // order 8  宁静湖畔
  'manual_starlit_wilderness',// order 9  星空旷野
  'life_rain_boat',          // order 11 舟上雨（跳过内置 city_rain_urban）
];

/** 快速成员判定集合（模块级，避免每次渲染重建）。 */
export const CURATED_DOWNLOAD_SCENE_ID_SET: ReadonlySet<string> = new Set(
  CURATED_DOWNLOAD_SCENE_IDS,
);
