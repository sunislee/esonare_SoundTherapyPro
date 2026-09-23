/**
 * RecommendationEngine 全量回归测试 —— 证明离线规则引擎的确定性、合法性与去重生效。
 *
 * 覆盖三层：
 *  1) 纯函数全组合枚举（24h × 4 mood × {null + 5 scene_id} lastScene × {0,90} duration = 1152）：
 *     无空结果 / scene_id 恒为合法真实 id / confidence∈[0,1] / 同输入必同输出（确定性）。
 *  2) 多样性去重可翻转：lastScene 命中默认赢家时，推荐必须改变。
 *  3) mood='unknown'（首页真实接线）专项：遍历 24h × recentScenes 组合，可达场景集合 = 全部 5 个，
 *     且逐时段反馈模拟下不存在长度≤2的推荐循环；并保留「真实 mood 路径按原权重生效」的反证，
 *     证明 graded recency 去重只新增于 unknown 分支、未改动已验证逻辑。
 *
 * 注：本测试隔离引擎的纯打分逻辑，故 mock 掉 SCENES（其会连带引入 RN/RNFS/资源清单等重依赖）。
 *     resolveName / getSceneVisual 在 SCENES=[] 时走兜底分支，不影响 scene_id 层面的断言。
 */

// 隔离引擎对 scenes.ts 的依赖（scenes.ts 顶层 import react-native + @dr.pogodin/react-native-fs）。
jest.mock('../../constants/scenes', () => ({ SCENES: [] }));

import { RecommendationEngine, getSceneVisual, Mood, UserState, pushRecentScenes } from '../RecommendationEngine';

/** 引擎必须落在这 5 个真实可播放 scene_id 上（与 scenes.ts 对齐；若改名需同步此处）。 */
const EXPECTED_IDS = [
  'city_rain_urban',
  'interactive_white_noise',
  'nature_forest',
  'nature_ocean',
  'healing_zen_bowl',
] as const;
const VALID = new Set<string>(EXPECTED_IDS);

/** buildReason 允许回传的 reason key 白名单（与 locales recommend.reason.* 对齐）。 */
const REASON_KEYS = new Set<string>([
  'recommend.reason.night',
  'recommend.reason.morning',
  'recommend.reason.midday',
  'recommend.reason.mood_anxious',
  'recommend.reason.mood_fatigued',
  'recommend.reason.mood_calm',
  'recommend.reason.mood_happy',
  'recommend.reason.avoid_recent',
  'recommend.reason.rest',
  'recommend.reason.default',
]);

/** CJK 统一表意文字区间，用于断言引擎返回值绝不夹带中文硬编码串。 */
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

const MOODS: Mood[] = ['calm', 'anxious', 'fatigued', 'happy'];
const LAST_SCENES: Array<string | null> = [null, ...EXPECTED_IDS];
const DURATIONS = [0, 90]; // 90 > OVER_IMMERSION_MINUTES(60)，触发过度沉浸保护

// mood='unknown' 专项：枚举最近收听环形窗口的所有有序组合（长度 0..RECENT_WINDOW_FOR_TEST，元素不重复）。
const RECENT_WINDOW_FOR_TEST = 4;
const buildRecentCombos = (): string[][] => {
  const combos: string[][] = [];
  const build = (cur: string[]) => {
    combos.push(cur.slice());
    if (cur.length >= RECENT_WINDOW_FOR_TEST) return;
    for (const id of EXPECTED_IDS) if (!cur.includes(id)) build([id, ...cur]);
  };
  build([]);
  return combos;
};

