/**
 * RecommendationEngine —— 完全离线的声景推荐引擎（无网络、无后端）
 *
 * 设计要点：
 * - 纯函数式打分，相同 UserState 必得相同结果（确定性 / 可测）。
 * - 五个逻辑场景 key 映射到项目内真实可播放 scene_id（与 scenes.ts 对齐）。
 * - 场景中文名 / 缩略图 / 主色统一通过 SCENES 解析，保证与首页一致。
 *
 * 【运行期实际生效维度（截至 mood='unknown' 修复后）】
 * 引擎本身支持 4 个输入：hour / mood / lastScene(+recent 去重) / listeningDuration。HomeScreen 真实接线：
 *   - hour        : LIVE —— new Date().getHours()，来自设备时钟；驱动时段加分（夜间禅钵/雨声、午间白噪音…）。
 *   - recentScenes: LIVE —— AsyncStorage 'RECENT_VIEWED_SCENE_IDS'（环形最近4个；写入方 ImmersivePlayerNew
 *                   进入播放页时 recordViewedScene/pushRecentScenes），驱动 mood='unknown' 下的 graded recency
 *                   去重惩罚 [0.5,0.4,0.3,0.2]。lastScene 仍为真实 mood 路径的单点 -0.25 去重（未改动）。
 *   - mood        : INERT —— App 无情绪输入源，HomeScreen 传 'unknown' → 不注入任何 mood 加分。
 *                   （历史 bug：曾误传固定 'calm'，其 +0.4 > 时段 +0.3 恒定压过时段信号，使首页永不可达
 *                    meditation/rain/white_noise；现改 'unknown' 修正。）
 *   - listeningDuration : INERT —— 全项目无持久化写入方，HomeScreen 传固定 0，过度沉浸保护(>60min)永不触发。
 * 结论：线上可观测个性化 = hour + lastScene/recent 去重 主导；mood / listeningDuration 仍 inert。
 *      'unknown' 分支引入 graded recency 去重后，首页现已覆盖全部 5 个场景（见测试可达性断言）。
 * 详见回归测试 src/services/__tests__/RecommendationEngine.test.ts。
 */
import { SCENES } from '../constants/scenes';

export type Mood = 'calm' | 'anxious' | 'fatigued' | 'happy';
/** 引擎输入的情绪维度：四个真实情绪 + 'unknown'（无情绪信号 → 不产生任何 mood 加分）。 */
export type MoodInput = Mood | 'unknown';

/** 引擎支持的 5 个逻辑场景 key。 */
export type SceneKey = 'rain' | 'white_noise' | 'forest' | 'ocean' | 'meditation';

export interface UserState {
  /** 当前小时 0-23（由调用方传入，便于测试与离线计算）。 */
  hour: number;
  mood: MoodInput;
  /** 上次播放的场景 id（真实 scene_id；真实 mood 路径的单点去重用）。 */
  lastScene?: string | null;
  /** 最近收听场景，最新在前（mood='unknown' 的 graded recency 去重用）。 */
  recentScenes?: string[] | null;
  /** 今日已听时长（分钟），用于过度沉浸保护。 */
  listeningDuration: number;
}

export interface Recommendation {
  sceneId: string;
  /** 场景标题的 i18n key（scenes.<id>.title）；本地化交给渲染层 t()，引擎语言无关。 */
  sceneName: string;
  confidence: number; // 0-1
  /** 推荐理由的 i18n key（recommend.reason.*）；引擎只回传结构化 key，不拼自然语言串。 */
  reasonKey: string;
  /** reasonKey 的可选插值参数。 */
  reasonParams?: Record<string, string | number>;
}

/** buildReason 的结构化返回（引擎内部用）。 */
interface ReasonResult {
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
}

/** 逻辑 key -> 真实 scene_id + 兜底中文名（SCENES 查不到时使用）。 */
const LOGICAL_SCENES: Record<SceneKey, { sceneId: string; label: string }> = {
  rain: { sceneId: 'city_rain_urban', label: '城市夜雨' },
  white_noise: { sceneId: 'interactive_white_noise', label: '纯净白噪声' },
  forest: { sceneId: 'nature_forest', label: '迷雾森林' },
  ocean: { sceneId: 'nature_ocean', label: '深海之境' },
  meditation: { sceneId: 'healing_zen_bowl', label: '禅意颂钵' },
};

