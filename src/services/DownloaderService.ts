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
import { AUDIO_MANIFEST, getLocalPath as getAudioLocalPath } from '../constants/audioAssets';

// 本地缓存目录
const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/noise_reduction_cache`;

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
       
       // 🔧 修正子目录提取逻辑：移除 "scene_backgrounds/" 后剩余的路径
       const subDir = resource.category.replace(/^scene_backgrounds\//, '');
       
       // 构造完整路径：audio_resources/zen/filename.webp 或 audio_resources/filename.webp
       const localPath = subDir && subDir !== resource.filename
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
    * 通知状态更新
    */
   public notify(status: DownloadStatus) {
     this.statusMap.set(status.resourceId, status);
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
    console.log(`[Downloader] 🔥🔥🔥 [downloadResource] 穿透测试 - 开始下载: ${resource.filename}`);
    
    const localPath = this.getLocalPath(resource.id);
    
    console.log(`[Downloader] 🔥 [downloadResource] 本地路径: ${localPath}`);
    
    // 【🔥🔥🔨 关键修复】检查文件是否已存在，避免重复下载导致状态死循环
    try {
      const fileExists = await RNFS.exists(localPath);
      if (fileExists) {
        const stat = await RNFS.stat(localPath);
        if (stat.size > 0) {
          console.log(`[Downloader] ✅ [downloadResource] 文件已存在: ${resource.filename} (${stat.size} bytes)`);
          console.log(`[Downloader] ✅ [downloadResource] 跳过重复下载，直接标记为 completed`);
          
          this.notify({
            resourceId: resource.id,
            filename: resource.filename,
            progress: 100,
            status: 'completed',
          });
          
          return;  // 🎯 直接返回，不重复下载
        }
      }
    } catch (e) {
      console.warn(`[Downloader] ⚠️ [downloadResource] 检查文件存在性失败:`, e);
      // 继续下载，不影响主流程
    }
    
    // 【穿透测试】验证远程 URL
    console.log(`[Downloader] 🔥 [downloadResource] 远程URL: ${resource.remoteUrl}`);
    
    try {
      // ════════════════════════════════════════════════════════════
      // 🔥 物理证据日志 - 下载前（6行）
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥🔥🔥 [fetch] ⚡ 物理请求即将发送！`);
      console.log(`[Downloader] 🔥 [fetch] URL: ${resource.remoteUrl}`);
      console.log(`[Downloader] 🔥 [fetch] 目标路径: ${localPath}`);
      console.log(`[Downloader] 🔥 [fetch] 进程 ID: [TypeScript层]`);
      console.log(`[Downloader] 🔥 [fetch] 时间戳: ${Date.now()}`);
      console.log(`[Downloader] 🔥 [fetch] 网络源: ghproxy.net`);
      
      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 0,
        status: 'downloading',
      });

      // ════════════════════════════════════════════════════════════
      // 🔥 第一阶段：使用 fetch 获取资源
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [fetch] 开始获取资源...`);
      const response = await fetch(resource.remoteUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      console.log(`[Downloader] 🔥 [fetch] 响应状态: ${response.status}`);
      
      // ════════════════════════════════════════════════════════════
      // 🔥 第二阶段：转换为 blob
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [fetch] 转换为 blob...`);
      const blob = await response.blob();
      
      console.log(`[Downloader] 🔥 [fetch] blob 大小: ${blob.size} bytes`);
      
      // ════════════════════════════════════════════════════════════
      // 🔥 第三阶段：转换为 base64
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [fetch] 转换为 base64...`);
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // 从 "data:audio/mpeg;base64," 中提取 base64 数据
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      console.log(`[Downloader] 🔥 [fetch] base64 数据长度: ${base64Data.length}`);
      
      // ════════════════════════════════════════════════════════════
      // 🔥 第四阶段：写入本地文件
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [RNFS.writeFile] 写入本地文件: ${localPath}`);
      
      // 确保目录存在
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
      const dirExists = await RNFS.exists(dirPath);
      if (!dirExists) {
        await RNFS.mkdir(dirPath);
        console.log(`[Downloader] 🔥 [RNFS] 已创建目录: ${dirPath}`);
      }
      
      // 写入文件
      await RNFS.writeFile(localPath, base64Data, 'base64');
      
      console.log(`[Downloader] 🔥 [RNFS] 文件写入完成`);
      
      // ════════════════════════════════════════════════════════════
      // 🔥 物理证据日志 - 下载结果
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [RNFS] 下载结果接收`);
      
      if (await RNFS.exists(localPath)) {
        const stat = await RNFS.stat(localPath);
        console.log(`[Downloader] 🔥 [RNFS] 文件大小: ${stat.size} bytes`);
        
        if (stat.size > 0) {
          console.log(`[Downloader] ✅ ${resource.filename} 下载成功`);
          this.notify({
            resourceId: resource.id,
            filename: resource.filename,
            progress: 100,
            status: 'completed',
          });
          this.retryCount.delete(resource.id);
        } else {
          throw new Error('Downloaded file is empty');
        }
      } else {
        throw new Error('File does not exist after download');
      }
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
    } catch (error) {
      console.error('[Downloader] 获取缓存大小失败:', error);
      return 0;
    }
  }

  /**
   * 【🔥🔥🔨 关键修复】添加场景音频任务到队列（最高优先级）
   * 【修复】修正远程 URL 构造逻辑
   */
  addSceneAudioTask(sceneId: string) {
    console.log(`[Downloader] 📋 [addSceneAudioTask] 添加任务: ${sceneId}`);
    const asset = AUDIO_MANIFEST.find(a => a.id === sceneId);
    if (asset) {
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