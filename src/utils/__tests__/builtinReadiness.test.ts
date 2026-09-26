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
  ensureBuiltinReadyWithRetry,
  nextBuiltinRetryDelayMs,
  abortBuiltinRetry,
  hasActiveBuiltinRetry,
  wakeBuiltinRetries,
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

// ════════════════════════════════════════════════════════════════════════
// 【A + C · stalled 终态与低频长周期自愈】（2026-09-26，C2b 取证结论落地）
//   A：快阶段耗尽 → attemptsExhausted=true（UI「本地准备受阻 · 点按重试」），status 仍 downloading。
//   C：stalled 后调度不停——指数退避长周期无限轮；每轮 copyOnce 即磁盘空间恢复探测；
//      wakeBuiltinRetries()（App 回前台信号）提前唤醒 + per-scene 冷却节流。
//   全程铁律不破：绝不写 error、ready 终态整体替换状态对象 = attemptsExhausted 自动清除。
// ════════════════════════════════════════════════════════════════════════
describe('内置场景就绪 · 【A+C】ensureBuiltinReadyWithRetry 调度不变式', () => {
  // 测试用压缩调度：单轮内部退避也压小，让整条快→慢时间线在毫秒级 fake time 内跑完。
  const OPTS_FAST = { pollMs: 50, capMs: 400, maxCopyAttempts: 2 };
  const SCHED = { fastRounds: 3, fastDelayMs: 1_000, backoffBaseMs: 2_000, backoffCapMs: 8_000, signalCooldownMs: 1_500 };

  test('退避曲线：快阶段固定间隔 → 慢阶段指数增长并封顶（低频长周期=磁盘恢复探测节奏）', () => {
    expect(nextBuiltinRetryDelayMs(1)).toBe(30_000); // round1/2 快阶段 30s
    expect(nextBuiltinRetryDelayMs(2)).toBe(30_000);
    expect(nextBuiltinRetryDelayMs(3)).toBe(60_000); // round3 末已标 stalled → 首个长周期 60s
    expect(nextBuiltinRetryDelayMs(4)).toBe(120_000);
    expect(nextBuiltinRetryDelayMs(5)).toBe(240_000);
    expect(nextBuiltinRetryDelayMs(6)).toBe(300_000); // 封顶后恒定，无限轮低频探测
    expect(nextBuiltinRetryDelayMs(50)).toBe(300_000);
  });

  test('【A】ENOSPC 持续失败 → 终态 stalled(90,downloading,attemptsExhausted) 且调度继续', async () => {
    const { world, deps } = makeWorld({ alwaysFail: true });
    // 慢阶段防闪断防线：stalled 出现后，任何时刻的 downloading 态都必须仍带 exhausted。
    const seenAfterStall: Array<{ progress: number; status?: string; attemptsExhausted?: boolean }> = [];
    let stalledReached = false;
    const spy: BuiltinReadinessDeps = {
      ...deps,
      tick: (id, s) => {
        if (s.attemptsExhausted) stalledReached = true;
        if (stalledReached) seenAfterStall.push(s);
        tickScene(id, s);
      },
    };
    const p = ensureBuiltinReadyWithRetry(SCENE, spy, OPTS_FAST, SCHED);

    // 快阶段(3轮+2×1s)全部失败后，store 必须翻出显式终态——C2b 里这里是永久的『资源正在下载』。
    await jest.advanceTimersByTimeAsync(6_000);
    const stalled = getSceneDownloadState(SCENE)!;
    expect(stalled).toEqual({ progress: 90, status: 'downloading', attemptsExhausted: true });

    // 【C】stalled ≠ 死局：慢阶段退避继续跑，拷贝尝试次数持续增长（每轮即磁盘恢复探测）。
    const callsAtStall = world.copyCalls;
    await jest.advanceTimersByTimeAsync(20_000);
    expect(world.copyCalls).toBeGreaterThan(callsAtStall);

    // 【防闪断】慢阶段每一笔 tick 都不许抹掉 exhausted（否则卡片在 stalled/downloading 间闪）。
    expect(seenAfterStall.length).toBeGreaterThan(0);
    for (const s of seenAfterStall) {
      if (s.status === 'downloading') expect(s.attemptsExhausted).toBe(true);
    }

    // 【铁律】无论失败多久，绝不写 error（内置与网络无关）。
    expect(getSceneDownloadState(SCENE)!.status).not.toBe('error');

    abortBuiltinRetry(SCENE); // 收尾：终止无限轮编排器，避免悬挂 promise 影响后续用例
    await expect(p).resolves.toBe('aborted');
    expect(hasActiveBuiltinRetry(SCENE)).toBe(false); // registry 已注销
  });

  test('【C】ENOSPC 解除（磁盘空间恢复）→ 慢阶段自动收敛 Ready/100，attemptsExhausted 被清除', async () => {
    // 「用户清出空间」建模为可控开关：确认进入 stalled 之后才放行成功——
    // 精确复现「终态已立 → 磁盘恢复 → 低频轮自动收敛」链路（而非快阶段内 just-in-time 成功）。
    const world = { diskReady: false, copyCalls: 0, succeed: false };
    const deps: BuiltinReadinessDeps = {
      isDiskReady: async () => world.diskReady,
      copyOnce: async () => {
        world.copyCalls += 1;
        if (world.succeed) world.diskReady = true;
        return world.diskReady;
      },
      tick: (id, s) => tickScene(id, s),
    };
    const p = ensureBuiltinReadyWithRetry(SCENE, deps, OPTS_FAST, SCHED);

    await jest.advanceTimersByTimeAsync(6_000);
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 90, status: 'downloading', attemptsExhausted: true }); // 确认真进过 stalled
    const callsAtStall = world.copyCalls;

    world.succeed = true; // —— ENOSPC 解除 ——
    await jest.advanceTimersByTimeAsync(60_000); // 慢阶段下一低频轮即自动收敛，无需用户再点
    await expect(p).resolves.toBe('ready');
    expect(world.copyCalls).toBeGreaterThan(callsAtStall); // 恢复确实由 stalled 后的自动轮探测到

    // ready 的 tick 是全新状态对象整体替换 → attemptsExhausted 不复存在（UI 立即恢复 Ready）。
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 100, status: 'ready' });
    expect(hasActiveBuiltinRetry(SCENE)).toBe(false);
  });

  test('【C · 信号触发】wakeBuiltinRetries 跳过退避等待提前探测；冷却窗内二次信号被节流', async () => {
    const { world, deps } = makeWorld({ alwaysFail: true });
    const p = ensureBuiltinReadyWithRetry(SCENE, deps, OPTS_FAST, SCHED);
    await jest.advanceTimersByTimeAsync(6_000); // 进入 stalled，此刻正处在慢阶段长退避中
    expect(getSceneDownloadState(SCENE)!.attemptsExhausted).toBe(true);

    const before = world.copyCalls;
    expect(wakeBuiltinRetries()).toBe(1);          // 前台恢复信号 → 唤醒 1 个场景
    await jest.advanceTimersByTimeAsync(200);      // 远小于 backoffBase：只有 wake 才能这么快再拷
    expect(world.copyCalls).toBeGreaterThan(before); // 提前探测确实发生（ENOSPC 若已解除即刻 ready）

    expect(wakeBuiltinRetries()).toBe(0);          // 冷却窗(signalCooldownMs=1.5s)内二次信号被节流
    abortBuiltinRetry(SCENE);
    await expect(p).resolves.toBe('aborted');
  });

  test('【A · 点按重试】stalled 时再次进入 → 旧编排器 aborted、状态清回 downloading、新实例可收敛 ready', async () => {
    const world = { diskReady: false, copyCalls: 0 };
    let succeedFrom = Infinity;
    const deps: BuiltinReadinessDeps = {
      isDiskReady: async () => world.diskReady,
      copyOnce: async () => {
        world.copyCalls += 1;
        if (world.copyCalls >= succeedFrom) world.diskReady = true;
        return world.diskReady;
      },
      tick: (id, s) => tickScene(id, s),
    };

    const p1 = ensureBuiltinReadyWithRetry(SCENE, deps, OPTS_FAST, SCHED);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(getSceneDownloadState(SCENE)!.attemptsExhausted).toBe(true); // 已 stalled

    // —— 模拟用户点卡片（prioritizeScene 内置分支的语义）：abort + tick(downloading/0) + 重入 ——
    abortBuiltinRetry(SCENE);
    tickScene(SCENE, { progress: 0, status: 'downloading' }); // 全新对象 = 清 attemptsExhausted
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 0, status: 'downloading' });
    await expect(p1).resolves.toBe('aborted');                 // 旧实例干净退出

    succeedFrom = world.copyCalls + 1;                         // 「磁盘空间已恢复」：下一拷即成功
    const p2 = ensureBuiltinReadyWithRetry(SCENE, deps, OPTS_FAST, SCHED);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(p2).resolves.toBe('ready');                   // 快阶段 round1 即落盘
    expect(getSceneDownloadState(SCENE)).toEqual({ progress: 100, status: 'ready' });
  });
});
