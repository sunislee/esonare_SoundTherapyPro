// @fileoverview 播放主场景（currentBaseScene）解析核心 — 无副作用纯函数，可脱离 RN 直接 Jest 覆盖。
//
// 背景（bugfix · 2026-09 无效 scene ID）：AudioService 的 TrackChanged 兜底在「下一首 id 查不到场景」时，
//   曾用字面量 `{ id, title, filename: '', category, duration: 0 } as Scene` 伪造对象赋给
//   currentBaseScene（tsc 报 TS2352 @AudioService.ts:560）。后果：
//     · filename:'' → buildTrackForScene 走 getLocalPath(category, '') 拼出无效路径；
//     · 脏 currentBaseScene 经 notifyListeners() 广播给 AudioContext → 所有订阅 UI 显示错误场景；
//     · duration 根本不是 Scene 字段（tsc TS2339 @AudioService.ts:1726），靠断言蒙混。
//   本模块把「id → 可用主场景」的决策抽成纯函数：查不到就明确失败，由调用方保持上一有效场景，
//   绝不再伪造。invalidSceneIds 记账属 AudioService 实例内存态（重启即清），不在本核心内。
//
// @architecture-constraint 禁止在本文件返回任何 new Scene({...}) 合成对象；唯一合法来源是 findScene()。

import { Scene, findScene } from '../constants/scenes';

export type BaseSceneResolution =
  | { ok: true; scene: Scene }
  | { ok: false; reason: 'empty-id' | 'unknown-id' | 'missing-filename'; invalidId: string };

/**
 * 解析 id 为可安全写入 currentBaseScene 的场景对象。
 * 三条不变式：
 *   ① 非法/空 id → ok:false，且不返回任何 Scene 实例（无伪造兜底）；
 *   ② ok:true 时 scene.filename 必为非空串 → 下游 getLocalPath / 下载 URL 不可能拿到空串；
 *   ③ 不抛异常：null/undefined/非字符串均归入 empty-id。
 */
export function resolveBaseScene(rawId: string | null | undefined): BaseSceneResolution {
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) {
    return { ok: false, reason: 'empty-id', invalidId: typeof rawId === 'string' ? rawId : '' };
  }

  const scene = findScene(id);
  if (!scene) {
    return { ok: false, reason: 'unknown-id', invalidId: id };
  }

  // 防御性不变式：SCENES 由 AUDIO_MANIFEST 生成，filename 理论上恒非空；
  // 一旦常量层出现漏填，宁可判定失败也不放行空 filename 去污染播放/下载路径。
  if (!scene.filename || typeof scene.filename !== 'string') {
    return { ok: false, reason: 'missing-filename', invalidId: id };
  }

  return { ok: true, scene };
}
