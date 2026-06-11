/**
 * 【轻量化资源状态管理】统一管理音频和图片的下载状态
 * 
 * 核心逻辑：
 * 1. isFullyReady = (ImageDownloaded && AudioDownloaded)
 * 2. progress = (AudioProgress + ImageProgress) / 2
 * 3. 静默扫描 + 自动触发下载
 * 4. 文件操作防护：isFullyReady=false 时所有 RNFS.exists 用 try-catch
 */

import RNFS from 'react-native-fs';
import { AUDIO_MANIFEST, getLocalPath as getAudioLocalPath } from '../constants/audioAssets';
import { SCENES } from '../constants/scenes';
import { DownloadService } from './DownloadService';
import { DownloaderServiceInstance } from './DownloaderService';

// 【类型定义】DownloaderServiceInstance 的方法类型
interface DownloaderServiceStatus {
  resourceId: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

// 【状态定义】
export interface SceneResourceStatus {
  sceneId: string;
  audioReady: boolean;
  imageReady: boolean;
  progress: number; // 0-100
  status: 'waiting' | 'downloading' | 'ready' | 'error';
}

// 【缓存管理】避免重复计算
const audioStatusCache = new Map<string, { ready: boolean; timestamp: number }>();
const imageStatusCache = new Map<string, { ready: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 缓存 60 秒

/**
 * 【音频状态检查】带缓存优化
 */
async function checkAudioStatus(sceneId: string): Promise<boolean> {
  const cached = audioStatusCache.get(sceneId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.ready;
  }
  
  try {
    const asset = AUDIO_MANIFEST.find(a => a.id === sceneId);
    if (!asset) {
      audioStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
      return false;
    }
    
    const localPath = getAudioLocalPath(asset.category, asset.filename);
    const exists = await RNFS.exists(localPath);
    
    audioStatusCache.set(sceneId, { ready: exists, timestamp: Date.now() });
    return exists;
  } catch (error) {
    console.error(`[ResourceStatus] ⚠️ 检查音频失败: ${sceneId}`, error);
    audioStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * 【图片状态检查】带缓存优化
 */
async function checkImageStatus(sceneId: string): Promise<boolean> {
  const cached = imageStatusCache.get(sceneId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.ready;
  }
  
  try {
    const scene = SCENES.find(s => s.id === sceneId);
    if (!scene) {
      imageStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
      return false;
    }
    
    const bgSource = scene.backgroundSource;
    if (!bgSource) {
      // 无背景图的场景视为图片就绪
      imageStatusCache.set(sceneId, { ready: true, timestamp: Date.now() });
      return true;
    }
    
    // file:// 路径
    if (bgSource.uri) {
      let cleanPath = bgSource.uri;
      
      // 移除 file:// 前缀
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.replace('file://', '');
      }
      
      // Android 平台：路径可能已经是绝对路径，直接检查
      // iOS 平台：可能需要 file:// 前缀，RNFS.exists 支持两种格式
      const exists = await RNFS.exists(cleanPath);
      
      imageStatusCache.set(sceneId, { ready: exists, timestamp: Date.now() });
      return exists;
    }
    
    // require() 静态资源或网络 URL → 视为就绪
    imageStatusCache.set(sceneId, { ready: true, timestamp: Date.now() });
    return true;
  } catch (error) {
    console.error(`[ResourceStatus] ⚠️ 检查图片失败: ${sceneId}`, error);
    imageStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * 【合并进度计算】
 * progress = (AudioProgress + ImageProgress) / 2
 */
async function calculateSceneProgress(sceneId: string): Promise<number> {
  const audioReady = await checkAudioStatus(sceneId);
  const imageReady = await checkImageStatus(sceneId);
  
  // 如果都就绪，返回 100
  if (audioReady && imageReady) return 100;
  
  // 如果都不就绪，返回 0
  if (!audioReady && !imageReady) return 0;
  
  // 部分就绪：计算平均进度
  const audioProgress = audioReady ? 100 : 0;
  const imageProgress = imageReady ? 100 : 0;
  
  return Math.round((audioProgress + imageProgress) / 2);
}

/**
 * 【统一资源状态检查】
 * 返回：isFullyReady, progress, status
 */
export async function checkSceneResourceStatus(sceneId: string): Promise<{
  isFullyReady: boolean;
  progress: number;
  status: SceneResourceStatus['status'];
}> {
  try {
    const audioReady = await checkAudioStatus(sceneId);
    const imageReady = await checkImageStatus(sceneId);
    
    const isFullyReady = audioReady && imageReady;
    const progress = await calculateSceneProgress(sceneId);
    
    // 确定状态
    let status: SceneResourceStatus['status'] = 'waiting';
    if (isFullyReady) {
      status = 'ready';
    } else {
      // 检查是否正在下载
      const allStatus = DownloaderServiceInstance?.getAllStatus?.() as DownloaderServiceStatus[];
      const globalStatus = allStatus?.find(s => s.resourceId === sceneId);
      if (globalStatus && globalStatus.status === 'downloading') {
        status = 'downloading';
      } else {
        status = 'waiting';
      }
    }
    
    return { isFullyReady, progress, status };
  } catch (error) {
    console.error(`[ResourceStatus] ❌ 检查失败: ${sceneId}`, error);
    return { isFullyReady: false, progress: 0, status: 'error' };
  }
}

/**
 * 【统一初始化逻辑】
 * 第一步：静默扫描本地
 * 第二步：如果资源未下载，立即触发 Downloader
 */
export async function initializeResources(): Promise<void> {
  console.log('[ResourceStatus] 🚀 [初始化] 开始静默扫描...');
  
  // 第一步：静默扫描
  const scenesToScan = SCENES.filter(s => s.isBaseScene);
  let unreadyCount = 0;
  
  const results = await Promise.allSettled(scenesToScan.map(scene => checkSceneResourceStatus(scene.id)));
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const scene = scenesToScan[i];
    
    if (result.status === 'fulfilled') {
      if (!result.value.isFullyReady) {
        unreadyCount++;
        console.log(`[ResourceStatus] 🆕 [初始化] ${scene.id}: 未就绪 (progress=${result.value.progress}%)`);
      }
    } else {
      // 处理异常情况
      unreadyCount++;
      console.error(`[ResourceStatus] ❌ [初始化] ${scene.id}: 检查失败`, result.reason);
    }
  }
  
  console.log(`[ResourceStatus] 📊 [初始化] 扫描完成: ${scenesToScan.length} 个场景, ${unreadyCount} 个未就绪`);
  
  // 第二步：如果存在未就绪资源，触发下载
  if (unreadyCount > 0) {
    console.log('[ResourceStatus] 📥 [初始化] 触发后台下载...');
    
    try {
      // 设置进度回调
      DownloadService.setProgressCallback((sceneId: string, progress: number) => {
        console.log(`[ResourceStatus] 📊 [下载回调] ${sceneId}: ${progress}%`);
        
        // 清除对应缓存
        audioStatusCache.delete(sceneId);
        imageStatusCache.delete(sceneId);
      });
      
      // 启动静默下载
      const result = await DownloadService.silentBackgroundDownload();
      console.log(`[ResourceStatus] ✅ [初始化] 下载完成: 成功=${result.success}, 失败=${result.failed}`);
    } catch (error) {
      console.error('[ResourceStatus] ❌ [初始化] 下载失败:', error);
    }
  }
}

/**
 * 【文件读取防护】所有 RNFS 操作都用 try-catch 包裹
 * 在 isReady 为 false 时，任何文件读取都返回 null
 */
export async function safeReadFile<T>(isReady: boolean, reader: () => Promise<T | null>): Promise<T | null> {
   if (!isReady) {
     console.warn('[ResourceStatus] ⚠️ [文件读取防护] 资源未就绪，跳过读取');
     return null;
   }
   
   try {
     return await reader();
   } catch (error) {
     console.error('[ResourceStatus] ❌ [文件读取失败]', error);
     return null;
   }
}

/**
 * 【缓存清理】当下载完成时调用
 */
export function clearCache(sceneId?: string): void {
  if (sceneId) {
    audioStatusCache.delete(sceneId);
    imageStatusCache.delete(sceneId);
  } else {
    audioStatusCache.clear();
    imageStatusCache.clear();
  }
}

/**
 * 【全局状态获取】获取所有场景的资源状态
 */
export async function getAllSceneStatuses(): Promise<SceneResourceStatus[]> {
  const scenes = SCENES.filter(s => s.isBaseScene);
  const statuses: SceneResourceStatus[] = [];
  
  for (const scene of scenes) {
    const { isFullyReady, progress, status } = await checkSceneResourceStatus(scene.id);
    statuses.push({
      sceneId: scene.id,
      audioReady: isFullyReady, // 简化：全就绪才算 audioReady
      imageReady: isFullyReady, // 简化：全就绪才算 imageReady
      progress,
      status,
    });
  }
  
  return statuses;
}

/**
 * 【初始化下载器实例】
 */
export function initDownloader(): void {
  console.log('[ResourceStatus] 🚀 [初始化下载器]');
  DownloaderServiceInstance.initQueue();
}