describe('RecommendationEngine.recommend — 全组合合法性与确定性', () => {
  test('1152 组合：无空结果 / scene_id 合法 / confidence∈[0,1] / 确定性', () => {
    let combos = 0;
    for (let hour = 0; hour < 24; hour++) {
      for (const mood of MOODS) {
        for (const lastScene of LAST_SCENES) {
          for (const listeningDuration of DURATIONS) {
            const state = { hour, mood, lastScene, listeningDuration };
            const rec = RecommendationEngine.recommend(state);
            combos += 1;

            expect(rec).toBeTruthy();
            expect(typeof rec.sceneId).toBe('string');
            expect(rec.sceneId.length).toBeGreaterThan(0);
            expect(VALID.has(rec.sceneId)).toBe(true); // 无非法 scene_id
            expect(typeof rec.sceneName).toBe('string');
            expect(rec.sceneName.startsWith('scenes.')).toBe(true); // sceneName 恒为 i18n key，非中文
            expect(typeof rec.reasonKey).toBe('string');
            expect(REASON_KEYS.has(rec.reasonKey)).toBe(true); // reasonKey ∈ 白名单
            if (rec.reasonParams !== undefined) {
              expect(typeof rec.reasonParams).toBe('object'); // params 合法（如提供）
            }
            expect(rec.confidence).toBeGreaterThanOrEqual(0);
            expect(rec.confidence).toBeLessThanOrEqual(1);

            // 确定性：相同输入两次结果完全一致
            const again = RecommendationEngine.recommend(state);
            expect(again.sceneId).toBe(rec.sceneId);
            expect(again.confidence).toBeCloseTo(rec.confidence, 10);
          }
        }
      }
    }
    expect(combos).toBe(24 * MOODS.length * LAST_SCENES.length * DURATIONS.length); // 1152
  });

  test('引擎返回值零中文：recommend() 不得夹带任何硬编码中文字符串', () => {
    const assertNoCJK = (rec: ReturnType<typeof RecommendationEngine.recommend>) => {
      expect(CJK.test(JSON.stringify(rec))).toBe(false);
    };
    // 真实 mood 全网格（含过度沉浸分支）。
    for (let hour = 0; hour < 24; hour++) {
      for (const mood of MOODS) {
        for (const lastScene of LAST_SCENES) {
          for (const listeningDuration of DURATIONS) {
            assertNoCJK(RecommendationEngine.recommend({ hour, mood, lastScene, listeningDuration }));
          }
        }
      }
    }
    // unknown 路径 recentScenes 组合（触发 avoid_recent / 时段等分支）。
    for (let hour = 0; hour < 24; hour++) {
      for (const rc of buildRecentCombos()) {
        assertNoCJK(RecommendationEngine.recommend({ hour, mood: 'unknown', recentScenes: rc, listeningDuration: 0 }));
      }
    }
  });

  test('getAllSceneSorted：返回全部 5 个合法场景且降序、含最佳项', () => {
    const list = RecommendationEngine.getAllSceneSorted({ hour: 3, mood: 'calm', listeningDuration: 0 });
    expect(list).toHaveLength(EXPECTED_IDS.length);
    const ids = list.map((r) => r.sceneId);
    expect(new Set(ids).size).toBe(EXPECTED_IDS.length); // 五个互不相同
    ids.forEach((id) => expect(VALID.has(id)).toBe(true));
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].confidence).toBeGreaterThanOrEqual(list[i].confidence);
    }
  });
});


describe('RecommendationEngine — 多样性去重生效', () => {
  test('lastScene 命中默认赢家时，推荐结果翻转（不锁死同一场景）', () => {
    const base = RecommendationEngine.recommend({ hour: 2, mood: 'calm', lastScene: null, listeningDuration: 0 });
    // 取该输入的默认赢家，再把它作为 lastScene 喂回，必须得到不同结果
    const withPenalty = RecommendationEngine.recommend({
      hour: 2,
      mood: 'calm',
      lastScene: base.sceneId,
      listeningDuration: 0,
    });
    expect(withPenalty.sceneId).not.toBe(base.sceneId);
  });

  test('集成向：模拟 HomeScreen 读真实 key(LAST_VIEWED_SCENE_ID) 后去重生效', () => {
    // HomeScreen.tsx 读取的 key = 'LAST_VIEWED_SCENE_ID'，写入方 = ImmersivePlayerNew.tsx:508 setItem(targetScene.id)。
    // 模拟用户最近刚在「迷雾森林」(nature_forest) 播放过 → 该 id 被写进 LAST_VIEWED_SCENE_ID。
    const storedLastViewed = 'nature_forest'; // AsyncStorage.getItem('LAST_VIEWED_SCENE_ID') 的返回值
    // HomeScreen 真实入参形态：mood 固定 'calm'、listeningDuration 固定 0，仅 lastScene 来自真实 key。
    const rec = RecommendationEngine.recommend({
      hour: new Date().getHours(),
      mood: 'calm',
      lastScene: storedLastViewed,
      listeningDuration: 0,
    });
    // 关键：读真实 key 后，引擎必须避开刚听过的 nature_forest。
    expect(rec.sceneId).not.toBe('nature_forest');
    expect(VALID.has(rec.sceneId)).toBe(true);
  });
});

