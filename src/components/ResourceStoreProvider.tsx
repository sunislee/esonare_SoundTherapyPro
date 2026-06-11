/**
 * 【ResourceStore Provider】
 * 在应用启动时初始化 ResourceStore，提供全局资源状态
 * 替代 DeviceEventEmitter + stateVersion 的状态同步模式
 */

import React, { useEffect } from 'react';
import { initializeResourceStore } from '../services/ResourceStore';

interface ResourceStoreProviderProps {
  children: React.ReactNode;
}

/**
 * 【ResourceStoreProvider】
 * 在应用启动时初始化所有场景的资源状态（并发检查）
 */
export const ResourceStoreProvider: React.FC<ResourceStoreProviderProps> = ({ children }) => {
  useEffect(() => {
    console.log('[ResourceStore] 🚀 [Provider] 开始初始化...');
    
    // 初始化资源状态（并发检查所有场景）
    initializeResourceStore()
      .then(() => {
        console.log('[ResourceStore] ✅ [Provider] 初始化完成');
      })
      .catch(error => {
        console.error('[ResourceStore] ❌ [Provider] 初始化失败:', error);
      });
  }, []);
  
  return <>{children}</>;
};
