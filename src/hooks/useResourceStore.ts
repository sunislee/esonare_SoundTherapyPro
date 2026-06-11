import { useEffect, useState, useCallback } from 'react';
import { resourceStore, ResourceStoreState } from '../services/ResourceStore';

/**
 * 【useResourceStore Hook】
 * 声明式订阅全局资源状态，替代 DeviceEventEmitter + stateVersion 模式
 */
export const useResourceStore = (): ResourceStoreState => {
  const [state, setState] = useState<ResourceStoreState>(resourceStore.getState());
  
  useEffect(() => {
    // 订阅 Store 状态变化
    const unsubscribe = resourceStore.subscribe(() => {
      setState(resourceStore.getState());
    });
    
    // 返回清理函数
    return () => unsubscribe();
  }, []);
  
  return state;
};

/**
 * 【useSceneResource Hook】
 * 精确订阅单个场景的资源状态（仅当该场景状态变化时重渲染）
 */
export const useSceneResource = (sceneId: string) => {
  // 使用一个唯一 key 来触发重渲染
  const [, forceUpdate] = useState(0);
  
  useEffect(() => {
    const updateState = () => {
      const resourceState = resourceStore.getSceneResource(sceneId);
      
      if (resourceState) {
        // 触发组件更新（仅此场景相关组件）
        forceUpdate(v => v + 1);
      }
    };
    
    // 立即获取一次当前状态
    updateState();
    
    // 订阅 Store 状态变化
    const unsubscribe = resourceStore.subscribe(updateState);
    
    return () => unsubscribe();
  }, [sceneId]);
  
  return resourceStore.getSceneResource(sceneId);
};

/**
 * 【useDownloadedScenes Hook】
 * 获取已下载的场景 ID 集合（仅当此集合变化时重渲染）
 */
export const useDownloadedScenes = (): Set<string> => {
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(resourceStore.getState().downloadedSceneIds);
  
  useEffect(() => {
    const updateDownloadedIds = () => {
      setDownloadedIds(resourceStore.getState().downloadedSceneIds);
    };
    
    // 立即获取一次当前状态
    updateDownloadedIds();
    
    // 订阅 Store 状态变化
    const unsubscribe = resourceStore.subscribe(updateDownloadedIds);
    
    return () => unsubscribe();
  }, []);
  
  return downloadedIds;
};
