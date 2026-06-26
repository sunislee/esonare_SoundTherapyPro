import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { checkSceneResourceStatus, getAllSceneStatuses } from '../services/ResourceStatusManager';
import { DownloaderServiceInstance } from '../services/DownloaderService';

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
    console.log('[useResourceDownloader] 📡 [SUBSCRIBE] 订阅 DownloaderService 状态变化...');
    console.log(`[useResourceDownloader] 📡 [SUBSCRIBE] 时间: ${new Date().toISOString()}`);

    const unsubscribe = DownloaderServiceInstance.subscribe((status) => {
      // 【 详细日志】收到通知的完整信息
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] ════════════════════════════`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] 收到通知!`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] resourceId: ${status.resourceId}`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] filename: ${status.filename}`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] status: ${status.status}`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] progress: ${status.progress}%`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] error: ${status.error || '无'}`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] 时间: ${new Date().toISOString()}`);
      console.log(`[useResourceDownloader] 📊 [NOTIFY_RECEIVED] ════════════════════════════`);
      
      // 【🔧 日志】调用 setDownloadProgress 前
      const prevSize = downloadProgress.size;
      const prevStatus = downloadProgress.get(status.resourceId);
      console.log(`[useResourceDownloader] 🔄 [SET_STATE_BEFORE] 当前 Map 大小: ${prevSize}`);
      console.log(`[useResourceDownloader] 🔄 [SET_STATE_BEFORE] ${status.resourceId} 旧状态:`, prevStatus || '不存在');
      
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        
        if (status.status === 'completed') {
          newMap.set(status.resourceId, {
            progress: 100,
            status: 'ready',
            isPriority: prev.get(status.resourceId)?.isPriority || false,
          });
          // 【关键修复】背景图下载完成后通知刷新缓存，确保缩略图正确
          if (status.resourceId.startsWith('bg_')) {
            DeviceEventEmitter.emit('backgroundImagesReady');
          }
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
        
        // 【🔧 日志】setDownloadProgress 回调内
        const newSize = newMap.size;
        const newStatus = newMap.get(status.resourceId);
        console.log(`[useResourceDownloader] ✅ [SET_STATE_AFTER] 新 Map 大小: ${newSize}`);
        console.log(`[useResourceDownloader] ✅ [SET_STATE_AFTER] ${status.resourceId} 新状态:`, newStatus);
        
        return newMap;
      });
      
      // 【🔧 日志】确认 React 状态更新已触发
      console.log(`[useResourceDownloader] ⚡ [STATE_UPDATE_TRIGGERED] ${status.resourceId} 状态更新请求已发送给 React`);
    });

    return () => {
      console.log('[useResourceDownloader] 📡 [UNSUBSCRIBE] 取消订阅 DownloaderService');
      unsubscribe();
    };
  }, []);

// 启动后台静默下载
   const startBackgroundDownload = useCallback(async () => {
     // 【修复】使用 hasStartedRef.current 防止重复启动
     if (hasStartedRef.current) return;
     hasStartedRef.current = true;

     try {
       console.log('[useResourceDownloader] 🚀 启动后台静默下载...');
       setIsDownloading(true);

       // 启动下载（由 ResourceStatusManager 内部处理）
       const { DownloadService } = await import('../services/DownloadService');

       // 开始下载
       const result = await DownloadService.silentBackgroundDownload();
       console.log(`[useResourceDownloader] ✅ 后台下载完成: 成功 ${result.success} 个, 失败 ${result.failed} 个`);

     } catch (e) {
       console.error('[useResourceDownloader] ❌ 后台下载失败:', e);
     } finally {
       setIsDownloading(false);
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

  // 【🔥🔥🔨 关键修复】组件 mount 时立即查询所有场景的本地状态
  // 解决问题：App 启动时 UI 显示 0% Downloading，但文件已存在本地
  useEffect(() => {
    let mounted = true;

    const initLocalState = async () => {
      try {
        console.log(`[useResourceDownloader] 🚀 [INIT] 开始查询本地状态...`);

        // 【核心修复】直接从 ResourceStatusManager 获取所有场景的实时状态
        const statuses = await getAllSceneStatuses();
        console.log(`[useResourceDownloader] 📊 [INIT] 获取到 ${statuses.length} 个场景状态`);

        if (!mounted) return;

        const initialMap = new Map<string, SceneDownloadProgress>();
        let readyCount = 0;

        for (const s of statuses) {
          if (s.status === 'ready') {
            initialMap.set(s.sceneId, { progress: 100, status: 'ready', isPriority: false });
            readyCount++;
          }
        }

        console.log(`[useResourceDownloader] ✅ [INIT] 本地就绪场景: ${readyCount}/${statuses.length}`);

        // 【关键】立即更新状态，不等 notify 事件
        setDownloadProgress(initialMap);

        // 【🔥 v10 修复】始终启动后台下载，确保背景图也被下载
        // 之前：只有音频未就绪时才启动下载，但 getAllSceneStatuses 只检查音频
        // 结果：音频下载后报告"就绪"，背景图永远不下载
        console.log(`[useResourceDownloader] 📥 [INIT] 启动后台下载（含背景图）`);
        setTimeout(() => {
          if (mounted) startBackgroundDownload();
        }, 500);

      } catch (e) {
        console.error('[useResourceDownloader] ❌ [INIT] 查询本地状态失败:', e);
        // 失败时仍启动下载
        if (mounted) {
          setTimeout(() => {
            if (mounted) startBackgroundDownload();
          }, 500);
        }
      }
    };

    initLocalState();

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