// @fileoverview 下载器终态 → 首页场景卡片状态 的纯映射（无任何 RN / IO 依赖，可单测）。
//
// 背景（bugfix · 2026-09）：HomeScreen 此前完全不消费 DownloaderService 的状态事件
//   （旧 useResourceDownloader 已移除），导致下载器进入终态 'failed' 时首页 store
//   仍停在 prioritizeScene 写入的 'downloading' → SceneItem 永久显示「准备中 0%」。
//   唯一兜底是 prioritizeScene 的就绪 watchdog，但场景被反复选中会重置它而永不超时。
//
// 本模块把「下载器状态机」到「首页 UI 三态」的映射规则抽成纯函数，作为该失败路径的
//   单一真相：任何终态失败都必须落到 'error'（UI 显示「需要网络 · 点按重试」），
//   绝不留在 'downloading'/preparing-0%。便于脱离 RN 直接 Jest 覆盖状态转移。

/** 与 DownloaderService.DownloadStatus.status 对齐的最小结构（避免测试引入 RN）。 */
export interface DownloaderEventLike {
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number; // 0-100
}

/** 与 SceneDownloadStore.SceneDownloadState 对齐的返回结构。 */
export interface MappedSceneState {
  progress: number; // 0-100
  status: 'waiting' | 'downloading' | 'ready' | 'error';
}

/**
 * 把下载器事件映射为首页场景卡片状态。
 * - 'completed'  → ready(100)：落盘就绪（磁盘真相由 OfflineService 复核，这里仅即时反馈）。
 * - 'failed'     → error(0) ：终态失败必须离开 preparing-0%，落到明确错误态 + 自动重试。
 * - 'downloading'→ downloading(progress)：实时进度透传。
 * - 'pending'    → null     ：尚未开始，不强制改变 UI（交由 idle 图标 / prioritizeScene 处理）。
 */
export function mapDownloaderStatusToSceneState(
  event: DownloaderEventLike | null | undefined,
): MappedSceneState | null {
  if (!event) return null;
  switch (event.status) {
    case 'completed':
      return { progress: 100, status: 'ready' };
    case 'failed':
      // 【铁律】失败路径绝不返回 downloading —— 这是「永久准备中 0%」的根因。
      return { progress: 0, status: 'error' };
    case 'downloading': {
      const p = Math.max(0, Math.min(100, Math.round(event.progress || 0)));
      return { progress: p, status: 'downloading' };
    }
    case 'pending':
    default:
      return null;
  }
}
