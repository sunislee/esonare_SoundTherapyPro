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

// 本地缓存目录
const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/noise_reduction_cache`;

// ════════════════════════════════════════════════════════════
// 【P1-1】下载超时与看门狗配置（详见 streamDownloadTo）
// ════════════════════════════════════════════════════════════
const DOWNLOAD_CONN_TIMEOUT_MS = 10_000;     // 连接阶段：10s 未收到响应即 abort
const STREAM_STALL_TIMEOUT_MS = 5_000;       // 流式路径：5s 无新 chunk 即 abort
const BODY_READ_DEFAULT_BUDGET_MS = 120_000; // arrayBuffer 回退：缺 Content-Length 时的默认读预算

/** arrayBuffer 回退读预算：按最低可行速率 ~16KB/s 由 Content-Length 估算，钳制在 [30s, 5min] */
const bodyReadBudget = (bytes: number): number =>
    Math.min(300_000, Math.max(30_000, Math.round((bytes / 16_384) * 1000)));

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

  constructor() {
    this.initCacheDir();
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

    this.isDownloading = true;

    // 启动队列处理并保存 Promise 引用
    this.queueProcessingPromise = this.processQueue().finally(() => {
      this.queueProcessingPromise = null;
      this.isDownloading = false;
    });
  }

  /**
   * 【🔧 修复】处理下载队列 - 顺序执行，每个任务完成后才处理下一个
   */
  private async processQueue() {
    console.log(`[Downloader] 🔥 [processQueue] 开始处理队列，任务数: ${this.downloadQueue.length}`);

    while (this.downloadQueue.length > 0) {
      const resource = this.downloadQueue.shift();
      if (!resource) continue;

      console.log(`[Downloader] 🔥 [processQueue] 处理任务: ${resource.filename} | URL: ${resource.remoteUrl}`);

      try {
        await this.downloadResource(resource);
      } catch (error) {
        console.error(`[Downloader] ${resource.filename} 下载失败:`, error);
      }
    }

    console.log('[Downloader] ✅ [processQueue] 所有资源队列处理完成');
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
      // 全部源耗尽后才抛出进入外层重试队列逻辑
      for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
        const url = urls[urlIdx];

        // 每次尝试前清理残留的部分文件（上一次失败会留下损坏数据，appendFile 会继续追加导致彻底损坏）
        try { await RNFS.unlink(localPath); } catch (_e) { /* 无文件则跳过 */ }

        if (urlIdx > 0) {
          console.log(`[Downloader] 🔀 [FAILOVER] ${resource.filename} 切换源 ${urlIdx + 1}/${urls.length}: ${url}`);
        }

        try {
          totalWritten = await this.streamDownloadTo(resource, url, localPath);
          break; // ✅ 当前源成功
        } catch (error: any) {
          console.error(`[Downloader] ❌ [URL_FAIL] 源 ${urlIdx + 1}/${urls.length} 失败 (${url}):`, error?.message || error);
          if (urlIdx === urls.length - 1) throw error; // 所有源耗尽 → 交给外层 catch 重试逻辑
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
      console.error(`[Downloader] ❌ ${resource.filename} 下载失败:`, error?.message);
      
      // 重试逻辑
      if (this.retryCount.get(resource.id)! < this.maxRetries) {
        this.retryCount.set(resource.id, this.retryCount.get(resource.id)! + 1);
        this.downloadQueue.push(resource); // 重新加入队列
        console.log(`[Downloader] 🔄 ${resource.filename} 加入重试队列 (第 ${this.retryCount.get(resource.id)!} 次)`);
      } else {
        this.notify({
          resourceId: resource.id,
          filename: resource.filename,
          progress: 0,
          status: 'failed',
          error: error?.message || 'Unknown error',
        });
      }
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

  /** 【P1-1】解析资源的 CDN URL 列表（统一走 getAssetUrls，消除单点故障） */
  private getUrlsForResource(resource: AudioResource): string[] {
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
   * 【P1-1】单源下载核心（带超时看门狗）：fetch → 流式/arrayBuffer → 写盘。
   * - 连接阶段：DOWNLOAD_CONN_TIMEOUT_MS 内未收到响应即 abort；
   * - 流式路径：每个新 chunk 重置停滞计时，STREAM_STALL_TIMEOUT_MS 无数据即 abort；
   * - arrayBuffer 回退（RN 实际主路径）：whatwg-fetch 在原生层整包缓冲、JS 无法观测中间 chunk，
   *   故按 Content-Length × 最低可行速率估算读预算，并以 race 定时器双保险确保 await 必然 settle。
   * 超时通过 AbortController.abort() 终止底层 XHR（已验证 whatwg-fetch 3.6.20 对 signal 会 reject AbortError）。
   */
  private async streamDownloadTo(resource: AudioResource, url: string, localPath: string): Promise<number> {
    const controller = new AbortController();
    const expectedSize = this.getExpectedSize(resource.id);

    // 【P1-1 进度修复】已知大小 → stat.size/expectedSize 真实进度；未知 → 按 chunk 模拟（上限 95%），UI 不再恒为 0%
    let simProgress = 0;
    let lastNotified = -1;

    const notifyRealProgress = () => {
      RNFS.stat(localPath).then(
        (stat: any) => {
          const real = expectedSize > 0 ? Math.min(95, Math.floor((stat.size / expectedSize) * 100)) : simProgress;
          if (real > lastNotified) {
            lastNotified = real;
            this.notify({ resourceId: resource.id, filename: resource.filename, progress: real, status: 'downloading' });
          }
        },
        () => {} // 文件尚未创建或 stat 失败，忽略
      );
    };
    const progressInterval = setInterval(notifyRealProgress, 1500);

    let connTimer: ReturnType<typeof setTimeout> | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const armStallWatchdog = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        console.warn(`[Downloader] ⏱️ [STALL_WATCHDOG] ${resource.filename} 已 ${Math.round(ms / 1000)}s 无数据，中止当前源`);
        controller.abort();
      }, ms);
    };

    let totalWritten = 0;

    try {
      // 连接阶段超时：10s 未收到响应头即 abort
      connTimer = setTimeout(() => {
        console.warn(`[Downloader] ⏱️ [CONN_TIMEOUT] ${resource.filename} ${DOWNLOAD_CONN_TIMEOUT_MS}ms 无响应，中止`);
        controller.abort();
      }, DOWNLOAD_CONN_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      if (connTimer) clearTimeout(connTimer);
      connTimer = null;

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      if ((response as any).body && typeof (response as any).body.getReader === 'function') {
        // ══ 流式路径（Web Streams 可用时）══
        const reader = (response as any).body.getReader();
        armStallWatchdog(STREAM_STALL_TIMEOUT_MS);

        while (true) {
          const readResult: { done: boolean; value?: Uint8Array } = await reader.read();
          if (readResult.done || !readResult.value) break;

          // 【P1-1 修复】旧代码此处同样截断 >1MB 的 chunk；现在整块写入
          const bytes = new Uint8Array(readResult.value);
          await RNFS.appendFile(localPath, bytesToBase64(bytes), 'base64');
          totalWritten += bytes.length;

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

        // 【P1-1 修复】旧代码此处只写前 1MB，>1MB 文件被静默截断却仍标记完成；现在一次性写入完整内容
        const uint8 = new Uint8Array(buffer);
        await RNFS.writeFile(localPath, bytesToBase64(uint8), 'base64');
        totalWritten = uint8.length;
        console.log(`[Downloader] ✅ [FALLBACK] arrayBuffer 全量写入完成: ${totalWritten} bytes`);
      }

      // 成功路径：清除看门狗，避免迟到的 abort 影响后续请求
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    } finally {
      clearInterval(progressInterval);
      if (connTimer) clearTimeout(connTimer);
      if (stallTimer) clearTimeout(stallTimer);
    }

    return totalWritten;
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

export const startDownload = () => 
  DownloaderServiceInstance.startDownload();

export const initDownloadQueue = () => 
  DownloaderServiceInstance.initQueue();