/** 并列分时的稳定优先级（保证确定性输出）。 */
const TIE_PRIORITY: SceneKey[] = ['meditation', 'rain', 'white_noise', 'forest', 'ocean'];

// mood='unknown'（无情绪信号）时的多样性去重：把惩罚从「仅上次」扩展到最近 RECENT_WINDOW 个，按 recency
// rank 递减扣分。rank0=0.5 足以把刚听过的 boosted(0.8) 压到 0.3 < base，破掉时段双加分场景（如深夜禅钵↔雨声）
// 的长度2循环；window=4 让无时段/情绪加分的 ocean 也能在其余四个都在窗口内时浮现。该分支仅在 mood==='unknown'
// 生效，真实 mood 路径的去重逻辑（-0.25 单点）保持原样未动。详见 RecommendationEngine.test.ts 可达性/反循环断言。
const RECENT_WINDOW = 4;
const RECENT_PENALTY: number[] = [0.5, 0.4, 0.3, 0.2]; // 按 recentScenes 下标(0=最近)递减；窗口外不扣
/** 最近收听环形窗口的 AsyncStorage key（沿用 LAST_VIEWED_SCENE_ID 的命名风格）。 */
export const RECENT_SCENES_KEY = 'RECENT_VIEWED_SCENE_IDS';

const BASE_SCORE = 0.5;
const TIME_BONUS = 0.3;
const MOOD_BONUS = 0.4;
const LAST_SCENE_PENALTY = 0.25; // 上次场景降分
const OVER_IMMERSION_FACTOR = 0.8; // 今日超 60 分钟 -> 全体 ×0.8（降 20%）
const OVER_IMMERSION_MINUTES = 60;
const CONFIDENCE_REF = 1.4; // 归一化基准：约等于「时间+情绪双命中」的强匹配分

/** 解析场景展示信息（名称 / 缩略图 / 主色），供卡片与列表复用。 */
export const getSceneVisual = (
  sceneId: string,
): { title: string; thumb: any; color: string } => {
  const found = SCENES.find((s) => s.id === sceneId);
  return {
    title: found?.title || '',
    thumb: found?.backgroundSource ?? null,
    color: found?.primaryColor || '#2d5a3d',
  };
};

const resolveName = (key: SceneKey): string => {
  const meta = LOGICAL_SCENES[key];
  // 引擎语言无关：恒定回传场景标题的 i18n key（scenes.<id>.title），本地化交给渲染层 t()。
  return `scenes.${meta.sceneId}.title`;
};

type Bucket = 'night' | 'morning' | 'midday' | 'neutral';

const bucketOf = (hour: number): Bucket => {
  if (hour >= 21 || hour < 6) return 'night';
  if (hour >= 6 && hour < 9) return 'morning';
  if (hour >= 12 && hour <= 14) return 'midday';
  return 'neutral';
};

/** 时间倾向：返回该时段加分的场景集合。 */
const timeBoosts = (bucket: Bucket): Partial<Record<SceneKey, number>> => {
  switch (bucket) {
    case 'night':
      return { meditation: TIME_BONUS, rain: TIME_BONUS };
    case 'morning':
      return { meditation: TIME_BONUS, forest: TIME_BONUS };
    case 'midday':
      return { white_noise: TIME_BONUS };
    default:
      return {};
  }
};

