/**
 * 【全局资源与播放状态中心】
 * 轻量级声明式 Store，统一管理下载状态和播放状态
 * 适配 React Native 0.81.5 (Fabric) + Android Page Size 16K
 */

import { AUDIO_MANIFEST } from '../constants/audioAssets';
import { SCENES } from '../constants/scenes';
import { DownloadService } from './DownloadService';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

// ══════════════════════════════════════════════════════════
// 【类型定义】
// ══════════════════════════════════════════════════════════

export interface SceneResourceState {
  sceneId: string;
  isFullyReady: boolean;    // 音频 + 图片都就绪
  audioReady: boolean;      // 音频文件存在
  imageReady: boolean;      // 背景图就绪
  progress: number;         // 0-100
  status: 'waiting' | 'downloading' | 'ready' | 'error';
}

export interface PlaybackState {
  isPlaying: boolean;
  playingSceneId: string | null;
  currentProgress: number;  // 播放进度百分比 (0-1)
}

export interface ResourceStoreState {
  downloadedSceneIds: Set<string>;
  sceneResources: Map<string, SceneResourceState>;  // sceneId -> 资源状态
  playback: PlaybackState;
}

// ══════════════════════════════════════════════════════════
// 【内部缓存】避免重复计算
// ══════════════════════════════════════════════════════════

const audioStatusCache = new Map<string, { ready: boolean; timestamp: number }>();
const imageStatusCache = new Map<string, { ready: boolean; timestamp: number }>();
const CACHE_TTL = 5000; // 缓存 5 秒

// ══════════════════════════════════════════════════════════
// 【核心】状态检查函数（与 ResourceStatusManager 共享逻辑）
// ══════════════════════════════════════════════════════════

function getAudioLocalPath(category: string, filename: string): string {
  const categoryMap: Record<string, string> = {
    'Oriental': 'base',
    'WesternChurch': 'western_church',
    'Nature': 'nature',
    'Healing': 'zen',
    'Brainwave': 'brainwave',
    'Life': 'life',
  };
  
  const folder = categoryMap[category] || 'base';
  return `${RNFS.DocumentDirectoryPath}/${folder}/${filename}`;
}

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
    console.error(`[ResourceStore] ⚠️ 检查音频失败: ${sceneId}`, error);
    audioStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
    return false;
  }
}

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
      
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.replace('file://', '');
      }
      
      // Android 本地 assets 资源直通（Platform 已在顶部导入）
      if (Platform.OS === 'android' && cleanPath.startsWith('android_asset/')) {
        imageStatusCache.set(sceneId, { ready: true, timestamp: Date.now() });
        return true;
      }
      
      const exists = await RNFS.exists(cleanPath);
      imageStatusCache.set(sceneId, { ready: exists, timestamp: Date.now() });
      return exists;
    }
    
    // require() 静态资源或网络 URL → 视为就绪
    imageStatusCache.set(sceneId, { ready: true, timestamp: Date.now() });
    return true;
  } catch (error) {
    console.error(`[ResourceStore] ⚠️ 检查图片失败: ${sceneId}`, error);
    imageStatusCache.set(sceneId, { ready: false, timestamp: Date.now() });
    return false;
  }
}

async function checkSceneResource(sceneId: string): Promise<SceneResourceState> {
  try {
    const [audioReady, imageReady] = await Promise.all([
      checkAudioStatus(sceneId),
      checkImageStatus(sceneId)
    ]);
    
    const isFullyReady = audioReady && imageReady;
    
    let progress: number;
    if (isFullyReady) {
      progress = 100;
    } else if (!audioReady && !imageReady) {
      progress = 0;
    } else {
      const readyCount = (audioReady ? 1 : 0) + (imageReady ? 1 : 0);
      progress = Math.round((readyCount / 2) * 100);
    }
    
    return {
      sceneId,
      isFullyReady,
      audioReady,
      imageReady,
      progress,
      status: isFullyReady ? 'ready' : (progress > 0 ? 'downloading' : 'waiting'),
    };
  } catch (error) {
    console.error(`[ResourceStore] ❌ 检查失败: ${sceneId}`, error);
    return {
      sceneId,
      isFullyReady: false,
      audioReady: false,
      imageReady: false,
      progress: 0,
      status: 'error',
    };
  }
}

// ══════════════════════════════════════════════════════════
// 【Store 实现】使用观察者模式实现发布订阅
// ══════════════════════════════════════════════════════════

class ResourceStore {
  private state: ResourceStoreState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = {
      downloadedSceneIds: new Set(),
      sceneResources: new Map(),
      playback: {
        isPlaying: false,
        playingSceneId: null,
        currentProgress: 0,
      },
    };
    
