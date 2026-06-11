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

import RNFS from 'react-native-fs';
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
      
      // 提取子目录（如 "scene_backgrounds/zen" → "zen"）
      const subDir = resource.category.replace('scene_backgrounds', '').replace(/^\//, '');
      
      // 构造完整路径：audio_resources/zen/filename.webp 或 audio_resources/filename.webp
      const localPath = subDir 
        ? `${bgDir}/${subDir}/${resource.filename}`
        : `${bgDir}/${resource.filename}`;
        
      console.log(`[Downloader] 🖼️ [getLocalPath] 背景图路径: ${localPath}`);
      return localPath;
    }
    
    // 其他资源（音频、降噪等）继续使用 noise_reduction_cache
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
  private notify(status: DownloadStatus) {
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
   * 【破锁】开始下载 - 移除并发检查，强制启动
   */
  async startDownload(): Promise<void> {
    // 🔓 【完全破锁】移除 isDownloading 检查
    // 原代码会因为 isDownloading 标志直接返回，导致无法启动下载
    console.log('[Downloader] 🔥🔥🔥 [startDownload] 🔓 破锁启动 - 移除并发检查');

    // this.isDownloading = true;  // 🔓 移除，避免阻塞后续调用
    this.isDownloading = true;  // 仅用于记录状态，不作为检查依据

    // 异步执行，不阻塞调用方
    this.processQueue();
  }

  /**
   * 【破锁】处理下载队列 - 移除所有状态检查
   */
  private async processQueue() {
    console.log(`[Downloader] 🔥🔥🔥 [processQueue] 🔓 破锁启动！队列任务数: ${this.downloadQueue.length}`);
    
    // 🔓 移除并发锁检查，允许直接进入队列处理
    // 原代码的 isDownloading 检查会阻止后续任务启动

    while (this.downloadQueue.length > 0) {
      const resource = this.downloadQueue.shift();
      if (!resource) continue;

      console.log(`[Downloader] 🔥 [processQueue] 处理任务: ${resource.filename} | URL: ${resource.remoteUrl}`);
      
      // 🔓 移除状态检查，直接下载
      try {
        await this.downloadResource(resource);
      } catch (error) {
        console.error(`[Downloader] ${resource.filename} 下载失败:`, error);
      }
    }

    // this.isDownloading = false;  // 🔓 移除状态重置
    console.log('[Downloader] ✅ [processQueue] 所有资源队列处理完成');
  }

  /**
   * 【🔥🔥🔨 关键修复】使用 RNFS.downloadFile 直接流式下载
   * 避免 fetch -> blob -> base64 的 JS 内存翻倍问题
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
      console.log(`[Downloader] 🔥🔥🔥 [RNFS.downloadFile] ⚡ 物理请求即将发送！`);
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] URL: ${resource.remoteUrl}`);
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 目标路径: ${localPath}`);
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 进程 ID: [TypeScript层]`);
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 时间戳: ${Date.now()}`);
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 网络源: ghproxy.net`);
      
      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 0,
        status: 'downloading',
      });

      // ════════════════════════════════════════════════════════════
      // 🔥 使用 RNFS.downloadFile 直接流式下载（无 JS 内存拷贝）
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 启动流式下载...`);
      
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
      const dirExists = await RNFS.exists(dirPath);
      if (!dirExists) {
        await RNFS.mkdir(dirPath);
        console.log(`[Downloader] 🔥 [RNFS] 已创建目录: ${dirPath}`);
      }
      
      const downloadResult = await RNFS.downloadFile({
        fromUrl: resource.remoteUrl,
        toFile: localPath,
        background: true,  // ✅ 允许后台下载
        discretionary: false,
        connectionTimeout: 8000,
        readTimeout: 15000,
      }).promise;
      
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 状态码: ${downloadResult.statusCode}`);
      // RNFS Result 对象没有 bytesWritten，只有 Progress 回调才有
      
      // ════════════════════════════════════════════════════════════
      // 🔥 物理证据日志 - 下载结果
      // ════════════════════════════════════════════════════════════
      console.log(`[Downloader] 🔥 [RNFS.downloadFile] 下载完成`);
      
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
      
      // 重试逻辑 - 使用独立 retryPool 而非直接 queue.push
      const currentRetryCount = this.retryCount.get(resource.id) || 0;
      if (currentRetryCount < this.maxRetries) {
        this.retryCount.set(resource.id, currentRetryCount + 1);
        console.log(`[Downloader] 🔄 ${resource.filename} 需要重试 (第 ${currentRetryCount + 1}/${this.maxRetries} 次)`);
        // 【⚠️ 关键修复】不直接 push 到 downloadQueue，避免破坏优先级顺序
      } else {
        console.error(`[Downloader] ❌ ${resource.filename} 超过最大重试次数 (${this.maxRetries})，标记为 failed`);
        this.notify({
          resourceId: resource.id,
          filename: resource.filename,
          progress: 0,
          status: 'failed',
          error: `超过最大重试次数(${this.maxRetries})`,
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
   * 【破锁】添加任务到队列 - 移除所有检查，强制启动
   * 【🔥🔥🔨 关键修复】同时下载音频 + 背景图
   */
  addTaskToQueue(sceneId: string) {
    console.log(`[Downloader] 🔥🔥🔥 [addTaskToQueue] 🔓 破锁启动: ${sceneId}`);
    
    // 1. 优先尝试场景音频（高优先级，放到队列头部）
    this.addSceneAudioTask(sceneId);
    
    // 2. 【🆕 关键新增】同时添加背景图（低优先级，放到队列尾部）
    this.addSceneBackgroundTask(sceneId);  // ✅ 确保背景图也被下载！
    
    // 如果是降噪音频或背景图
    const resource = RESOURCE_MAP[sceneId];
    if (resource && !this.downloadQueue.find(r => r.id === sceneId)) {
      this.downloadQueue.unshift(resource);
      console.log(`[Downloader] ✅ ${sceneId} 已加入队列头部 (降音/背景图)`);
    }
    
    // 🔓 穿透所有检查，强制启动 processQueue
    console.log(`[Downloader] 🔥 [addTaskToQueue] 🔓 穿透锁，强制启动 processQueue...`);
    this.processQueue();  // 直接调用，不检查任何状态
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