/** 情绪倾向：返回该情绪加分的场景集合。 */
const moodBoosts = (mood: MoodInput): Partial<Record<SceneKey, number>> => {
  switch (mood) {
    case 'anxious':
      return { meditation: MOOD_BONUS, white_noise: MOOD_BONUS };
    case 'fatigued':
      return { meditation: MOOD_BONUS, rain: MOOD_BONUS };
    case 'calm':
      return { forest: MOOD_BONUS, ocean: MOOD_BONUS };
    case 'happy':
      return { forest: MOOD_BONUS, ocean: MOOD_BONUS };
    default:
      return {};
  }
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

interface ScoredScene {
  key: SceneKey;
  sceneId: string;
  score: number;
}

/** 内部：计算全部场景得分（已应用多样性与过度沉浸惩罚）。 */
const scoreAll = (state: UserState): ScoredScene[] => {
  const bucket = bucketOf(state.hour);
  const tBoosts = timeBoosts(bucket);
  const mBoosts = moodBoosts(state.mood);
  const overImmersion = state.listeningDuration > OVER_IMMERSION_MINUTES;
  const recent = state.recentScenes ?? [];

  return TIE_PRIORITY.map((key) => {
    let score = BASE_SCORE;
    score += tBoosts[key] ?? 0;
    score += mBoosts[key] ?? 0;

    if (state.mood === 'unknown') {
      // 无情绪信号：用最近窗口 graded 去重，避免 neutral 时段全并列导致的 meditation↔rain 来回翻。
      const rank = recent.indexOf(LOGICAL_SCENES[key].sceneId);
      if (rank >= 0 && rank < RECENT_PENALTY.length) {
        score -= RECENT_PENALTY[rank];
      }
    } else if (state.lastScene && state.lastScene === LOGICAL_SCENES[key].sceneId) {
      // 真实 mood 路径：保持原版「上次场景 -0.25」单点去重（已验证逻辑，未改动）。
      score -= LAST_SCENE_PENALTY;
    }

    // 过度沉浸保护：全体降分 20%
    if (overImmersion) {
      score *= OVER_IMMERSION_FACTOR;
    }

    score = Math.max(0.02, score);
    return { key, sceneId: LOGICAL_SCENES[key].sceneId, score };
  });
};

/**
 * 构建推荐理由的结构化描述（i18n key + 可选参数）。
 * 引擎保持纯函数、语言无关：绝不拼任何自然语言串，本地化完全交给渲染层 t()。
 * 单一主理由按优先级择一返回：过度沉浸 > 时段 > 情绪 > 去重说明 > 兜底。
 */
const buildReason = (key: SceneKey, state: UserState): ReasonResult => {
  const bucket = bucketOf(state.hour);

  // 过度沉浸健康提醒优先（安全语义，独立于场景内容）。
  if (state.listeningDuration > OVER_IMMERSION_MINUTES) {
    return { reasonKey: 'recommend.reason.rest' };
  }

  // 时段理由：仅当该场景确实受当前时段加成时给出。
  if ((timeBoosts(bucket)[key] ?? 0) > 0) {
    if (bucket === 'night') return { reasonKey: 'recommend.reason.night' };
    if (bucket === 'morning') return { reasonKey: 'recommend.reason.morning' };
    if (bucket === 'midday') return { reasonKey: 'recommend.reason.midday' };
  }

  // 情绪理由：仅真实 mood 且该场景受其加成时给出。
  if (state.mood !== 'unknown' && (moodBoosts(state.mood)[key] ?? 0) > 0) {
    const moodKey: Record<Mood, string> = {
      anxious: 'recommend.reason.mood_anxious',
      fatigued: 'recommend.reason.mood_fatigued',
      calm: 'recommend.reason.mood_calm',
      happy: 'recommend.reason.mood_happy',
    };
    return { reasonKey: moodKey[state.mood] };
  }

  // 多样性去重说明：winner 命中最近/上次收听时给出。
  const sid = LOGICAL_SCENES[key].sceneId;
  const justSeen = (state.recentScenes?.includes(sid) ?? false) || state.lastScene === sid;
  if (justSeen) {
    return { reasonKey: 'recommend.reason.avoid_recent' };
  }

  return { reasonKey: 'recommend.reason.default' };
};

const byRank = (a: ScoredScene, b: ScoredScene): number =>
  b.score - a.score ||
  TIE_PRIORITY.indexOf(a.key) - TIE_PRIORITY.indexOf(b.key);

export const RecommendationEngine = {
  /** 返回单个最佳推荐。 */
  recommend(state: UserState): Recommendation {
    const top = scoreAll(state).sort(byRank)[0];
    return {
      sceneId: top.sceneId,
      sceneName: resolveName(top.key),
      confidence: clamp01(top.score / CONFIDENCE_REF),
      ...buildReason(top.key, state),
    };
  },

  /** 返回全部场景按推荐度降序排列。 */
  getAllSceneSorted(state: UserState): Recommendation[] {
    return scoreAll(state)
      .sort(byRank)
      .map((s) => ({
        sceneId: s.sceneId,
        sceneName: resolveName(s.key),
        confidence: clamp01(s.score / CONFIDENCE_REF),
        ...buildReason(s.key, state),
      }));
  },
};

/** 纯函数：把 sceneId 压到最近列表最前并去重、截断到 cap（默认 RECENT_WINDOW）。 */
export const pushRecentScenes = (prev: string[], id: string, cap: number = RECENT_WINDOW): string[] =>
  [id, ...prev.filter((x) => x !== id)].slice(0, cap);

export default RecommendationEngine;
