// @fileoverview 内置场景「未就绪 → 落盘 Ready」就绪编排器（零 RN 依赖，可单测）。
//
// 【为什么需要这个模块 · 永久 0% 根因取证（2026-09-25）】
//   内置场景卡片"永久正在准备 0%"是一条三方合谋的死局：
//     1) sceneCardStatus.ts:51 `if (input.isBuiltin) return 'downloading'` —— 只要 audioReady=false，
//        内置卡在 UI 层被无条件钉死为『正在准备』，任何 offline/downloadStatus 都翻不动它。
//        ⇒ 推论：给超时补 error 出口【无效】，error 会被这行吃掉，用户连"失败"都看不见。
//     2) HomeScreen.prioritizeScene 内置分支把 reensure() 的 Promise<boolean> 返回值整个丢弃，
//        拷贝成功/失败 UI 完全不知情；catch 只打日志，无任何重试调度。
//     3) 就绪轮询到 capDeadline 仅 clearDownloadTimer()，注释自承"卡片仍保持『正在准备』"
//        ⇒ 本轮会话内不再有任何自愈路径，唯一出路是杀进程重启触发 bootstrap()。
//   UI 真相唯一来源是 OfflineService.readyIds（磁盘 exists + size≥95%），因此【治好】的定义是：
//   编排器必须让 audioReady 必然可达 —— 复核 → 重拷（退避重试）→ 再复核，直到落盘为止。
//
// 【纪律】本模块绝不写 'error'、绝不回落 CDN：内置音频随 APK 打包，缺失只是本地拷贝待重试，
//   与网络无关（谎报"需要网络"是已发生过的回归，见 sceneCardStatus.ts:47-51 注释）。

import type { SceneDownloadState } from './SceneDownloadStore';

/** 编排结果：ready=已落盘可播；pending-retry=本轮未成功但【已安排下一次重试】（非死局）。 */
export type BuiltinReadinessOutcome = 'ready' | 'pending-retry';

export interface BuiltinReadinessDeps {
  /** 磁盘唯一真相复核（生产环境 = OfflineService.recheckScene，内部会 setReady 通知 UI）。 */
  isDiskReady: (sceneId: string) => Promise<boolean>;
  /** 触发一次幂等本地重拷（生产环境 = BuiltinAssetBootstrap.reensure），true=已就绪。 */
  copyOnce: (sceneId: string) => Promise<boolean>;
  /** 写入首页卡片状态（生产环境 = SceneDownloadStore.tickScene）。 */
  tick: (sceneId: string, state: SceneDownloadState) => void;
}

