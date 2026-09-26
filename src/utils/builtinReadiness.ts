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
