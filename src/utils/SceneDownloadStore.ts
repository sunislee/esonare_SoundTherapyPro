// @fileoverview 场景下载状态 store — 每个场景独立计数器，subscribeExternalStore 风格。
//
// 旧实现（bug）：所有场景共享一个 DeviceEventEmitter tick counter，任何背景图完成都会触发
//   全部 SceneItem 重渲染。新实现：每个场景独立 counters[sceneId].tick，只有自身 tick+1 才
//   触发重渲染；其他 UI 通过 subscribeAllScenesChanged 收全局事件（如 ProfileScreen）。

import { AUDIO_MANIFEST } from '../constants/audioAssets';

export interface SceneDownloadState {
  progress: number; // 0-100
  status: 'waiting' | 'downloading' | 'ready' | 'error';
}

type Listener = () => void;

const perSceneTickers = new Map<string, number>(); // sceneId -> tick counter
const perSceneStates = new Map<string, SceneDownloadState>();
const perSceneListeners = new Map<string, Set<Listener>>();
let globalListeners = new Set<Listener>(); // 任何场景变化时调用（旧 UI）

/**
 * 内部：通知某个场景的订阅者。
 */
function notifyScene(sceneId: string): void {
  const subs = perSceneListeners.get(sceneId);
  if (subs) {
    subs.forEach(l => l());
  }
}

/**
 * tick +1，触发该 SceneItem subscribeExternalStore 回调。
 * 调用时机：背景图下载进度事件（progressCompleted / progress）到达时，
 *   按 assetId -> sceneId 映射逐场景提 tick；音频完成走 ResourceStatusManager.checkSceneResourceStatus
 *   → setSceneDownloadState（也提 tick），确保 SceneItem 能感知。
 */
export function tickScene(sceneId: string, state: SceneDownloadState): void {
  const old = perSceneTickers.get(sceneId) ?? 0;
  perSceneTickers.set(sceneId, old + 1);
  perSceneStates.set(sceneId, state);
  notifyScene(sceneId);
  globalListeners.forEach(l => l());
}

export function getSceneDownloadState(sceneId: string): SceneDownloadState | null {
  return perSceneStates.get(sceneId) ?? null;
}

/**
 * 【🔥 v4】清空所有场景下载状态（用户删除资源后调用）。
 */
export function clearAllScenes(): void {
  perSceneTickers.clear();
  perSceneStates.clear();
  globalListeners.forEach(l => l());
}

/**
 * 场景订阅：subscribeExternalStore 风格。
 * - mount 时注册 listener，返回 dispose()
 * - state 非 null 时立即 emit（滚动回收后 SceneItem mount，不用等下一个 tick）
 */
export function subscribeSceneDownloadChanged(
  sceneId: string,
  listener: Listener,
): () => void {
  if (!perSceneListeners.has(sceneId)) {
    perSceneListeners.set(sceneId, new Set());
  }
  const ls = perSceneListeners.get(sceneId)!;
  ls.add(listener);

  // 如果场景状态已就绪，立即通知一次（滚动回收后 SceneItem mount）
  const state = perSceneStates.get(sceneId);
  if (state) listener();

  return () => {
    ls.delete(listener);
    if (ls.size === 0) perSceneListeners.delete(sceneId);
  };
}

/** 【🔥 v4】按 assetId → sceneId 映射提 tick（DownloaderService progress 事件用）。 */
export function tickSceneByAsset(assetId: string, state: SceneDownloadState): void {
  const sceneMap = new Map<string, string>(); // sceneId -> first assetId for that scene
  for (const item of AUDIO_MANIFEST) {
    if (!item.sceneKey) continue;
    if (!sceneMap.has(item.sceneKey)) sceneMap.set(item.sceneKey, item.id);
  }
  const sceneId = sceneMap.get(assetId);
  if (!sceneId) return;
  tickScene(sceneId, state);
}

export function getGlobalDownloadProgress(): number | null {
  const states = Array.from(perSceneStates.values());
  if (states.length === 0) return null;
  let sum = 0;
  for (const s of states) sum += s.progress;
  return Math.round(sum / states.length);
}

export function getAllSceneStatuses(): SceneDownloadState[] {
  return Array.from(perSceneStates.values());
}

/**
 * 【孤儿错误清算 · 取证用】返回当前 store 账本中 status==='error' 的场景 id 列表。
 *
 * 双账本背离根因：离线时 prioritizeScene 直接 tickScene({status:'error'}) 写进【store】，
 * 但这些场景从未进入【downloader 队列/statusMap】。联网后 DownloaderService.recoverFailedOnNetworkRestore
 * 只扫自己的 statusMap.failed → 永远够不到这批 store 孤儿 error → UI 联网仍显示「需要网络」。
 * 本方法把 store 账本暴露给自愈 sweep，使孤儿 error 可被清算。
 */
export function getErrorSceneIds(): string[] {
  const ids: string[] = [];
  for (const [sceneId, st] of perSceneStates) {
    if (st.status === 'error') ids.push(sceneId);
  }
  return ids;
}

/** planOrphanErrorSweep 的依赖注入：全部纯函数，便于把不变式写进可单测的决策核心。 */
export interface OrphanSweepContext {
  isConnected: boolean;
  isResourceReady: (sceneId: string) => boolean;
  isInQueue: (sceneId: string) => boolean;
}

export type OrphanSweepAction = 'ready' | 'requeue';

/**
 * 【不变式 · 写进代码】isConnected=true 时，store error 态存活不得超过一个自愈周期(25s)。
 * UI 在任何时刻不得联网显示「需要网络」。
 *
 * 三分支收敛（仅联网执行；断网绝不清算，交给真正的 NETWORK_RECOVERED）：
 *   - 磁盘已就绪            → 'ready'
 *   - 不在下载队列且未就绪  → 'requeue'（重新入队 + tick pending/正在下载）
 *   - 已在队列             → 不动（不返回该场景，避免打断进行中的下载）
 */
export function planOrphanErrorSweep(
  errorSceneIds: string[],
  ctx: OrphanSweepContext,
): Array<{ sceneId: string; action: OrphanSweepAction }> {
  if (!ctx.isConnected) return []; // 断网：绝不清算，避免误清离线诚实态
  const actions: Array<{ sceneId: string; action: OrphanSweepAction }> = [];
  for (const sceneId of errorSceneIds) {
    if (ctx.isResourceReady(sceneId)) {
      actions.push({ sceneId, action: 'ready' });
    } else if (!ctx.isInQueue(sceneId)) {
      actions.push({ sceneId, action: 'requeue' });
    }
    // 已在队列且未就绪 → 不动（下载正在进行，等其结果）
  }
  return actions;
}

/**
 * 【🔥 v4】重置指定场景的状态（删除资源后调用）。
 */
export function resetSceneState(sceneId: string): void {
  perSceneTickers.delete(sceneId);
  perSceneStates.delete(sceneId);
  notifyScene(sceneId);
}

/**
 * 测试用途：清空所有状态和订阅。
 */
export function _resetForTest(): void {
  perSceneTickers.clear();
  perSceneStates.clear();
  perSceneListeners.clear();
  globalListeners = new Set<Listener>();
}