export interface BuiltinReadinessOptions {
  /** 单次就绪复核间隔(ms)。 */
  pollMs: number;
  /** 本轮编排总预算(ms)，超出则交还调用方并安排下一次重试。 */
  capMs: number;
  /** 本轮内最多主动重拷次数（退避：第 n 次失败后等 pollMs * 2^(n-1)）。 */
  maxCopyAttempts?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 【当前生产语义的 1:1 复刻 · 缺陷版】逐行照抄 HomeScreen.prioritizeScene 内置分支（旧 623-643）：
 *   tick(downloading/0) → fire-and-forget reensure（返回值丢弃）→ 轮询磁盘 → 超时仅 clearDownloadTimer。
 * 保留它只为把"永久 0%"钉成可执行的反例测试；修复后不再被任何生产代码引用。
 */
export async function runBuiltinReadinessLegacy(
  sceneId: string,
  deps: BuiltinReadinessDeps,
  opts: BuiltinReadinessOptions,
): Promise<BuiltinReadinessOutcome> {
  const { isDiskReady, copyOnce, tick } = deps;
  tick(sceneId, { progress: 0, status: 'downloading' }); // 正在准备（非 error）

  // 缺陷①：fire-and-forget —— reensure 的 boolean 被丢弃，成功与否无人知晓。
  void copyOnce(sceneId).catch(() => {});

  const capDeadline = Date.now() + opts.capMs;
  for (;;) {
    await sleep(opts.pollMs);
    const ready = await isDiskReady(sceneId);
    if (ready) {
      tick(sceneId, { progress: 100, status: 'ready' });
      return 'ready';
    }
    // 缺陷②：超时只停止轮询，既不重拷也不安排下一次 —— 卡片永久停在 downloading/0%。
    if (Date.now() >= capDeadline) return 'pending-retry';
  }
}

/**
 * 【治好】内置场景就绪闭环：真相优先 → 重拷（消费返回值 + 退避重试）→ 复核磁盘，直到落盘。
 *
 * 修掉 legacy 的两个缺陷：
 *   ① 消费 copyOnce() 的 boolean（旧代码 fire-and-forget，成功/失败 UI 全不知情）；
 *   ② 失败不再"发一次就等磁盘奇迹"：本轮内按退避主动重拷，预算用尽则返回 'pending-retry'
 *      交还调用方安排下一次重试 —— 死局变成有界的可自愈过程。
 *
 * 【铁律】绝不写 'error'、绝不回落 CDN（内置与网络无关；且 sceneCardStatus.ts:51 也翻不动 UI）。
 * 进度只允许单调爬升且封顶 90，只有磁盘真相为就绪才写 100/ready。
 */
export async function ensureBuiltinReady(
  sceneId: string,
  deps: BuiltinReadinessDeps,
  opts: BuiltinReadinessOptions,
): Promise<BuiltinReadinessOutcome> {
  const { isDiskReady, copyOnce, tick } = deps;
  const maxCopyAttempts = Math.max(1, opts.maxCopyAttempts ?? 3);

  // 【真相优先】已落盘 → 秒就绪，一次拷贝都不浪费（冷启动 bootstrap 已拷完的常见路径）。
  if (await isDiskReady(sceneId)) {
    tick(sceneId, { progress: 100, status: 'ready' });
    return 'ready';
  }

  tick(sceneId, { progress: 0, status: 'downloading' }); // 正在准备（非 error）
  const capDeadline = Date.now() + opts.capMs;
  const step = Math.floor(90 / maxCopyAttempts);

  for (let attempt = 1; attempt <= maxCopyAttempts; attempt++) {
    // 【修①】消费返回值：拷贝报告就绪即视为成功，但仍以磁盘复核为最终准绳。
    const copyOk = await copyOnce(sceneId);
    if (copyOk || (await isDiskReady(sceneId))) {
      tick(sceneId, { progress: 100, status: 'ready' });
      return 'ready';
    }

    const remaining = capDeadline - Date.now();
    if (remaining <= 0) break; // 预算耗尽 → 交还调用方安排下一次（不再是死局）

    // 有进展感但不谎报：重试轮次折算进度，封顶 90，真正的 100 只由磁盘真相给出。
    tick(sceneId, { progress: Math.min(90, attempt * step), status: 'downloading' });

    const backoff = Math.min(opts.pollMs * 2 ** (attempt - 1), remaining);
    await sleep(backoff);

    // 退避期间后台 bootstrap() 可能已拷好 → 立即复核，不必等下一轮（缩短用户等待）。
    if (await isDiskReady(sceneId)) {
      tick(sceneId, { progress: 100, status: 'ready' });
      return 'ready';
    }
  }

  return 'pending-retry';
}

// ════════════════════════════════════════════════════════════════════════
// 【A + C · stalled 终态与低频长周期自愈】（2026-09-26，C2b 取证结论落地）
//
// C2b 设备实证：ENOSPC 持续 >102.8s 时，3 轮快阶段(30s×3)耗尽后 store 终态停在
// downloading/90、UI 恒显「资源正在下载」——无失败提示、无重试入口、会话内不再自愈。
//   · A：第 fastRounds 轮失败即写 attemptsExhausted=true（显示层终态 stalled，
//     文案「本地准备受阻 · 点按重试」）；用户点击 → prioritizeScene abort + 快阶段重入。
//   · C：stalled ≠ 停止调度——后台转入指数退避长周期(60s→120s→240s→300s 封顶)无限轮，
//     每轮 copyOnce 尝试【本身就是磁盘空间恢复探测】（ENOSPC 解除 → 拷贝成功 → ready），
//     无需专门 freeSpace API；AppState 回前台经 wakeBuiltinRetries() 提前唤醒一轮。
//   · 持久化：零新增字段。registry/退避状态全在内存，进程重启即清零（bootstrap 重跑），
//     天然满足「仅内存、重启即清」，不会造出"永久屏蔽"型 bug。
// 【铁律不破】本模块绝不写 'error'、绝不回落 CDN；stalled 的 status 仍是 'downloading'
//   （UI 由 attemptsExhausted 独立信号驱动），「内置永不 error / 绝不谎报需要网络」不变式原样保留。
// ════════════════════════════════════════════════════════════════════════

/** A/C · 多轮重试调度参数（全内存语义，进程重启即从头开始）。 */
export interface BuiltinRetrySchedule {
  /** 快阶段轮数：耗尽即标 stalled（显示层终态）并转入慢阶段。 */
  fastRounds: number;
  /** 快阶段每轮失败后的固定重试间隔(ms)。 */
  fastDelayMs: number;
  /** 慢阶段指数退避首段间隔(ms)（stalled 出现后的第一个长周期）。 */
  backoffBaseMs: number;
  /** 慢阶段退避封顶(ms)：低频长周期，同时就是磁盘空间恢复的周期性探测节奏。 */
  backoffCapMs: number;
  /** 信号触发(AppState→active)唤醒的单场景冷却(ms)，防前后台快速切换锤击拷贝/磁盘 IO。 */
  signalCooldownMs: number;
}

export const DEFAULT_BUILTIN_RETRY_SCHEDULE: BuiltinRetrySchedule = {
  fastRounds: 3,
  fastDelayMs: 30_000,
  backoffBaseMs: 60_000,
  backoffCapMs: 300_000,
  signalCooldownMs: 60_000,
};

/**
 * round 轮失败后应等待多久再开下一轮（纯函数，可单测）。
 * 快阶段(round < fastRounds)固定 fastDelayMs；自 round == fastRounds 起进入慢阶段：
 * backoffBaseMs × 2^j 封顶 backoffCapMs（默认曲线 30s,30s →stalled→ 60s,120s,240s,300s,300s…）。
 */
export function nextBuiltinRetryDelayMs(round: number, s: BuiltinRetrySchedule = DEFAULT_BUILTIN_RETRY_SCHEDULE): number {
  if (round < s.fastRounds) return s.fastDelayMs;
  const j = round - s.fastRounds; // round==fastRounds → j=0 → backoffBaseMs
  return Math.min(s.backoffBaseMs * 2 ** j, s.backoffCapMs);
}

/**
 * 【A · stalled 显示层终态】快阶段耗尽时写入的 store 状态。
 * status 保持 'downloading'（内置绝不 error），UI 由 attemptsExhausted 独立信号翻成
 * 「本地准备受阻 · 点按重试」(sceneCardStatus → 'stalled')。
 * progress=90 是【冻结历史值】：仅为此前 tick 序列的收尾，UI 在 stalled 分支不消费它——
 * 保留而非清零，是为了不改 tick 契约(progress∈[0,100])、不影响 getGlobalDownloadProgress 等既有消费者。
 */
export const BUILTIN_STALLED_PROGRESS = 90;

export function builtinStalledState(): SceneDownloadState {
  return { progress: BUILTIN_STALLED_PROGRESS, status: 'downloading', attemptsExhausted: true };
}

interface RetryHandle {
  wake: () => void;
  abort: () => void;
  lastSignalWakeAt: number;
}

/** 【仅内存】sceneId → 在途编排器句柄。模块级单例，跨 HomeScreen mount/unmount 存活；进程重启即清零。 */
const activeRetries = new Map<string, RetryHandle>();

/** 该场景是否已有在途多轮编排（HomeScreen 防重入/取证用）。 */
export function hasActiveBuiltinRetry(sceneId: string): boolean {
  return activeRetries.has(sceneId);
}

/** 终止某场景的在途编排（「点按重试」= abort 慢阶段实例，由调用方立即重启快阶段）。不写任何 store 状态。 */
export function abortBuiltinRetry(sceneId: string): void {
  activeRetries.get(sceneId)?.abort();
}

/**
 * 【C · 信号触发】App 回前台等恢复信号 → 唤醒所有在途慢阶段编排器提前跑一轮探测。
 * per-scene 冷却 signalCooldownMs（默认 60s）节流；返回实际唤醒的场景数。
 * 编排器正在跑当轮时 wake 无副作用（等价于"已经在探测了"）。
 */
export function wakeBuiltinRetries(now: number = Date.now(), s: BuiltinRetrySchedule = DEFAULT_BUILTIN_RETRY_SCHEDULE): number {
  let woken = 0;
  for (const h of activeRetries.values()) {
    if (now - h.lastSignalWakeAt < s.signalCooldownMs) continue;
    h.lastSignalWakeAt = now;
    h.wake();
    woken += 1;
  }
  return woken;
}