describe('RecommendationEngine — mood=unknown（首页真实接线）可达性与反循环', () => {
  // 首页现以 mood='unknown' + recentScenes(RECENT_VIEWED_SCENE_IDS) 调用引擎。
  // 唯一验收标准：unknown 下遍历 24h × recentScenes 组合，可达场景集合 = 全部 5 个；且无长度≤2循环。

  test('可达集合 = 全部 5 个场景（24h × recentScenes 组合）', () => {
    const winners = new Set<string>();
    for (let hour = 0; hour < 24; hour++) {
      for (const rc of buildRecentCombos()) {
        const state: UserState = { hour, mood: 'unknown', recentScenes: rc, listeningDuration: 0 };
        winners.add(RecommendationEngine.recommend(state).sceneId);
      }
    }
    EXPECTED_IDS.forEach((id) => expect(winners.has(id)).toBe(true));
    // 反向：不应出现集合外的场景。
    expect([...winners].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  test('无长度≤2 的推荐循环（逐时段反馈模拟）', () => {
    for (let hour = 0; hour < 24; hour++) {
      let recent: string[] = [];
      const seq: string[] = [];
      for (let i = 0; i < 60; i++) {
        const state: UserState = { hour, mood: 'unknown', recentScenes: recent, listeningDuration: 0 };
        const id = RecommendationEngine.recommend(state).sceneId;
        seq.push(id);
        recent = pushRecentScenes(recent, id, RECENT_WINDOW_FOR_TEST);
      }
      // 取尾部判断是否陷入 period-1 / period-2 的循环翻转。
      for (const p of [1, 2]) {
        let isCycle = true;
        for (let i = seq.length - 1; i >= seq.length - p * 3; i--) {
          if (seq[i] !== seq[i - p]) { isCycle = false; break; }
        }
        expect(isCycle).toBe(false);
      }
    }
  });

  test('unknown 全组合合法性：无空结果 / scene_id 合法 / confidence∈[0,1] / 确定性', () => {
    let combos = 0;
    for (let hour = 0; hour < 24; hour++) {
      for (const rc of buildRecentCombos()) {
        for (const listeningDuration of DURATIONS) {
          const state: UserState = { hour, mood: 'unknown', recentScenes: rc, listeningDuration };
          const r1 = RecommendationEngine.recommend(state);
          combos += 1;
          expect(r1.sceneId.length).toBeGreaterThan(0);
          expect(VALID.has(r1.sceneId)).toBe(true);
          expect(r1.confidence).toBeGreaterThanOrEqual(0);
          expect(r1.confidence).toBeLessThanOrEqual(1);
          const r2 = RecommendationEngine.recommend(state); // 确定性
          expect(r2.sceneId).toBe(r1.sceneId);
        }
      }
    }
    expect(combos).toBeGreaterThan(0);
  });

  test('反证：真实 mood 路径仍按原权重生效（未改动已验证逻辑）', () => {
    // (a) calm 在 neutral 时段稳定推 forest/ocean（mood +0.4 压过 base），与原版一致。
    const calmNeutral = RecommendationEngine.recommend({ hour: 16, mood: 'calm', lastScene: null, listeningDuration: 0 });
    expect(['nature_forest', 'nature_ocean']).toContain(calmNeutral.sceneId);
    // (b) anxious 命中 meditation/white_noise（+0.4）。
    const anx = RecommendationEngine.recommend({ hour: 16, mood: 'anxious', lastScene: null, listeningDuration: 0 });
    expect(['healing_zen_bowl', 'interactive_white_noise']).toContain(anx.sceneId);
    // (c) 真实 mood 下 lastScene -0.25 单点去重仍生效（命中默认赢家则翻转）。
    const base = RecommendationEngine.recommend({ hour: 16, mood: 'calm', lastScene: null, listeningDuration: 0 });
    const flipped = RecommendationEngine.recommend({ hour: 16, mood: 'calm', lastScene: base.sceneId, listeningDuration: 0 });
    expect(flipped.sceneId).not.toBe(base.sceneId);
    // (d) 真实 mood 全组合下 5 场景仍全部可达（时段+情绪联合）。
    const winners = new Set<string>();
    for (let hour = 0; hour < 24; hour++) {
      for (const mood of MOODS) {
        for (const lastScene of LAST_SCENES) {
          winners.add(RecommendationEngine.recommend({ hour, mood, lastScene, listeningDuration: 0 }).sceneId);
        }
      }
    }
    EXPECTED_IDS.forEach((id) => expect(winners.has(id)).toBe(true));
  });
});

describe('getSceneVisual', () => {
  test('对全部合法 id 返回结构化对象（含兜底色）', () => {
    EXPECTED_IDS.forEach((id) => {
      const v = getSceneVisual(id);
      expect(v).toBeTruthy();
      expect(typeof v.title).toBe('string');
      expect(typeof v.color).toBe('string');
      expect(v.color.length).toBeGreaterThan(0);
    });
  });
});
