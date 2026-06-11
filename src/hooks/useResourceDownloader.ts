import { useState, useEffect, useRef, useCallback } from 'react';
import { checkSceneResourceStatus, getAllSceneStatuses, clearCache } from '../services/ResourceStatusManager';
import { DownloaderServiceInstance } from '../services/DownloaderService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 【关键】使用 AsyncStorage 存储下载启动状态，而非模块级变量
// 模块级变量在 App 数据清空后仍保持，导致冷启动无法重新启动下载
const HAS_STARTED_KEY = '@soundtherapy/download_has_started';

export interface SceneDownloadProgress {
  progress: number;
  status: 'idle' | 'downloading' | 'ready' | 'error';
  isPriority: boolean;
}

export function useResourceDownloader() {
  const [downloadProgress, setDownloadProgress] = useState<Map<string, SceneDownloadProgress>>(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const hasStartedRef = useRef(false);

  // 【🔥🔥🔥 关键修复】订阅 DownloaderService 的状态变化，解决状态不同步导致的死锁问题
  useEffect(() => {
    console.log('[useResourceDownloader] 📡 订阅 DownloaderService 状态变化...');
    
    const unsubscribe = DownloaderServiceInstance.subscribe((status) => {
      console.log(`[useResourceDownloader] 📊 [收到通知] ${status.resourceId}: ${status.status} (${status.progress}%)`);
      
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        
        if (status.status === 'completed') {
          newMap.set(status.resourceId, {
            progress: 100,
            status: 'ready',
            isPriority: prev.get(status.resourceId)?.isPriority || false,
          });
        } else if (status.status === 'failed') {
          newMap.set(status.resourceId, {
            progress: 0,
            status: 'idle',  // 失败后重置为 idle，允许重新下载
            isPriority: false,
          });
        } else if (status.status === 'downloading') {
          newMap.set(status.resourceId, {
            progress: status.progress,
            status: 'downloading',
            isPriority: prev.get(status.resourceId)?.isPriority || false,
          });
        }
        
        return newMap;
      });
    });

    return () => {
      console.log('[useResourceDownloader] 📡 取消订阅 DownloaderService');
      unsubscribe();
    };
  }, []);

  // 启动后台静默下载
  const startBackgroundDownload = useCallback(async () => {
    // 【修复】使用 AsyncStorage 检查是否已启动
    const started = await AsyncStorage.getItem(HAS_STARTED_KEY);
    if (started === 'true') {
      console.log('[useResourceDownloader] 🛑 下载已启动，跳过重复启动');
      return;
    }
    
    // 标记为已启动
    await AsyncStorage.setItem(HAS_STARTED_KEY, 'true');
    hasStartedRef.current = true;
    
    try {
      console.log('[useResourceDownloader] 🚀 启动后台静默下载...');
      setIsDownloading(true);

      // 启动下载（由 ResourceStatusManager 内部处理）
      const { DownloadService } = await import('../services/DownloadService');
      
      // 设置进度回调
      DownloadService.setProgressCallback((sceneId: string, progress: number) => {
        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(sceneId, {
            progress,
            status: progress >= 100 ? 'ready' : 'downloading',
            isPriority: prev.get(sceneId)?.isPriority || false,
          });
          // 清除缓存以确保下次检查时获取最新状态
          clearCache(sceneId);
          return newMap;
        });
      });

      // 开始下载
      const result = await DownloadService.silentBackgroundDownload();
      console.log(`[useResourceDownloader] ✅ 后台下载完成: 成功 ${result.success} 个, 失败 ${result.failed} 个`);

    } catch (e) {
      console.error('[useResourceDownloader] ❌ 后台下载失败:', e);
    } finally {
      setIsDownloading(false);
      await AsyncStorage.removeItem(HAS_STARTED_KEY);
    }
  }, []);

  // 提升场景优先级（用户点击时触发）
  const prioritizeScene = useCallback(async (sceneId: string) => {
    console.log(`[useResourceDownloader] ⚡ 提升优先级: ${sceneId}`);
    
    // 立即更新状态为"下载中"，防止重复触发
    setDownloadProgress(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(sceneId);
      newMap.set(sceneId, {
        progress: existing ? existing.progress : 0,
        status: 'downloading', // 强制设置为下载中
        isPriority: true,      // 标记为优先下载
      });
      return newMap;
    });
    
    // 【🔥🔥🔨 关键修复】无论是否已启动，都必须将场景加入队列！
    if (!hasStartedRef.current) {
      console.log(`[useResourceDownloader] 🚀 Prioritize 触发首次下载启动 + 添加场景: ${sceneId}`);
      hasStartedRef.current = true;
      
      // 先添加任务到队列，再启动下载（确保顺序正确）
      DownloaderServiceInstance.addTaskToQueue(sceneId);  // ✅ 先加入队列
      
      // 延迟启动下载，确保队列已更新
      setTimeout(() => {
        DownloaderServiceInstance.startDownload();  // 再启动下载
      }, 100);
    } else {
      console.log(`[useResourceDownloader] ⚡ Prioritize: ${sceneId} (下载已在进行)`);
      DownloaderServiceInstance.addTaskToQueue(sceneId);
    }
  }, [startBackgroundDownload]);

  // 检查单个场景是否就绪（使用 ResourceStatusManager）
  const checkSceneReady = useCallback(async (sceneId: string): Promise<boolean> => {
    try {
      const { isFullyReady } = await checkSceneResourceStatus(sceneId);
      return isFullyReady;
    } catch (e) {
      console.warn('[useResourceDownloader] 检查场景失败:', sceneId, e);
      return false;
    }
  }, []);

  // 【冷启动检测】检查本地文件是否存在（使用 ResourceStatusManager）
  const checkLocalFilesExist = useCallback(async (): Promise<boolean> => {
    try {
      console.log(`[useResourceDownloader] 🔍 [冷启动检测] 开始检查本地文件...`);
      
      // 获取所有场景状态
      const statuses = await getAllSceneStatuses();
      const readyCount = statuses.filter(s => s.status === 'ready').length;
      const totalCount = statuses.length;
      
      console.log(`[useResourceDownloader] 🔍 [冷启动检测] 场景状态: ${readyCount}/${totalCount} 就绪`);
      
      // 如果有核心场景就绪，认为文件已存在
      const hasCoreScene = statuses.some(s => 
        ['nature_ocean', 'nature_forest', 'healing_zen_bowl'].includes(s.sceneId) && s.status === 'ready'
      );
      
      return hasCoreScene || readyCount > 0;
    } catch (e) {
      console.error('[useResourceDownloader] ❌ [冷启动检测] 失败:', e);
      return false;
    }
  }, []);

  // 初始化：加载已缓存的下载状态 + 启动后台下载
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        console.log(`[useResourceDownloader] 🐛 [调试] 开始初始化...`);
        
        // 【冷启动修复】检查本地文件是否存在
        const localFilesExist = await checkLocalFilesExist();
        
        // 【核心】如果本地文件不存在，重置下载状态
        if (!localFilesExist) {
          console.log(`[useResourceDownloader] 🚨 [冷启动检测] 本地文件不存在，重置下载状态`);
          await AsyncStorage.removeItem(HAS_STARTED_KEY);
          hasStartedRef.current = false;
        }
        
        // 【修复】使用与 HomeScreen 相同的缓存键
        const cachedIds = await AsyncStorage.getItem('downloaded_scene_ids_cache');
        console.log(`[useResourceDownloader] 🐛 [调试] 原始缓存数据: "${cachedIds}"`);
        
        if (cachedIds && mounted) {
          const ids = JSON.parse(cachedIds);
          console.log(`[useResourceDownloader] 🐛 [调试] 解析后的 IDs:`, ids);
          
          const initialMap = new Map<string, SceneDownloadProgress>();
          let validIds = 0;
          
          for (const id of ids) {
            // 使用 ResourceStatusManager 检查状态
            const status = await checkSceneResourceStatus(id);
            console.log(`[useResourceDownloader] 🐛 [调试] ${id}: status=${status.status}, progress=${status.progress}`);
            
            if (status.status === 'ready') {
              initialMap.set(id, { progress: 100, status: 'ready', isPriority: false });
              validIds++;
            }
          }
          
          setDownloadProgress(initialMap);
          console.log(`[useResourceDownloader] 📦 [调试] 有效场景: ${validIds}/${ids.length}`);
          
          // 立即打印当前 downloadProgress 状态
          console.log(`[useResourceDownloader] 📊 [调试] downloadProgress 状态:`, Array.from(initialMap.entries()).map(([id, progress]) => ({ id, ...progress })));
        } else {
          console.log(`[useResourceDownloader] ⚠️ [调试] 缓存为空或未找到`);
        }

        // 延迟 2 秒启动后台下载
        if (mounted) {
          setTimeout(() => {
            console.log(`[useResourceDownloader] ⏱️ [调试] 2秒后启动后台下载...`);
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
  }, [startBackgroundDownload, checkLocalFilesExist]);

  return {
    downloadProgress,
    isDownloading,
    startBackgroundDownload,
    prioritizeScene,
    checkSceneReady,
  };
}