    // 初始化所有场景的资源状态
    SCENES.filter(s => s.isBaseScene).forEach(scene => {
      this.state.sceneResources.set(scene.id, {
        sceneId: scene.id,
        isFullyReady: false,
        audioReady: false,
        imageReady: false,
        progress: 0,
        status: 'waiting',
      });
    });
  }

  // 订阅状态变化
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // 触发更新
  private notify() {
    this.listeners.forEach(listener => listener());
  }

  // 批量更新资源状态（用于初始化）
  async bulkUpdateSceneResources(sceneIds: string[]): Promise<void> {
    try {
      // 并发检查所有场景资源（任务3要求：禁止串行 await）
      const results = await Promise.all(
        sceneIds.map(id => checkSceneResource(id))
      );
      
      results.forEach(result => {
        this.state.sceneResources.set(result.sceneId, result);
        
        if (result.isFullyReady) {
          this.state.downloadedSceneIds.add(result.sceneId);
        }
      });
      
      this.notify();
    } catch (error) {
      console.error('[ResourceStore] ❌ bulkUpdateSceneResources 失败:', error);
    }
  }

  // 更新单个场景进度
  updateSceneProgress(sceneId: string, progress: number): void {
    const state = this.state.sceneResources.get(sceneId);
    if (!state) return;
    
    // 根据进度推断状态
    let status: SceneResourceState['status'] = 'waiting';
    if (progress >= 100) status = 'ready';
    else if (progress > 0) status = 'downloading';
    
    const isFullyReady = progress >= 100;
    
    this.state.sceneResources.set(sceneId, {
      ...state,
      progress,
      status,
      isFullyReady: isFullyReady && state.audioReady && state.imageReady,
    });
    
    if (isFullyReady) {
      this.state.downloadedSceneIds.add(sceneId);
    } else {
      this.state.downloadedSceneIds.delete(sceneId);
    }
    
    this.notify();
  }

  // 标记场景为完全就绪
  markSceneReady(sceneId: string): void {
    const state = this.state.sceneResources.get(sceneId);
    if (!state) return;
    
    this.state.sceneResources.set(sceneId, {
      ...state,
      isFullyReady: true,
      progress: 100,
      status: 'ready',
    });
    
    this.state.downloadedSceneIds.add(sceneId);
    this.notify();
  }

  // 清除场景缓存（下载失败或重试时调用）
  clearSceneCache(sceneId?: string): void {
    if (sceneId) {
      audioStatusCache.delete(sceneId);
      imageStatusCache.delete(sceneId);
      
      const state = this.state.sceneResources.get(sceneId);
      if (state && !state.isFullyReady) {
        this.state.sceneResources.set(sceneId, {
          ...state,
          progress: 0,
          status: 'waiting',
        });
        this.state.downloadedSceneIds.delete(sceneId);
      }
    } else {
      audioStatusCache.clear();
      imageStatusCache.clear();
      
      // 全局清除
      this.state.sceneResources.forEach(state => {
        if (!state.isFullyReady) {
          this.state.sceneResources.set(state.sceneId, {
            ...state,
            progress: 0,
            status: 'waiting',
          });
          this.state.downloadedSceneIds.delete(state.sceneId);
        }
      });
    }
    
    this.notify();
  }

  // 更新播放状态
  updatePlaybackState(newState: Partial<PlaybackState>): void {
    this.state.playback = { ...this.state.playback, ...newState };
    this.notify();
  }

  // 获取完整状态快照（供 React 组件订阅）
  getState(): ResourceStoreState {
    return {
      downloadedSceneIds: new Set(this.state.downloadedSceneIds),
      sceneResources: new Map(this.state.sceneResources),
      playback: { ...this.state.playback },
    };
  }

  // 获取场景资源状态
  getSceneResource(sceneId: string): SceneResourceState | undefined {
    return this.state.sceneResources.get(sceneId);
  }

  // 检查场景是否就绪（便捷方法）
  isSceneReady(sceneId: string): boolean {
    return this.state.downloadedSceneIds.has(sceneId);
  }
}

// 【单例实例】
export const resourceStore = new ResourceStore();

// ══════════════════════════════════════════════════════════
// 【初始化逻辑】供 App 启动时调用
// ══════════════════════════════════════════════════════════

export async function initializeResourceStore(): Promise<void> {
  console.log('[ResourceStore] 🚀 [初始化] 开始...');
  
  // 获取所有 base scene ID
  const baseSceneIds = SCENES.filter(s => s.isBaseScene).map(s => s.id);
  
  // 并发检查所有资源（任务3要求：Promise.all）
  await resourceStore.bulkUpdateSceneResources(baseSceneIds);
  
  console.log(`[ResourceStore] ✅ [初始化完成] ${baseSceneIds.length} 个场景, ${resourceStore.getState().downloadedSceneIds.size} 个已就绪`);
}