  /** 可被 wake/abort 提前结束的等待（fake timers 友好：底层就是 setTimeout）。 */
function sleepOrWake(ms: number, registerWake: (wake: () => void) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      registerWake(() => {});
      resolve();
    }, ms);
    registerWake(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * 【A + C · 生产入口】多轮就绪闭环：ensureBuiltinReady × (快阶段有限轮 → 慢阶段无限轮)，直到落盘。
 *
 * - round == fastRounds 失败 → tick(builtinStalledState())：卡片翻「本地准备受阻 · 点按重试」，
 *   但调度继续（转入指数退避长周期），ENOSPC 解除等磁盘恢复会在后续轮自动 ready。
 * - 同场景再次调用本函数 → 先 abort 旧实例再从 round 1 快阶段重入（「点按重试」语义）。
 * - ready / abort 都会注销 registry；abort 的实例退出前不再写任何 tick，状态由新实例接管。
 *
 * 【不变式】除 ready/100 与 stalled(progress=90,attemptsExhausted=true) 外不产生其它终态；
 * 绝不写 'error'、绝不回落 CDN（同 ensureBuiltinReady 铁律）。
 */
export async function ensureBuiltinReadyWithRetry(
  sceneId: string,
  deps: BuiltinReadinessDeps,
  opts: BuiltinReadinessOptions,
  schedule: BuiltinRetrySchedule = DEFAULT_BUILTIN_RETRY_SCHEDULE,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void,
): Promise<'ready' | 'aborted'> {
  // 【点按重试】同场景已有在途实例 → 终止旧实例，本实例从快阶段 round 1 重入。
  activeRetries.get(sceneId)?.abort();

  let wakeFn: (() => void) | null = null;
  let aborted = false;
  const handle: RetryHandle = {
    wake: () => wakeFn?.(),
    abort: () => {
      aborted = true;
      wakeFn?.();
    },
    lastSignalWakeAt: 0,
  };
  activeRetries.set(sceneId, handle);

  try {
    for (let round = 1; ; round++) {
      // 【慢阶段防闪断】ensureBuiltinReady 每轮会 tick({0|45|90,downloading}) 整体替换状态对象，
      // 不拦截则刚标的 stalled 会在每轮期间被抹掉/进度跳动，UI 在『本地准备受阻』与『正在下载』间闪烁。
      // 自愈期间的正确展示 = 持续 stalled（stalled 卡片本就不显示进度条）：downloading 态一律
      // 归一为 stalled 快照，直到 ready 的终态对象整体替换它（attemptsExhausted 随 ready 自然消失）。
      const roundDeps: BuiltinReadinessDeps =
        round > schedule.fastRounds
          ? {
              ...deps,
              tick: (id, s) => deps.tick(id, s.status === 'downloading' ? builtinStalledState() : s),
            }
          : deps;
      const outcome = await ensureBuiltinReady(sceneId, roundDeps, opts);
      if (aborted) return 'aborted'; // 旧实例被点按重试/重启顶替：不写终态，由新实例接管
      if (outcome === 'ready') return 'ready';

      const delay = nextBuiltinRetryDelayMs(round, schedule);
      if (round === schedule.fastRounds) {
        deps.tick(sceneId, builtinStalledState()); // 【A】显示层终态；调度【不】停止（C）
        log?.(
          'error',
          `[内置闭环] ${sceneId} 连续 ${schedule.fastRounds} 轮未落盘 → 标记「本地准备受阻」(attemptsExhausted)，` +
            `转低频长周期自动重试(${Math.round(delay / 1000)}s起,封顶${Math.round(schedule.backoffCapMs / 1000)}s)+前台恢复触发`,
        );
      } else {
        log?.(
          'warn',
          `[内置闭环] ${sceneId} 第 ${round}/${schedule.fastRounds} 轮未落盘 → ${Math.round(delay / 1000)}s 后自动重试（仍不谎报「需要网络」）`,
        );
      }

      await sleepOrWake(delay, (w) => {
        wakeFn = w;
      });
      wakeFn = null;
      if (aborted) return 'aborted';
    }
  } finally {
    if (activeRetries.get(sceneId) === handle) activeRetries.delete(sceneId);
  }
}
