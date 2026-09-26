// @fileoverview 内置场景就绪编排器 · 永久 0% 死局的复现与治好不变式。
//
// 【为什么先红】本文件锁死的不是"实现细节"，而是用户唯一可见的症状：
//   内置卡片缺文件时，必须【最终可达 Ready/100%】，绝不允许停在 downloading/0%。
//   三条断言全部针对 HomeScreen.prioritizeScene 内置分支的现有语义（runBuiltinReadinessLegacy），
//   因此在修复前必然为红 —— 这是"根因被证明"而非"根因被读出来"。
//
// 【三方合谋的死局】
//   sceneCardStatus.ts:51 `if (isBuiltin) return 'downloading'` → UI 层内置未就绪无条件钉死『正在准备』；
//   HomeScreen 丢弃 reensure() 返回值且失败不重拷 → 拷贝失败被静默吞掉；
//   轮询超时仅 clearDownloadTimer → 本轮会话内再无自愈路径。
//   ⇒ 推论：补 error 出口无效（被 :51 吃掉），唯一治法是让 audioReady 必然可达。
//
// store 经 audioAssets 触达 @dr.pogodin/react-native-fs(原生模块)，本测试只用纯函数与内存 Map，
//   stub 掉 audioAssets 切断 RNFS 链（沿用 sceneOrphanErrorSweep.test.ts 的既有惯例）。
jest.mock('../../constants/audioAssets', () => ({ AUDIO_MANIFEST: [] }));

import { tickScene, getSceneDownloadState, _resetForTest } from '../SceneDownloadStore';
import {
  runBuiltinReadinessLegacy,
  ensureBuiltinReady,
  BuiltinReadinessDeps,
} from '../builtinReadiness';

const SCENE = 'city_rain_urban'; // 真实内置 id（历史漂移过的高敏感场景）
const OPTS = { pollMs: 2_000, capMs: 180_000, maxCopyAttempts: 3 };

/** 可控磁盘真相：copyOnce 成功时置 ready，模拟「重拷 → 落盘」因果。 */
const makeWorld = (opts?: { failCopiesUntil?: number; alwaysFail?: boolean }) => {
  const world = { diskReady: false, copyCalls: 0 };
  const deps: BuiltinReadinessDeps = {
    isDiskReady: async () => world.diskReady,
    copyOnce: async () => {
      world.copyCalls += 1;
      if (opts?.alwaysFail) return false;
      if (world.copyCalls >= (opts?.failCopiesUntil ?? 1)) world.diskReady = true; // 落盘
      return world.diskReady;
    },
    tick: (id, state) => tickScene(id, state),
  };
  return { world, deps };
};

beforeEach(() => {
  _resetForTest();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ────────────────────────────────────────────────────────────────────────
// 【反例基线 · 已废弃实现的行为快照】runBuiltinReadinessLegacy 不再被任何生产代码引用。
//   本组断言【取反锁定】它的死局特征，作用有二：① 把"永久 0%"的根因永久钉进回归网；
//   ② 一旦有人误把 legacy 接回生产，这三条会立刻变成误导（届时应整组删除）。
//   修复前的红→绿证据链见 docs/reports/2026-09-25-ghost-tabs-and-zero-percent.md §④。
// ────────────────────────────────────────────────────────────────────────
describe('内置场景就绪 · 【反例基线】legacy 语义的死局特征（禁止接入生产）', () => {
  test('缺陷① fire-and-forget：整轮只拷 1 次即放弃，绝不重试', async () => {
    const { world, deps } = makeWorld({ alwaysFail: true });
    const p = runBuiltinReadinessLegacy(SCENE, deps, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 10_000);
    await p;

    expect(world.copyCalls).toBe(1); // 治好版要求 > 1（见下方 ensureBuiltinReady 组）
  });

  test('缺陷② 超时仅停轮询：推进 180s 后账本仍停在 downloading/0%（永久 0% 本体）', async () => {
    const { deps } = makeWorld({ alwaysFail: true });
    const p = runBuiltinReadinessLegacy(SCENE, deps, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 10_000);
    await p;

    const st = getSceneDownloadState(SCENE);
    expect(st).not.toBeNull();
    // 死局特征：status/progress 双双卡死；UI 层 sceneCardStatus.ts:51 据此显示『正在准备』且永不翻转。
    expect(st!.status === 'downloading' && st!.progress === 0).toBe(true);
  });

  test('缺陷③ 第 3 次重拷才成功的场景，legacy 永远等不到（只拷一次 → 磁盘永不落盘）', async () => {
    const { world, deps } = makeWorld({ failCopiesUntil: 3 });
    const p = runBuiltinReadinessLegacy(SCENE, deps, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 60_000);
    await p;

    expect(world.copyCalls).toBe(1); // 第 2、3 次机会根本没发生
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 0, status: 'downloading' });
  });
});

describe('内置场景就绪 · 【治好】ensureBuiltinReady 不变式', () => {
  test('缺文件、第 3 次重拷成功 → Ready/100%', async () => {
    const { world, deps } = makeWorld({ failCopiesUntil: 3 });
    const p = ensureBuiltinReady(SCENE, deps, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 60_000);
    await expect(p).resolves.toBe('ready');

    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 100, status: 'ready' });
    expect(world.copyCalls).toBe(3);
  });

  test('磁盘已就绪 → 立即 Ready/100%，且不浪费一次拷贝', async () => {
    const { world, deps } = makeWorld();
    world.diskReady = true;
    await expect(ensureBuiltinReady(SCENE, deps, OPTS)).resolves.toBe('ready');
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 100, status: 'ready' });
    expect(world.copyCalls).toBe(0);
  });

  test('拷贝全失败 → 绝不写 error（内置与网络无关），但必须已安排下一次重试', async () => {
    const { world, deps } = makeWorld({ alwaysFail: true });
    const p = ensureBuiltinReady(SCENE, deps, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 10_000);
    const outcome = await p;

    expect(outcome).toBe('pending-retry'); // 非死局：调用方须安排下一次
    expect(world.copyCalls).toBeGreaterThanOrEqual(OPTS.maxCopyAttempts!);
    const st = getSceneDownloadState(SCENE)!;
    expect(st.status).not.toBe('error'); // 【铁律】内置永不 error（sceneCardStatus.ts:51 也翻不动它）
  });

  test('进度必须单调不回退（防止 ready 后被迟到的 tick 打回 0%）', async () => {
    const seen: number[] = [];
    const { world, deps } = makeWorld({ failCopiesUntil: 2 });
    const spy: BuiltinReadinessDeps = {
      ...deps,
      tick: (id, s) => {
        seen.push(s.progress);
        tickScene(id, s);
      },
    };
    world.diskReady = false;
    const p = ensureBuiltinReady(SCENE, spy, OPTS);
    await jest.advanceTimersByTimeAsync(OPTS.capMs + 60_000);
    await p;

    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBe(100);
  });
});
