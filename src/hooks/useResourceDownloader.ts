import { useState, useEffect, useRef, useCallback } from 'react';
import { DownloadService } from '../services/DownloadService';
import { OfflineService } from '../services/OfflineService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SceneDownloadProgress {
  progress: number;
  status: 'idle' | 'downloading' | 'ready' | 'error';
  isPriority: boolean;
}

export function useResourceDownloader() {
  const [downloadProgress, setDownloadProgress] = useState<Map<string, SceneDownloadProgress>>(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const hasStarted = useRef(false);

  // 启动后台静默下载
  const startBackgroundDownload = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      console.log('[useResourceDownloader] 🚀 启动后台静默下载...');
      setIsDownloading(true);

      // 设置进度回调
      DownloadService.setProgressCallback((sceneId: string, progress: number) => {
        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(sceneId, {
            progress,
            status: progress >= 100 ? 'ready' : 'downloading',
            isPriority: prev.get(sceneId)?.isPriority || false,
          });
          return newMap;
        });
      });

      // 开始下载
      const result = await DownloadService.silentBackgroundDownload();
      console.log(`[useResourceDownloader] ✅ 后台下载完成: 成功 ${result.success} 个, 失败 ${result.failed} 个`);

      // 更新缓存
      await OfflineService.checkFullIntegrity();
      
    } catch (e) {
      console.error('[useResourceDownloader] ❌ 后台下载失败:', e);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  // 提升场景优先级（用户点击时触发）
  const prioritizeScene = useCallback((sceneId: string) => {
    console.log(`[useResourceDownloader] ⚡ 提升优先级: ${sceneId}`);
    
    DownloadService.prioritizeScene(sceneId);
    
    setDownloadProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(sceneId, {
        progress: prev.get(sceneId)?.progress || 0,
        status: 'downloading',
        isPriority: true,
      });
      return newMap;
    });
  }, []);

  // 检查单个场景是否已下载
  const checkSceneReady = useCallback(async (sceneId: string): Promise<boolean> => {
    try {
      const localPath = await OfflineService.getLocalPathForScene(sceneId);
      if (!localPath) return false;
      
      const exists = await require('react-native-fs').default.exists(localPath);
      return exists;
    } catch (e) {
      console.warn('[useResourceDownloader] 检查场景失败:', sceneId, e);
      return false;
    }
  }, []);

  // 初始化：加载已缓存的下载状态 + 启动后台下载
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // 从缓存加载已下载的场景 ID 列表
        const cachedIds = await AsyncStorage.getItem('DOWNLOADED_SCENE_IDS');
        if (cachedIds && mounted) {
          const ids = JSON.parse(cachedIds);
          const initialMap = new Map<string, SceneDownloadProgress>();
          
          ids.forEach((id: string) => {
            initialMap.set(id, { progress: 100, status: 'ready', isPriority: false });
          });
          
          setDownloadProgress(initialMap);
          console.log(`[useResourceDownloader] 📦 从缓存加载 ${ids.length} 个已下载场景`);
        }

        // 延迟 2 秒启动后台下载
        if (mounted) {
          setTimeout(() => {
            if (mounted) startBackgroundDownload();
          }, 2000);
        }

      } catch (e) {
        console.error('[useResourceDownloader] 初始化失败:', e);
        if (mounted) startBackgroundDownload();
      }
    };

    init();

    return () => { mounted = false; };
  }, [startBackgroundDownload]);

  return {
    downloadProgress,
    isDownloading,
    startBackgroundDownload,
    prioritizeScene,
    checkSceneReady,
  };
}