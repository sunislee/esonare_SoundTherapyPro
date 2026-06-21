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