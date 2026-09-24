/**
 * OfflineService — 【阶段二 a】场景离线就绪"真相源"（single source of truth）。
 *
 * 背景 / 修复的 bug：
 *   HomeScreen 旧逻辑在冷启动挂载时 `setDownloadedSceneIds(new Set(所有 baseId))`，
 *   无条件把全部基础场景标记为已下载 → 离线/未落盘也显示 "Ready to Play"（假就绪）。
 *   ResourceStatusManager.checkAudioStatus 又只用 RNFS.exists()（不校验大小），
 *   空/残缺文件也算 ready。二者叠加导致 UI 与磁盘真相背离。
 *
 * 本服务职责：
 *   1. 以「音频文件真实落盘 + 大小合理」为唯一就绪判据（expected size 来自 AUDIO_MANIFEST.size）。
 *   2. 提供外部 store（subscribe/getSnapshot）供 UI 订阅，快照随磁盘状态变化而更新。
 *   3. 绝不乐观置 ready：任何未落盘 / 过小 / 与期望严重不符的文件一律 not-ready。
 *
 * @architecture-constraint
 *   - 本服务不 import HomeScreen/UI，也不 import DownloaderService（避免环依赖）；
 *     UI 通过 subscribe 拉取真相，下载完成事件由调用方触发 recheckScene()。
 *   - 就绪判据只认磁盘 stat()，与网络无关；是否可"补下"由 NetworkGateService.isOffline() 决定。
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import { AUDIO_MANIFEST, getLocalPath } from '../constants/audioAssets';

export type ReadySnapshot = ReadonlySet<string>;

type Listener = () => void;

// 期望大小容差：真实文件应 >= 期望值的 95%（容忍极小元数据差异），否则视为残缺/损坏。
const SIZE_TOLERANCE = 0.95;
// 绝对下限：排除 0 字节 / HTML 错误页冒充等（与既有 1KB 阈值一致）。
const MIN_VALID_BYTES = 1024;

class OfflineService {
  private manifestById: Map<string, { filename: string; category: string; size: number }> = new Map();
  private readyIds: Set<string> = new Set();
  /** 已扫描过的场景集合（区分"未扫描=未知"与"扫描过=确认未就绪"） */
  private scanned: Set<string> = new Set();
  private listeners: Set<Listener> = new Set();
  private version = 0;
  private scanning = false;

  constructor() {
    for (const a of AUDIO_MANIFEST) {
      if (!this.manifestById.has(a.id)) {
        this.manifestById.set(a.id, { filename: a.filename, category: a.category, size: a.size });
      }
    }
  }

  // ── 外部 store 接口 ────────────────────────────────
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** useSyncExternalStore 快照：返回稳定引用，仅在就绪集合变化时换新对象。 */
  getSnapshot = (): ReadySnapshot => this.readyIds;

  getVersion = (): number => this.version;

  isReady = (sceneId: string): boolean => this.readyIds.has(sceneId);

  getReadyIds = (): ReadonlySet<string> => this.readyIds;

  /** 该场景是否已在 AUDIO_MANIFEST 中登记（未登记=无法播放，永远 not-ready）。 */
  hasManifest = (sceneId: string): boolean => this.manifestById.has(sceneId);

  private notify(): void {
    this.version += 1;
    // 换新 Set 引用，确保 useSyncExternalStore 能感知变化
    this.readyIds = new Set(this.readyIds);
    this.listeners.forEach((l) => { try { l(); } catch (_e) {} });
  }

  private setReady(sceneId: string, ready: boolean): void {
    const cur = this.readyIds.has(sceneId);
    if (ready && !cur) { this.readyIds.add(sceneId); this.notify(); }
    else if (!ready && cur) { this.readyIds.delete(sceneId); this.notify(); }
  }

  /**
   * 校验单个场景音频是否真实落盘且大小合理。
   * @returns true=就绪；false=未落盘/过小/与期望严重不符/无登记。
   */
  async checkSceneAudioReady(sceneId: string): Promise<boolean> {
    const info = this.manifestById.get(sceneId);
    if (!info) return false; // 无音频登记 → 不可播放
    try {
      const localPath = getLocalPath(info.category, info.filename);
      const exists = await RNFS.exists(localPath);
      if (!exists) return false;
      const stat = await RNFS.stat(localPath);
      const size = (stat as any).size ?? 0;
      if (size < MIN_VALID_BYTES) return false;
      // 期望大小存在时按容差校验，拒绝截断/损坏文件
      if (info.size > 0 && size < info.size * SIZE_TOLERANCE) return false;
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * 重扫指定场景集合（默认全部已登记场景）并刷新就绪快照。
   * 幂等 + 并发保护：同一时刻只跑一轮全量扫描。
   */
  async refresh(sceneIds?: string[]): Promise<void> {
    const targets = sceneIds ?? Array.from(this.manifestById.keys());
    if (!sceneIds) {
      if (this.scanning) return;
      this.scanning = true;
    }
    try {
      await Promise.all(targets.map(async (id) => {
        const ready = await this.checkSceneAudioReady(id);
        this.scanned.add(id);
        this.setReady(id, ready);
      }));
    } finally {
      if (!sceneIds) this.scanning = false;
    }
  }

  /** 下载完成/失败等事件后，重判单场景（供 UI/生产者调用）。 */
  async recheckScene(sceneId: string): Promise<boolean> {
    const ready = await this.checkSceneAudioReady(sceneId);
    this.scanned.add(sceneId);
    this.setReady(sceneId, ready);
    return ready;
  }

  /** 资源被删除后强制置为未就绪。 */
  invalidate(sceneId: string): void {
    if (this.readyIds.delete(sceneId)) this.notify();
    this.scanned.delete(sceneId);
  }

  /**
   * 【清缓存反向失效】清空全部就绪集合并通知订阅方，使 UI 立即从 Ready 回落「资源正在下载」。
   * 调用时机：用户清除缓存/删除资源、文件已被 unlink 之后。绝不乐观——只清不置位；
   * 之后由磁盘复核(refresh/recheckScene)按真实落盘重新决定哪些场景回到 Ready。
   */
  invalidateAll(): void {
    if (this.readyIds.size === 0 && this.scanned.size === 0) return;
    this.readyIds = new Set();
    this.scanned.clear();
    this.notify();
  }
}

export default new OfflineService();
