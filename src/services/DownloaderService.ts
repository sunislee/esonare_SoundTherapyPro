/**
 * 异步资源下载服务
 * 功能：
 * 1. 非阻塞式后台下载
 * 2. 支持优先级队列
 * 3. 自动重试机制
 * 4. 本地缓存管理
 * 
 * 【重构】使用 fetch + blob + RNFS.writeFile 替换 RNFS.downloadFile
 * 避免原生层 Java Downloader.java 在 Release 包中的死锁问题
 *
 * @architecture-constraint 【P1-4 单引擎目标 · vc147：新下载代码只进这里】
 *
 * 本文件是下载能力的**唯一新增入口**。旧引擎 DownloadService.ts（模块级 silentBackgroundDownload /
 * checkAndDownload / downloadAudio）已冻结为 bugfix only，两者写入同一批 audio_resources/ 文件，
 * 因此禁止在同一个用户动作里同时驱动两个引擎——会并发写同一 .part 文件，破坏断点续传语义。
 *
 * 已确认决策（2026-09）：
 *   1. **不引入运行时 feature flag**。回滚粒度 = 单个调用点的迁移 commit，比在 release 包里给
 *      下载路径加分支更细、更可定位；代价是灰度期两引擎并存，靠下面的顺序控制爆炸半径。
 *   2. vc148 迁移顺序（由低风险到高风险）：
 *        useResourceDownloader:100 → ResourceStatusManager:218/228 → ResourceDownloadScreen:569
 *        → BreathDetailScreen:491(checkAndDownload，语义最特殊) → AudioService:3904(downloadAudio，
 *          需先对齐 onProgress 进度回调契约) → 清理 App.tsx 对 DownloadService 的死 import
 *   3. 迁移期间新增的每个方法都必须走 getAssetUrls() 取 URL（P1-6 已收敛），禁止再拼 CDN 字面量。
 *
 * 详见 DownloadService.ts 头部的旧引擎冻结说明。
 */

// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  NOISE_REDUCTION_RESOURCES,
  SORTED_RESOURCES,
  RESOURCE_MAP,
  SCENE_BACKGROUND_RESOURCES,
  type AudioResource,
} from '../config/ResourceConfig';
import {
  AUDIO_MANIFEST,
  ASSET_LIST,
  getAssetUrls,
  getLocalPath as getAudioLocalPath,
  IS_GOOGLE_PLAY_VERSION,
} from '../constants/audioAssets';
import { DeviceEventEmitter } from 'react-native';
import NetworkGateService, { WIFI_PROMPT_RESOLVED } from './NetworkGateService';

