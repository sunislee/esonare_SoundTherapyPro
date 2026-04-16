/**
 * 异步资源下载服务
 * 功能：
 * 1. 非阻塞式后台下载
 * 2. 支持优先级队列
 * 3. 自动重试机制
 * 4. 本地缓存管理
 */

import RNFS from 'react-native-fs';
import {
  NOISE_REDUCTION_RESOURCES,
  SORTED_RESOURCES,
  RESOURCE_MAP,
  type AudioResource,
} from '../config/ResourceConfig';

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
    } catch (error) {
      console.error('[Downloader] 初始化缓存目录失败:', error);
    }
  }

  /**
   * 获取资源的本地路径
   */
  getLocalPath(resourceId: string): string {
    const resource = RESOURCE_MAP[resourceId];
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }
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
   * 开始下载（非阻塞）
   */
  async startDownload(): Promise<void> {
    if (this.isDownloading) {
      console.log('[Downloader] 已在下载中，跳过');
      return;
    }

    console.log('[Downloader] 开始后台下载任务');
    this.isDownloading = true;

    // 异步执行，不阻塞调用方
    this.processQueue();
  }

  /**
   * 处理下载队列
   */
  private async processQueue() {
    while (this.downloadQueue.length > 0) {
      const resource = this.downloadQueue.shift();
      if (!resource) continue;

      try {
        await this.downloadResource(resource);
      } catch (error) {
        console.error(`[Downloader] ${resource.filename} 下载失败:`, error);
      }
    }

    this.isDownloading = false;
    console.log('[Downloader] 所有资源下载完成');
  }

  /**
   * 下载单个资源
   */
  private async downloadResource(resource: AudioResource) {
    const localPath = this.getLocalPath(resource.id);

    // 检查是否已存在
    const exists = await RNFS.exists(localPath);
    if (exists) {
      console.log(`[Downloader] ✅ ${resource.filename} 已存在，跳过`);
      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 100,
        status: 'completed',
      });
      return;
    }

    // 开始下载
    const retryCount = this.retryCount.get(resource.id) || 0;
    
    try {
      console.log(`[Downloader] 📥 开始下载：${resource.filename} (优先级：${resource.priority})`);
      
      this.notify({
        resourceId: resource.id,
        filename: resource.filename,
        progress: 0,
        status: 'downloading',
      });

      // 创建下载任务
      this.currentDownload = RNFS.downloadFile({
        fromUrl: resource.remoteUrl,
        toFile: localPath,
        background: true, // 后台下载
        discretionary: true,
      });

      // 等待下载完成
      const result = await this.currentDownload.promise;
      
      if (result.statusCode === 200) {
        console.log(`[Downloader] ✅ ${resource.filename} 下载成功`);
        this.notify({
          resourceId: resource.id,
          filename: resource.filename,
          progress: 100,
          status: 'completed',
        });
        this.retryCount.delete(resource.id);
      } else {
        throw new Error(`HTTP ${result.statusCode}`);
      }
    } catch (error: any) {
      console.error(`[Downloader] ❌ ${resource.filename} 下载失败:`, error.message);
      
      // 重试逻辑
      if (retryCount < this.maxRetries) {
        this.retryCount.set(resource.id, retryCount + 1);
        this.downloadQueue.push(resource); // 重新加入队列
        console.log(`[Downloader] 🔄 ${resource.filename} 加入重试队列 (第 ${retryCount + 1} 次)`);
      } else {
        this.notify({
          resourceId: resource.id,
          filename: resource.filename,
          progress: 0,
          status: 'failed',
          error: error.message,
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
