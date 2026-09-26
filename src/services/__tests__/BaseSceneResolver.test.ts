/**
 * 【复现型回归 · 无效 scene ID】resolveBaseScene 决策核心。
 *
 * 咬过的 bug（不是假想敌）：AudioService 的 TrackChanged 兜底在「下一首 id 查不到场景」时，
 *   曾用字面量伪造对象赋给 currentBaseScene（tsc 报 TS2352 @旧 AudioService.ts:560,35）：
 *       this.currentBaseScene = { id, title, filename: '', category, duration: 0 } as Scene;
 *   三条后果链，本文件逐条锁死：
 *     ① 非法 id 必须判定失败且不产出任何 Scene 实例 —— 旧行为是产出一个假场景；
 *     ② 判定成功时 filename 必为非空串 —— filename:'' 会让 buildTrackForScene 的
 *        getLocalPath(category, '') 拼出无效播放/下载路径（这正是"能点但永远起不来"的形态）；
 *     ③ duration 不是 Scene 字段（tsc TS2339 @AudioService.ts:1726,27），假对象靠断言蒙混，
 *        故 ok:true 的返回值必须是全局索引里的真实实例（引用相等），杜绝任何合成对象。
 *
 * 「未污染 currentBaseScene / 未 notifyListeners」属 AudioService 实例内部时序，纯函数层无法直接断言；
 *   本批以「决策核心返回 ok:false」+「tsc diff 中 TS2352(560,35) 消失」作为机器可验证的等价证据：
 *   伪造字面量已从源码移除，调用方在 ok:false 分支不再赋值、不再广播。
 */

// scenes.ts → audioAssets.ts 依赖 @dr.pogodin/react-native-fs（ESM-only），jest 需先打桩，
// 与 BuiltinSceneIntegrity.test.ts 保持同一 mock 口径。
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
}));

import { SCENES } from '../../constants/scenes';
import { resolveBaseScene } from '../BaseSceneResolver';

describe('resolveBaseScene — 复现旧 TrackChanged 伪造兜底', () => {
  it('① 历史下架 id（曾拼错的 life_rain_urban）→ 判定失败，且不返回任何 Scene 实例', () => {
    const r = resolveBaseScene('life_rain_urban');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unknown-id');
      expect(r.invalidId).toBe('life_rain_urban');
      // 关键：不存在 'scene' 键 —— 旧实现在这里会给出一个 filename:'' 的假场景
      expect((r as { scene?: unknown }).scene).toBeUndefined();
    }
  });

  it('① 任意不存在的 id 一律失败，绝不合成兜底对象', () => {
    for (const id of ['nature_oceanx', 'SCENE_NOT_EXIST', '8track_01', 'bg_nature_ocean']) {
      const r = resolveBaseScene(id);
      expect(r.ok).toBe(false);
      expect((r as { scene?: unknown }).scene).toBeUndefined();
    }
  });

  it('② 合法 id → 返回全局索引中的真实实例（引用相等），filename 必为非空串', () => {
    const r = resolveBaseScene('nature_ocean');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scene).toBe(SCENES.find((s) => s.id === 'nature_ocean'));
      expect(typeof r.scene.filename).toBe('string');
      expect(r.scene.filename.length).toBeGreaterThan(0);
      // 旧假对象特征：filename 空 + 带 duration 字段。真场景不应带这个伪造字段。
      expect((r.scene as unknown as { duration?: unknown }).duration).toBeUndefined();
    }
  });

  it('② 全量场景：每个 id 都能解析，且 filename 非空（下游 URL/路径不可能拿到空串）', () => {
    for (const s of SCENES) {
      const r = resolveBaseScene(s.id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.scene.filename.trim().length).toBeGreaterThan(0);
    }
  });

  it('③ 空串 / 空白 / null / undefined → empty-id，不抛异常、不返回实例', () => {
    for (const bad of ['', '   ', null, undefined]) {
      const r = resolveBaseScene(bad as string | null | undefined);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('empty-id');
      expect((r as { scene?: unknown }).scene).toBeUndefined();
    }
  });

  it('③ 带首尾空白的合法 id 可被容忍（持久化值常见脏格式）', () => {
    const r = resolveBaseScene('  city_rain_urban  ');
    expect(r.ok).toBe(true);
  });
});