// 本地缓存目录
const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/noise_reduction_cache`;

// ════════════════════════════════════════════════════════════
// 【P1-1】下载超时与看门狗配置（详见 streamDownloadTo）
// ════════════════════════════════════════════════════════════
const DOWNLOAD_CONN_TIMEOUT_MS = 20_000;     // 【req#2】连接阶段：20s 未收到响应头即 abort（慢源容忍，原 10s）
const STREAM_STALL_TIMEOUT_MS = 8_000;       // 【req#2】流式路径：8s 无新 chunk 即 abort（原 5s，避免慢源短暂停顿误杀）
const BODY_READ_DEFAULT_BUDGET_MS = 120_000; // arrayBuffer 回退：缺 Content-Length 时的默认读预算
// 【req#2】arrayBuffer 读预算下限 ≥45s：6~15MB 音频在慢源(ghproxy.net 单文件 13~20s、statically 更慢)下，
//   绝不在 45s 内把"仍在收流"的下载判死——历史上 statically 20s 没下完被掐断即此坑。
const BODY_READ_MIN_BUDGET_MS = 45_000;

// ════════════════════════════════════════════════════════════
// 【限流与熔断 · item2】ghproxy 为共享代理，并发/紧挨着请求会触发限流 → 0%停滞 + 终态失败。
//   策略：严格串行(引擎本就单队列) + 项间 ≥300ms 间隔 + 指数退避重试；连续 N 个文件终态失败
//   即熔断本轮自动批量，广播安静全局提示「网络较慢，稍后会自动继续」，冷却后再续跑剩余队列。
// ════════════════════════════════════════════════════════════
export const NETWORK_THROTTLE_EVENT = 'network-throttle-paused'; // payload: boolean（true=已暂停/熔断）
const INTER_ITEM_DELAY_MS = 300;             // 串行下载项间最小间隔，避免打爆共享代理
// 【req#3 指数退避】失败重试间隔递增：30s → 2min → 10min，最多 3 轮后停（终态 failed）。
//   旧值 [2s,8s,32s] 是"快速自我 DDOS"，会把 ghproxy 打到限流。退避改为时间戳非阻塞重排（见 processQueue），
//   不再用 inline sleep——否则一个慢/坏文件会冻结整条串行队列最长 10min。
const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000];
const MAX_RETRY_ROUNDS = RETRY_BACKOFF_MS.length; // 3 轮后终态 failed
// 【req#1 源健康度/快速切换】单 host 连续失败达阈值 → 进入冷却，排序时降到末位并优先跳过，
//   不在死源(mirror.ghproxy)上逐轮烧重试次数才轮到下一家。
const HOST_FAIL_THRESHOLD = 2;
const HOST_COOLDOWN_MS = 5 * 60_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;         // 本轮连续 N 个文件终态失败 → 熔断自动批量
const CIRCUIT_RESUME_COOLDOWN_MS = 60_000;   // 【req#4】熔断后确定性的冷却时长，到期真正重放队列

/** arrayBuffer 回退读预算：按最低可行速率 ~16KB/s 由 Content-Length 估算。【req#2】下限 ≥45s(原30s)，慢源大文件不被过早掐断；上限 5min 兜底防死锁 */
const bodyReadBudget = (bytes: number): number =>
    Math.min(300_000, Math.max(BODY_READ_MIN_BUDGET_MS, Math.round((bytes / 16_384) * 1000)));

/**
 * 纯 JS 二进制 → base64（标准表驱动，逐 3 字节分组）。
 * RN (Hermes) 无全局 btoa；旧代码 `btoa || identity` 兜底会把原始二进制字符串按 'base64' 编码写入，产出损坏文件。
 */
const bytesToBase64 = (bytes: Uint8Array): string => {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const hasB1 = i + 1 < bytes.length;
        const hasB2 = i + 2 < bytes.length;
        const b1 = hasB1 ? bytes[i + 1] : 0;
        const b2 = hasB2 ? bytes[i + 2] : 0;
        out += CHARS[b0 >> 2];
        out += CHARS[((b0 & 0x3) << 4) | (b1 >> 4)];
        out += hasB1 ? CHARS[((b1 & 0xF) << 2) | (b2 >> 6)] : '=';
        out += hasB2 ? CHARS[b2 & 0x3F] : '=';
    }
    return out;
};

// 下载状态
export interface DownloadStatus {
  resourceId: string;
  filename: string;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
}

// 下载管理器类
class DownloaderService {
  private downloadQueue: AudioResource[] = [];
  private isDownloading = false;
  private currentDownload: any = null;
  /** 【🔧 防重入锁】确保同一时间只有一个 processQueue 在运行 */
  private queueProcessingPromise: Promise<void> | null = null;
  private statusMap: Map<string, DownloadStatus> = new Map();
  private listeners: Set<(status: DownloadStatus) => void> = new Set();
  private retryCount: Map<string, number> = new Map();
  private maxRetries = 3;
  /** 【item2 限流】本轮连续终态失败计数（任一成功即清零）；达阈值触发熔断。 */
  private consecutiveTerminalFailures = 0;
  /** 【item2 熔断】true = 本轮自动批量已暂停，processQueue 立即停止取任务。 */
  private circuitOpen = false;
  /** 【item2 熔断】冷却续跑定时器（单例生命周期）。 */
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 【req#1 源健康度】host → 连续失败次数 + 冷却到期时间戳。死源(连续失败≥阈值)排序降末位并优先跳过，快速切下一家；成功即清零自愈。 */
  private hostHealth: Map<string, { fails: number; cooldownUntil: number }> = new Map();
  /** 【req#3 非阻塞退避】resourceId → 已尝试轮次 + 下次可重试时间戳。失败重排队记录 nextRetryAt，processQueue 遇未到点任务移到队尾并安排定时器到点续跑，绝不 inline sleep 冻结整条队列。 */
  private retrySchedule: Map<string, { attempts: number; nextRetryAt: number }> = new Map();
  /** 【req#3】全部任务都在退避等待时，安排"最近到期即唤醒"的定时器（避免空转/阻塞）。 */
  private retryFlushTimer: ReturnType<typeof setTimeout> | null = null;
  /** [PR-2] WiFi 提示恢复事件订阅（单例生命周期，无需释放） */
  private wifiGateSub: { remove(): void } | null = null;

  constructor() {
    this.initCacheDir();
    // [PR-2] 移动数据闸门放行（切到 WiFi / 用户允许）后自动恢复下载队列
    this.wifiGateSub = DeviceEventEmitter.addListener(WIFI_PROMPT_RESOLVED, () => {
      console.log('[Downloader] 📶 [wifiPromptResolved] 闸门放行，恢复下载队列');
      this.startDownload();
    });
  }

  /**
   * 初始化缓存目录
   */
  private async initCacheDir() {
    try {
      const exists = await RNFS.exists(CACHE_DIR);
      if (!exists) {
        await RNFS.mkdir(CACHE_DIR);
      }
    } catch (error: any) {
      console.error('[Downloader] 初始化缓存目录失败:', error?.message);
      // 【防御性处理】如果目录创建失败，使用备用目录
      try {
        const fallbackDir = `${RNFS.CachesDirectoryPath}/noise_reduction_cache`;
        await RNFS.mkdir(fallbackDir);
        console.log('[Downloader] 使用备用缓存目录:', fallbackDir);
      } catch (fallbackError) {
        console.error('[Downloader] 备用目录也失败:', fallbackError);
      }
    }
  }

  /**
   * 获取资源的本地路径
   * 【🔥🔥🔨 关键修复】背景图必须使用 audio_resources 目录，与 getSceneBackground 保持一致
   * 【修复】增加 AUDIO_MANIFEST 回退查找，支持场景音频资源
   */
  getLocalPath(resourceId: string): string {
    let resource = RESOURCE_MAP[resourceId];
    
    if (!resource) {
      const audioAsset = AUDIO_MANIFEST.find(a => a.id === resourceId);
      if (audioAsset) {
        resource = {
          id: audioAsset.id,
          filename: audioAsset.filename,
          category: audioAsset.category,
          priority: 1,
          remoteUrl: '',
        };
        console.log(`[Downloader] ✅ [getLocalPath] 从 AUDIO_MANIFEST 找到资源: ${resourceId}`);
      }
    }
    
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }
    
     // 【🔥🔥🔨 关键修复】背景图资源使用 audio_resources 目录（与 getSceneBackground 一致）
     if (resource.category && resource.category.startsWith('scene_backgrounds')) {
       const bgDir = `${RNFS.DocumentDirectoryPath}/audio_resources`;

       // 🔧 子目录提取：category 格式为 "scene_backgrounds" 或 "scene_backgrounds/zen"
       // - "scene_backgrounds"       → 无子目录，文件直接放在 audio_resources/
       // - "scene_backgrounds/zen"    → 子目录 zen，放在 audio_resources/zen/
       const hasSubPath = resource.category.includes('/');
       const subDir = hasSubPath
         ? resource.category.replace(/^scene_backgrounds\//, '')
         : '';

       // 构造完整路径：audio_resources/filename.webp 或 audio_resources/zen/filename.webp
       const localPath = subDir
         ? `${bgDir}/${subDir}/${resource.filename}`
         : `${bgDir}/${resource.filename}`;
         
       console.log(`[Downloader] 🖼️ [getLocalPath] 背景图路径: ${localPath} (category: ${resource.category}, subDir: ${subDir})`);
       return localPath;
     }
    
    // 【🔥🔥🔨 关键修复】音频等场景资源必须使用 audio_resources 目录（与 DownloadService.silentBackgroundDownload 保持一致）
    // 原代码错误地使用 noise_reduction_cache，导致用户点击优先下载时文件存到错误路径，ResourceStatusManager 检查不到 → 卡 0%
    const audioAsset = AUDIO_MANIFEST.find(a => a.id === resource.id);
    if (audioAsset) {
      return getAudioLocalPath(audioAsset.category, audioAsset.filename);
    }
    
    // 其他资源（降噪等）继续使用 noise_reduction_cache
    return `${CACHE_DIR}/${resource.filename}`;
  }

  /**
   * 检查资源是否已下载
   */
  async isDownloaded(resourceId: string): Promise<boolean> {
    const localPath = this.getLocalPath(resourceId);
    return await RNFS.exists(localPath);
  }

  /**
   * 获取所有资源的下载状态
   */
  getAllStatus(): DownloadStatus[] {
    return Array.from(this.statusMap.values());
  }

  /**
   * 获取单个资源状态
   */
  getStatus(resourceId: string): DownloadStatus | undefined {
    return this.statusMap.get(resourceId);
  }

  /**
   * 订阅下载状态
   */
  subscribe(callback: (status: DownloadStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知状态更新（旧接口，内部委托给 emitUIChange）
   */
  public notify(status: DownloadStatus) {
    this.emitUIChange(status);
  }

  /**
   * 🔥🔨 Bug #1 修复：notify + DeviceEventEmitter.emit('resourceLoadingChanged') 绑定在一起。
   * 旧代码先 emit 再调 listeners，导致 subscribeDownload 注册的 HomeScreen listener
   * 在 emit 之后才收到 progress tick —— UI 永远看不到实时进度（只看到 completed）。
   */
  private emitUIChange(status: DownloadStatus) {
    this.statusMap.set(status.resourceId, status);
    console.log(`[Downloader] 🔔 [emitUIChange] ${status.resourceId}: ${status.status} (${status.progress}%)`);
    try {
      const RN = require('react-native');
      if (RN.DeviceEventEmitter) {
        RN.DeviceEventEmitter.emit('resourceLoadingChanged', status);
      }
    } catch (_e) { /* UI 未挂载，忽略 */ }
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * 初始化下载队列（按优先级排序）
   */
  initQueue() {
    this.downloadQueue = [...SORTED_RESOURCES];
    console.log('[Downloader] 初始化下载队列，共', this.downloadQueue.length, '个资源');
  }

  /**
   * 【🔧 修复】开始下载 - 带防重入锁，确保同一时间只有一个队列在处理
   */
  async startDownload(): Promise<void> {
    console.log('[Downloader] 🔥 [startDownload] 启动下载');

    // 【防重入】如果队列正在处理中，直接返回（不重复启动）
    if (this.queueProcessingPromise) {
      console.log('[Downloader] ℹ️ [startDownload] 队列正在处理中，跳过重复调用');
      return;
    }

    // 【item2】开启新一轮：解除上一轮熔断并清零连续失败计数（用户点按或冷却续跑均触发）。
    if (this.circuitOpen) {
      console.log('[Downloader] ♻️ [startDownload] 新一轮启动 → 解除熔断，隐藏"网络较慢"提示');
      this.circuitOpen = false;
      this.consecutiveTerminalFailures = 0;
      DeviceEventEmitter.emit(NETWORK_THROTTLE_EVENT, false);
    }

    // 【PR-2 WiFi 提示】移动数据且用户未允许 → 挂起（任务保留在队列，闸门放行后自动恢复）
    const gate = await NetworkGateService.requestDownloadAccess();
    if (gate === 'waiting') {
      console.log('[Downloader] ⏸️ [startDownload] 移动数据未允许，挂起下载任务');
      return;
    }

    this.isDownloading = true;

    // 启动队列处理并保存 Promise 引用
    this.queueProcessingPromise = this.processQueue().finally(() => {
      this.queueProcessingPromise = null;
      this.isDownloading = false;
    });
  }

  /**
   * 【🔧 修复】处理下载队列 - 顺序执行，每个任务完成后才处理下一个。
   * 【item2 限流】串行项间 ≥300ms 间隔；连续 CIRCUIT_BREAKER_THRESHOLD 个文件终态失败 → 熔断本轮，
   *   广播"网络较慢"并安排冷却续跑。
   * 【req#3 非阻塞退避】单文件失败按 30s/2min/10min 指数退避重排队尾；退避用时间戳记录而非 inline sleep——
   *   否则一个慢/坏文件会把整条串行队列冻结最长 10min。全部任务都在退避时安排"最近到期即唤醒"定时器后退出本轮。
   */
  private async processQueue() {
    console.log(`[Downloader] 🔥 [processQueue] 开始处理队列，任务数: ${this.downloadQueue.length}`);

    while (this.downloadQueue.length > 0) {
      if (this.circuitOpen) {
        console.warn(`[Downloader] ⛔ [CIRCUIT] 本轮已熔断 → 停止取任务；剩余 ${this.downloadQueue.length} 个待冷却续跑`);
        break;
      }

      const resource = this.downloadQueue.shift();
      if (!resource) continue;

      // 【req#3】未到重试时间点的任务 → 移到队尾让其它可执行任务先跑；若整条队列都在退避，安排唤醒定时器后退出本轮。
      const sched = this.retrySchedule.get(resource.id);
      const now = Date.now();
      if (sched && sched.nextRetryAt > now) {
        this.downloadQueue.push(resource);
        if (!this.hasRunnableTask()) {
          let soonest = Infinity;
          for (const r of this.downloadQueue) {
            const s = this.retrySchedule.get(r.id);
            const due = s ? s.nextRetryAt : 0;
            if (due < soonest) soonest = due;
          }
          const wakeMs = Math.max(50, soonest - Date.now());
          console.log(`[Downloader] ⏳ [retry] 全部任务退避中 → ${Math.round(wakeMs / 1000)}s 后唤醒续跑`);
          this.scheduleRetryFlush(wakeMs);
          break;
        }
        continue; // 还有别的可立即执行的任务，先处理它们
      }

      console.log(`[Downloader] 🔥 [processQueue] 处理任务: ${resource.filename} | URL: ${resource.remoteUrl}`);

      try {
        await this.downloadResource(resource);
        // ✅ 成功 → 清零连续失败计数 + 该项退避计划（打破"偶发失败累积误熔断"，并解除源冷却由 recordHostResult 负责）。
        this.consecutiveTerminalFailures = 0;
        this.retryCount.delete(resource.id);
        this.retrySchedule.delete(resource.id);
      } catch (error: any) {
        const attempts = (sched?.attempts ?? 0) + 1; // 含首次在内的第几次尝试
        if (attempts <= MAX_RETRY_ROUNDS) {
          const waitMs = RETRY_BACKOFF_MS[attempts - 1];
          this.retrySchedule.set(resource.id, { attempts, nextRetryAt: Date.now() + waitMs });
          console.warn(`[Downloader] 🔄 ${resource.filename} 第${attempts}次失败 → ${waitMs / 1000}s 退避后重试 (error=${error?.message || error})`);
          this.downloadQueue.push(resource); // 【req#3】非阻塞重排队尾，到点由唤醒/后续轮次续跑
        } else {
          // ❌ 终态失败：所有 CDN 源 + 全部退避重试均耗尽 → 标 failed（UI 显示中性"暂时下载不了"）。
          console.error(`[Downloader] ❌ ${resource.filename} 终态失败(已重试${MAX_RETRY_ROUNDS}轮): ${error?.message || error}`);
          this.retrySchedule.delete(resource.id);
          this.retryCount.delete(resource.id);
          this.notify({
            resourceId: resource.id,
            filename: resource.filename,
            progress: 0,
            status: 'failed',
            error: error?.message || 'Unknown error',
          });
          this.consecutiveTerminalFailures += 1;
          if (this.consecutiveTerminalFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            this.circuitOpen = true;
            console.warn(`[Downloader] ⛔ [CIRCUIT] 连续 ${this.consecutiveTerminalFailures} 个文件终态失败 → 熔断本轮自动批量，提示"网络较慢"`);
            DeviceEventEmitter.emit(NETWORK_THROTTLE_EVENT, true);
          }
        }
      }

      // 串行项间节流：非熔断且仍有【可立即执行】任务时，间隔 ≥300ms 再放下一个，避免打爆共享代理。
      if (!this.circuitOpen && this.hasRunnableTask()) {
        await this.sleep(INTER_ITEM_DELAY_MS);
      }
    }

    // 熔断后安排一次冷却续跑（诚实兑现"稍后会自动继续"）。
    if (this.circuitOpen && this.downloadQueue.length > 0) {
      this.scheduleResume();
    }

    console.log('[Downloader] ✅ [processQueue] 本轮队列处理结束');
  }

  /** 【req#3】队列中是否存在"现在就能跑"(无退避计划或已到点)的任务。 */
  private hasRunnableTask(): boolean {
    const now = Date.now();
    for (const r of this.downloadQueue) {
      const s = this.retrySchedule.get(r.id);
      if (!s || s.nextRetryAt <= now) return true;
    }
    return false;
  }

  /** 【req#3】全部任务退避中时，安排最近到期唤醒（复用 startDownload 防重入锁；离线则跳过等网络恢复事件）。 */
  private scheduleRetryFlush(ms: number) {
    if (this.retryFlushTimer) clearTimeout(this.retryFlushTimer);
    this.retryFlushTimer = setTimeout(() => {
      this.retryFlushTimer = null;
      if (NetworkGateService.isOffline()) {
        console.log('[Downloader] ⏸️ [retry-wake] 退避到期但仍离线 → 暂不续跑，等网络恢复事件');
        return;
      }
      console.log('[Downloader] ♻️ [retry-wake] 退避到期 → 唤醒队列续跑');
      this.startDownload();
    }, ms);
  }

  /** 【item2】sleep 辅助。 */
  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** 【item2 熔断】冷却到期后自动续跑剩余队列（仍离线则跳过，等下次网络恢复事件）。 */
  private scheduleResume() {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (NetworkGateService.isOffline()) {
        console.log('[Downloader] ⏸️ [resume] 熔断冷却结束但仍离线 → 暂不续跑');
        return;
      }
      console.log('[Downloader] ♻️ [resume] 熔断冷却结束 → 自动续跑剩余队列');
      this.startDownload(); // startDownload 内部会解除熔断并广播恢复
    }, CIRCUIT_RESUME_COOLDOWN_MS);
  }

  /** 【item2】当前是否处于熔断暂停（HomeScreen 初始化横幅用）。 */
  isAutoBatchPaused(): boolean {
    return this.circuitOpen;
  }

  /**
   * 【前端重构】使用 fetch + blob + RNFS.writeFile 替换 RNFS.downloadFile
   * 避免原生层 Java Downloader.java 在 Release 包中的死锁问题
   */
  private async downloadResource(resource: AudioResource) {
    const localPath = this.getLocalPath(resource.id);
    
    console.log(`[Downloader] 🔥 [downloadResource] 本地路径: ${localPath}`);
    
    // 【🔥🔥🔨 关键修复】检查文件是否已存在，避免重复下载导致状态死循环
    console.log(`[Downloader] 🔍 [FILE_CHECK] 开始检查文件是否存在...`);
    try {
      const fileExists = await RNFS.exists(localPath);
      console.log(`[Downloader] 🔍 [FILE_CHECK] RNFS.exists 结果: ${fileExists}`);
      
      if (fileExists) {
        const stat = await RNFS.stat(localPath);
        console.log(`[Downloader] 🔍 [FILE_CHECK] 文件大小: ${stat.size} bytes`);
        
        if (stat.size > 0) {
          // 【P1-5 增强】已知期望大小且实际显著偏小 → 历史版本截断/损坏文件（旧 bug 曾只写前 1MB），删除重下
          const expected = this.getExpectedSize(resource.id);
          if (expected > 0 && stat.size < expected * 0.95) {
            console.warn(`[Downloader] ⚠️ [FILE_CHECK] ${resource.filename} 大小 ${stat.size}B 低于期望 ${expected}B，判定损坏文件，删除重下`);
            try { await RNFS.unlink(localPath); } catch (_e2) {}
          } else {
            console.log(`[Downloader] ✅ [downloadResource] 文件已存在: ${resource.filename} (${stat.size} bytes)`);
            console.log(`[Downloader] ✅ [downloadResource] 跳过重复下载，直接标记为 completed`);
            console.log(`[Downloader] ⛔ [EARLY_RETURN] 提前退出，不执行 fetch`);
          
            this.notify({
              resourceId: resource.id,
              filename: resource.filename,
              progress: 100,
              status: 'completed',
            });
          
            return;  // 🎯 直接返回，不重复下载
          }
        } else {
          console.log(`[Downloader] ⚠️ [FILE_CHECK] 文件存在但大小为 0，需要重新下载`);
        }
      } else {
        console.log(`[Downloader] 🆕 [FILE_CHECK] 文件不存在，开始下载`);
      }
    } catch (e) {
      console.warn(`[Downloader] ⚠️ [downloadResource] 检查文件存在性失败:`, e);
      console.log(`[Downloader] ➡️ [FILE_CHECK] 异常时继续下载流程`);
      // 继续下载，不影响主流程
    }
    
    // 【P1-1】通过统一入口 getAssetUrls 解析 CDN URL 列表（4 级故障转移，替代旧单 ghproxy.net 源）
    const urls = this.getUrlsForResource(resource);
    console.log(`[Downloader] 🌐 [URLS] ${resource.filename} 可用源 (${urls.length})`);
    urls.forEach((u, i) => console.log(`[Downloader] 🌐 [URLS]   [${i}] ${u}`));

    // 【关键修复】统一在 fetch 前创建父目录，防止 ENOENT
    const _dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
    try {
      await RNFS.mkdir(_dirPath);
      console.log(`[Downloader] ✅ [MKDIR] 目录已确保: ${_dirPath}`);
    } catch (mkdirErr: any) {
      console.warn(`[Downloader] ⚠️ [MKDIR] 创建目录失败: ${mkdirErr.message}`);
    }

    try {
      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 0,
        status: 'downloading',
      });

      let totalWritten = 0;

      // 【P1-1】CDN 故障转移循环：当前源失败（网络错误/超时/HTTP 4xx/5xx）则切换下一源，
      // 全部源耗尽后才抛出进入外层重试队列逻辑。
      // 【req#1 快速切换】urls 已按健康度排序(冷却死源在末位)；若存在未冷却源，本轮直接跳过冷却中的死源，
      //   连一次连接超时都不浪费（mirror.ghproxy 已死 → 不再逐次烧 20s 才轮到下一家）。全冷却时仍保留兜底尝试。
      const nowTs = Date.now();
      const isCooled = (u: string) => {
        const h = this.hostHealth.get(this.hostOf(u));
        return !!(h && h.cooldownUntil > nowTs);
      };
      const cooled = urls.filter(isCooled);
      const healthy = urls.filter((u) => !isCooled(u));
      const attemptUrls = healthy.length > 0 ? healthy : urls;
      if (cooled.length > 0 && healthy.length > 0) {
        console.log(`[Downloader] 🚧 [FAILOVER] ${resource.filename} 跳过冷却中的源: ${cooled.map((u) => this.hostOf(u)).join(', ')}`);
      }

      for (let urlIdx = 0; urlIdx < attemptUrls.length; urlIdx++) {
        const url = attemptUrls[urlIdx];

        // 【P1-5】断点续传：.part 跨源保留。所有镜像提供同一文件内容（同仓库不同代理），
        // 已写入的 .part 是合法前缀（每次 appendFile/writeFile 都是完整块原子写入），
        // streamDownloadTo 内部会探测断点并带 Range 续传；若服务端不支持 Range 会自动丢弃从 0 重下。
        // 不再无条件 unlink(localPath) —— 那会毁掉续传状态。

        if (urlIdx > 0) {
          console.log(`[Downloader] 🔀 [FAILOVER] ${resource.filename} 切换源 ${urlIdx + 1}/${attemptUrls.length}: ${url}`);
        }

        try {
          totalWritten = await this.streamDownloadTo(resource, url, localPath);
          this.recordHostResult(url, true); // 【req#1】该源成功 → 清零失败/解除冷却（自愈）
          break; // ✅ 当前源成功
        } catch (error: any) {
          this.recordHostResult(url, false); // 【req#1】该源失败 → 累计健康度，达阈值进冷却并降位
          console.error(`[Downloader] ❌ [URL_FAIL] 源 ${urlIdx + 1}/${attemptUrls.length} 失败 (${url}):`, error?.message || error);
          if (urlIdx === attemptUrls.length - 1) throw error; // 所有源耗尽 → 交给外层 catch 重试逻辑
        }
      }

      console.log(`[Downloader] ✅ ${resource.filename} 下载完成: ${totalWritten} bytes`);

      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 100,
        status: 'completed',
      });
      this.retryCount.delete(resource.id);

      // 🔄 轮询直到 stat.size == totalWritten（确保 fsync 落盘完成后再标记可用）
      await this.pollUntilReady(localPath, totalWritten);
    } catch (error: any) {
      // 【item2】重试/退避/熔断统一由 processQueue 负责，这里只把失败向上抛出（保留 currentDownload 清理）。
      console.error(`[Downloader] ❌ [downloadResource] ${resource.filename} 本次尝试失败:`, error?.message);
      throw error;
    } finally {
      this.currentDownload = null;
    }
  }

  /** 【P1-1】资源的期望字节数（0 = 未知，进度切换为模拟模式） */
  private getExpectedSize(resourceId: string): number {
    const fromAssetList = ASSET_LIST.find(a => a.id === resourceId);
    if (fromAssetList && fromAssetList.expectedSize > 0) return fromAssetList.expectedSize;
    const manifestItem = AUDIO_MANIFEST.find(a => a.id === resourceId);
    return manifestItem ? manifestItem.size : 0;
  }

  /** 【req#1】从 URL 提取 host 作为健康度键（ghproxy.net / mirror.ghproxy.com / cdn.statically.io / raw.githubusercontent.com）。 */
  private hostOf(url: string): string {
    const m = /^https?:\/\/([^/]+)/i.exec(url);
    return m ? m[1].toLowerCase() : url;
  }

  /** 【req#1】记录某源本次成败，维护健康度：成功清零并解除冷却（自愈）；连续失败达阈值进入冷却。 */
  private recordHostResult(url: string, ok: boolean) {
    const host = this.hostOf(url);
    const cur = this.hostHealth.get(host) ?? { fails: 0, cooldownUntil: 0 };
    if (ok) {
      if (cur.fails !== 0 || cur.cooldownUntil !== 0) {
        console.log(`[Downloader] ✅ [HEALTH] ${host} 成功 → 解除冷却/清零失败计数`);
      }
      this.hostHealth.set(host, { fails: 0, cooldownUntil: 0 });
      return;
    }
    cur.fails += 1;
    if (cur.fails >= HOST_FAIL_THRESHOLD) {
      cur.cooldownUntil = Date.now() + HOST_COOLDOWN_MS;
      console.warn(`[Downloader] 🚧 [HEALTH] ${host} 连续失败 ${cur.fails} 次 → 冷却 ${HOST_COOLDOWN_MS / 60000}min，排序降末位并优先跳过`);
    }
    this.hostHealth.set(host, cur);
  }

  /**
   * 【P1-1 + req#1】解析资源的 CDN URL 列表（统一走 getAssetUrls），并按源健康度动态排序：
   * - 静态序已把死源 mirror.ghproxy 降到末位、慢但活的 ghproxy.net/statically 前置；
   * - 运行时再把"冷却中的 host"(连续失败≥阈值)整体压到列表末尾，未冷却的按原相对顺序优先——
   *   确保不会在已知死源上逐轮烧重试次数才轮到下一家（快速切换）。冷却到期自动回到正常位。
   */
  private getUrlsForResource(resource: AudioResource): string[] {
    const base = this.resolveBaseUrls(resource);
    return this.rankUrlsByHealth(base);
  }

  /** 【req#1】按 host 健康度稳定排序：未冷却在前(保持原相对序)，冷却中在后。 */
  private rankUrlsByHealth(urls: string[]): string[] {
    const now = Date.now();
    const cooled = (u: string) => {
      const h = this.hostHealth.get(this.hostOf(u));
      return !!(h && h.cooldownUntil > now);
    };
    // 稳定分区：未冷却保持原序在前，冷却中的保持原序在后。
    const healthy = urls.filter((u) => !cooled(u));
    const degraded = urls.filter((u) => cooled(u));
    if (degraded.length > 0) {
      console.log(`[Downloader] 🚧 [HEALTH] 本轮降位冷却源: ${degraded.map((u) => this.hostOf(u)).join(', ')}`);
    }
    return [...healthy, ...degraded];
  }

  /** 【P1-1】把资源解析为静态 CDN URL 列表（manifest / 仓库路径 / 原单源回退）。 */
  private resolveBaseUrls(resource: AudioResource): string[] {
    const manifestItem = AUDIO_MANIFEST.find(a => a.id === resource.id);
    if (manifestItem) return getAssetUrls(manifestItem.filename);

    // 非 manifest 资源（如降噪系列）：从 remoteUrl 中提取仓库相对路径构造 URL 列表
    const marker = 'sound-therapy-assets/main/';
    const idx = resource.remoteUrl.indexOf(marker);
    if (idx >= 0) {
      return getAssetUrls(decodeURIComponent(resource.remoteUrl.slice(idx + marker.length)));
    }

    console.warn(`[Downloader] ⚠️ [URLS] ${resource.id} 无法解析仓库路径，回退原单源: ${resource.remoteUrl}`);
    return [resource.remoteUrl];
  }

  /**
   * 【P1-1 + P1-5】单源下载核心（超时看门狗 + 断点续传）：fetch → 流式/arrayBuffer → 写盘。
   * - 断点续传：数据写入 `${localPath}.part`；重试时探测 .part 大小，带 `Range: bytes=N-` 请求，
   *   用 appendFile 追加。服务端忽略 Range（返回 200）→ 丢弃 .part 从 0 重下；
   *   返回 416 → .part 实际已完整，直接改名。.part 是合法前缀（每次写入都是完整块），续传安全。
   * - 连接阶段：DOWNLOAD_CONN_TIMEOUT_MS 内未收到响应即 abort；
   * - 流式路径：每个新 chunk 重置停滞计时，STREAM_STALL_TIMEOUT_MS 无数据即 abort；
   * - arrayBuffer 回退（RN whatwg-fetch 实际主路径）：按 Content-Length × 最低可行速率估算读预算，
   *   race 定时器双保险确保 await 必然 settle。
   */
  private async streamDownloadTo(resource: AudioResource, url: string, localPath: string): Promise<number> {
    const controller = new AbortController();
    const expectedSize = this.getExpectedSize(resource.id);
    const partPath = `${localPath}.part`;

    // ══【P1-5】断点探测══
    let startOffset = 0;
    try {
      if (await RNFS.exists(partPath)) {
        const partStat = await RNFS.stat(partPath);
        startOffset = Number(partStat.size) || 0;
        if (expectedSize > 0 && startOffset >= expectedSize) {
          // 上次数据已写满但改名前进程被杀 → 直接改名完成，零网络请求
          console.log(`[Downloader] ✅ [RESUME] .part 已达期望大小 (${startOffset}/${expectedSize})，跳过重下`);
          await RNFS.moveFile(partPath, localPath);
          return startOffset;
        }
        if (startOffset > 0) {
          console.log(`[Downloader] 📌 [RESUME] 发现断点: ${partPath} (${startOffset} bytes)，尝试 Range 续传`);
        }
      }
    } catch (e: any) {
      console.warn(`[Downloader] ⚠️ [RESUME] 断点探测失败，全新下载:`, e?.message);
      startOffset = 0;
    }

    // 【P1-1 进度修复】已知大小 → stat.size/expectedSize 真实进度；未知 → 按 chunk 模拟（上限 95%），UI 不再恒为 0%
    let simProgress = 0;
    let lastNotified = -1;

    const notifyRealProgress = () => {
      RNFS.stat(partPath).then(
        (stat: any) => {
          const bytes = Number(stat.size) || 0;
          // 【item4 进度真实性】每 1s 打印 .part 实际落盘字节/期望总量：
          //   · 流式路径应逐秒递增 → 真在收流量；
          //   · arrayBuffer 回退路径(RN whatwg-fetch 主路径)会长时间停在 0、完成瞬间跳满 →
          //     证明"有流量但进度事件没上 UI"这一病（RN fetch 不暴露中间字节，只能等整包）。
          const totalTag = expectedSize > 0 ? String(expectedSize) : '?';
          const pctTag = expectedSize > 0 ? ` (${Math.min(95, Math.floor((bytes / expectedSize) * 100))}%)` : '';
          console.log(`[DL-PROGRESS] ${resource.filename} bytes=${bytes}/${totalTag}${pctTag}`);
          const real = expectedSize > 0 ? Math.min(95, Math.floor((bytes / expectedSize) * 100)) : simProgress;
          if (real > lastNotified) {
            lastNotified = real;
            this.notify({ resourceId: resource.id, filename: resource.filename, progress: real, status: 'downloading' });
          }
        },
        () => {} // 文件尚未创建或 stat 失败，忽略
      );
    };
    const progressInterval = setInterval(notifyRealProgress, 1000);

    let connTimer: ReturnType<typeof setTimeout> | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const armStallWatchdog = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        console.warn(`[Downloader] ⏱️ [STALL_WATCHDOG] ${resource.filename} 已 ${Math.round(ms / 1000)}s 无数据，中止当前源`);
        controller.abort();
      }, ms);
    };

    let newBytes = 0; // 本次新写入字节数（不含断点）
    let finalSize = 0; // 最终文件字节数（优先取实际 stat，stat 不可用时回退为断点+新增）

    try {
      // 连接阶段超时：10s 未收到响应头即 abort
      connTimer = setTimeout(() => {
        console.warn(`[Downloader] ⏱️ [CONN_TIMEOUT] ${resource.filename} ${DOWNLOAD_CONN_TIMEOUT_MS}ms 无响应，中止`);
        controller.abort();
      }, DOWNLOAD_CONN_TIMEOUT_MS);

      const headers: Record<string, string> = {};
      if (startOffset > 0) headers['Range'] = `bytes=${startOffset}-`;

      const response = await fetch(url, { signal: controller.signal, headers });
      if (connTimer) clearTimeout(connTimer);
      connTimer = null;

      // 【item1 取证】打印本次请求的 HTTP 状态码与响应声明的字节数，便于判读限流(429/503)/404/截断。
      console.log(`[DL-TRACE] ${resource.filename} HTTP=${response.status} contentLength=${response.headers?.get('content-length') || '?'} expectedSize=${expectedSize} startOffset=${startOffset} url=${url}`);

      // ══【P1-5】服务端 Range 响应处理══
      if (startOffset > 0 && response.status === 200) {
        // 服务端不支持 Range：丢弃断点，从 0 重下
        console.warn(`[Downloader] ⚠️ [RESUME] 服务端忽略 Range (HTTP 200)，丢弃断点重新下载`);
        try { await RNFS.unlink(partPath); } catch (_e) {}
        startOffset = 0;
      } else if (startOffset > 0 && response.status === 416) {
        // Range Not Satisfiable：.part 实际已完整
        console.log(`[Downloader] ✅ [RESUME] HTTP 416，.part 实际已完整，直接改名`);
        await RNFS.moveFile(partPath, localPath);
        return startOffset;
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if ((response as any).body && typeof (response as any).body.getReader === 'function') {
        // ══ 流式路径（Web Streams 可用时）══
        const reader = (response as any).body.getReader();
        armStallWatchdog(STREAM_STALL_TIMEOUT_MS);

        if (startOffset === 0 && !(await RNFS.exists(partPath))) {
          await RNFS.writeFile(partPath, '', 'base64'); // 预创建空文件，保证 appendFile 可追加
        }

        while (true) {
          const readResult: { done: boolean; value?: Uint8Array } = await reader.read();
          if (readResult.done || !readResult.value) break;

          // 【P1-1 修复】旧代码此处同样截断 >1MB 的 chunk；现在整块写入
          const bytes = new Uint8Array(readResult.value);
          await RNFS.appendFile(partPath, bytesToBase64(bytes), 'base64');
          newBytes += bytes.length;

          simProgress = Math.min(95, simProgress + 2); // 未知大小时的模拟进度递增
          armStallWatchdog(STREAM_STALL_TIMEOUT_MS);   // 新 chunk 到达，重置看门狗
        }
      } else {
        // ══ arrayBuffer 回退路径（RN 的 whatwg-fetch 未实现 Response.body，此为实际主路径）══
        const contentLength = Number(response.headers?.get('content-length') || 0);
        const readBudgetMs = contentLength > 0 ? bodyReadBudget(contentLength) : BODY_READ_DEFAULT_BUDGET_MS;
        armStallWatchdog(readBudgetMs);

        // 双保险：即使 abort 因故未传播，race 定时器也保证本 await 必然 settle（防永久挂起阻塞串行队列）
        const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const guard = setTimeout(() => {
            controller.abort();
            reject(new Error(`Body read timeout (${readBudgetMs}ms)`));
          }, readBudgetMs);
          response.arrayBuffer().then(
            (buf: ArrayBuffer) => { clearTimeout(guard); resolve(buf); },
            (err: any) => { clearTimeout(guard); reject(err); }
          );
        });

        const uint8 = new Uint8Array(buffer);
        if (startOffset > 0) {
          await RNFS.appendFile(partPath, bytesToBase64(uint8), 'base64'); // 续传：追加到断点
        } else {
          await RNFS.writeFile(partPath, bytesToBase64(uint8), 'base64'); // 全新下载：覆盖写（与旧行为一致）
        }
        newBytes = uint8.length;
        console.log(`[Downloader] ✅ [FALLBACK] arrayBuffer 全量写入完成: ${newBytes} bytes (本次)`);
      }

      // ══【P1-5】完整性校验 + 改名══
      let finalStat: any = null;
      try { finalStat = await RNFS.stat(partPath); } catch (_e) { finalStat = null; }
      if (finalStat && expectedSize > 0 && finalStat.size !== expectedSize) {
        // 校验失败：保留 .part（下次从新断点续传），绝不删除、绝不改名
        throw new Error(`大小校验失败: 期望 ${expectedSize}B，实际 ${finalStat.size}B`);
      }
      finalSize = finalStat ? Number(finalStat.size) || startOffset + newBytes : startOffset + newBytes;

      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;

      await RNFS.moveFile(partPath, localPath);
      console.log(`[Downloader] 📦 [RESUME] 改名完成: ${partPath} → ${localPath}`);
    } finally {
      clearInterval(progressInterval);
      if (connTimer) clearTimeout(connTimer);
      if (stallTimer) clearTimeout(stallTimer);
    }

    return finalSize;
  }

  /**
   * 取消下载
   */
  cancelDownload() {
    if (this.currentDownload) {
      this.currentDownload.cancel();
      this.currentDownload = null;
    }
    this.isDownloading = false;
    console.log('[Downloader] 下载已取消');
  }

  /**
   * 清理缓存
   */
  async clearCache() {
    try {
      if (await RNFS.exists(CACHE_DIR)) {
        await RNFS.unlink(CACHE_DIR);
        await RNFS.mkdir(CACHE_DIR);
        this.statusMap.clear();
        console.log('[Downloader] 缓存已清理');
      }
    } catch (error) {
      console.error('[Downloader] 清理缓存失败:', error);
    }
  }

  /**
   * 获取缓存大小（MB）
   */
  async getCacheSize(): Promise<number> {
    try {
      if (await RNFS.exists(CACHE_DIR)) {
        const stat = await RNFS.stat(CACHE_DIR);
        return stat.size / (1024 * 1024);
      }
      return 0;
    } catch (_error) {
      console.error('[Downloader] 获取缓存大小失败');
      return 0;
    }
  }

  /**
   * 🔄🔧 pollUntilReady：等待 appendFile chunked transfer fsync 完成。
   * RNFS.writeFile (writeStream) 会先返回 "文件就绪"，但底层 fsync 异步执行 —
   * stat.size 持续跳动（0→128KB→456KB→…），导致 UI 跳到 100% 后又闪回进度条。
   * 每 3s 轮询一次 stat.size，直到达到 totalWritten（含 5% 容忍度）后停。
   */
  private async pollUntilReady(localPath: string, totalWritten: number): Promise<void> {
    console.log(`[Downloader] 🔄 [pollUntilReady] 等待文件落盘: ${totalWritten} bytes`);
    let attempts = 0;
    while (attempts < 60) { // 最多等 ~3min（180s / 3s）
      try {
        const stat = await RNFS.stat(localPath);
        if (stat.size >= totalWritten * 0.95 && stat.size > 0) break;
      } catch (_e) {}
      await new Promise<void>((r) => setTimeout(() => r(), 3000));
      attempts++;
    }
    console.log(`[Downloader] ✅ [pollUntilReady] ${totalWritten} bytes 落盘完成 (attempts: ${attempts})`);
  }

  /**
   * 【🔥🔥🔨 关键修复】添加场景音频任务到队列（最高优先级）
   * 【修复】修正远程 URL 构造逻辑
   */
  addSceneAudioTask(sceneId: string) {
    console.log(`[Downloader] 📋 [addSceneAudioTask] 添加任务: ${sceneId}`);
    const asset = AUDIO_MANIFEST.find(a => a.id === sceneId);
    if (asset) {
      // ghproxy.net 代理源（kkgithub 国内已不可用，改用 ghproxy）
      const GITHUB_BASE = 'https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main';
      const resource: AudioResource = {
        id: asset.id,
        filename: asset.filename,
        category: asset.category,
        priority: 1,
        remoteUrl: `${GITHUB_BASE}/${asset.filename}`,
      };
      this.downloadQueue.unshift(resource);
      console.log(`[Downloader] ✅ ${sceneId} 已加入队列头部 | URL: ${resource.remoteUrl}`);
    } else {
      console.warn(`[Downloader] ⚠️ ${sceneId} 资源不存在于 AUDIO_MANIFEST`);
    }
  }

  /**
   * 【🆕 关键新增】添加场景背景图任务到队列
   * 
   * 根据场景 ID 查找对应的背景图资源，并加入下载队列
   * 确保音频和背景图都能被下载，从而让 isResourceReady = true
   */
  addSceneBackgroundTask(sceneId: string) {
    console.log(`[Downloader] 🖼️ [addSceneBackgroundTask] 查找背景图: ${sceneId}`);
    
    let bgFilename: string | undefined;
    
    // 东方禅意场景背景图映射
    if (sceneId.startsWith('oriental_')) {
      const ORIENTAL_BG_MAP: Record<string, string> = {
        oriental_zen_monastery: 'bg_temple_lantern_gate.webp',
        oriental_tibetan_bowl: 'bg_temple_zen_lantern.webp',
        oriental_morning_buddha: 'buddha_morning.webp',
      };
      bgFilename = ORIENTAL_BG_MAP[sceneId];
    }
    
    // 西方教会场景背景图映射
    if (sceneId.startsWith('western_church_')) {
      const WESTERN_CHURCH_BG_MAP: Record<string, string> = {
        western_church_morning_bell: 'western_church_candlelight.webp',
        western_church_gregorian: 'western_church_corridor.webp',
        western_church_holy_waves: 'western_church_light_rays.webp',
        western_church_urban_chant: 'western_church_sunlight_monastery.webp',
        western_church_forest_echo: 'western_church_candlelight.webp',
      };
      bgFilename = WESTERN_CHURCH_BG_MAP[sceneId];
    }
    
    if (!bgFilename) {
      console.log(`[Downloader] ℹ️ [addSceneBackgroundTask] ${sceneId} 无需背景图（使用静态资源）`);
      return;  // 该场景不需要动态背景图
    }
    
    // 从 SCENE_BACKGROUND_RESOURCES 查找对应的资源对象
    const bgResource = SCENE_BACKGROUND_RESOURCES.find(r => r.filename === bgFilename);
    
    if (!bgResource) {
      console.warn(`[Downloader] ⚠️ [addSceneBackgroundTask] 未找到背景图资源: ${bgFilename}`);
      return;
    }
    
    // 检查是否已在队列中
    if (this.downloadQueue.find(r => r.id === bgResource.id)) {
      console.log(`[Downloader] ℹ️ [addSceneBackgroundTask] ${bgResource.id} 已在队列中`);
      return;
    }
    
    // 加入队列
    this.downloadQueue.push(bgResource);  // 背景图优先级低，放到队尾
    console.log(`[Downloader] ✅🖼️ [addSceneBackgroundTask] ${sceneId} 的背景图已加入队列: ${bgResource.filename} | URL: ${bgResource.remoteUrl}`);
  }

  /**
   * 【🔧 修复】添加任务到队列 - 通过 startDownload 安全启动（带防重入锁）
   * 同时下载音频 + 背景图
   */
  addTaskToQueue(sceneId: string) {
    console.log(`[Downloader] 🔥 [addTaskToQueue] 添加任务: ${sceneId}`);

    // 1. 优先尝试场景音频（高优先级，放到队列头部）
    this.addSceneAudioTask(sceneId);

    // 2. 同时添加背景图（低优先级，放到队列尾部）
    this.addSceneBackgroundTask(sceneId);

    // 如果是降噪音频或背景图
    const resource = RESOURCE_MAP[sceneId];
    if (resource && !this.downloadQueue.find(r => r.id === sceneId)) {
      this.downloadQueue.unshift(resource);
      console.log(`[Downloader] ✅ ${sceneId} 已加入队列头部 (降音/背景图)`);
    }

    // 【🔧 修复】通过 startDownload 启动，带防重入锁，不会重复处理队列
    console.log(`[Downloader] 🔥 [addTaskToQueue] 触发下载...`);
    this.startDownload();
  }
}

// 导出单例
export const DownloaderServiceInstance = new DownloaderService();

// 导出便捷函数
export const getLocalPath = (resourceId: string) => 
  DownloaderServiceInstance.getLocalPath(resourceId);

export const isDownloaded = (resourceId: string) => 
  DownloaderServiceInstance.isDownloaded(resourceId);

export const subscribeDownload = (callback: (status: DownloadStatus) => void) =>
  DownloaderServiceInstance.subscribe(callback);

/** 【item2】当前自动批量是否因限流熔断而暂停（HomeScreen 初始化横幅用）。 */
export const isAutoBatchPaused = () => DownloaderServiceInstance.isAutoBatchPaused();

export const startDownload = () => 
  DownloaderServiceInstance.startDownload();

export const initDownloadQueue = () => 
  DownloaderServiceInstance.initQueue();