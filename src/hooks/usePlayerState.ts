import { useState, useEffect } from 'react';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';

/**
 * 播放器状态 Hook，实时订阅全局播放器状态
 * 禁止使用本地 useState 管理播放状态，必须通过此 Hook 获取实时状态
 * 
 * 【v1.4.2 Release 防御】Hermes Release 编译后 AudioService.getInstance() 返回的对象
 * 其 runtime-added methods（如 addAudioStateListener）可能 undefined，需全路径检查。
 */
export const usePlayerState = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentState, setCurrentState] = useState<State>(State.None);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);

  useEffect(() => {
    // 【关键修复】获取 AudioService 实例，增加 try/catch 防止模块加载失败导致崩溃
    let audioService: any = null;
    try {
      const svc = typeof (AudioService as any) !== 'undefined' && typeof (AudioService as any).getInstance === 'function' 
        ? (AudioService as any).getInstance() 
        : null;
      
      if (!svc || typeof svc.isReady !== 'function') {
        console.warn('[usePlayerState] ⚠️ AudioService 不可用');
        return () => {}; // 立即返回空 cleanup
      }
      
      audioService = svc as any;
    } catch (e) {
      console.error('[usePlayerState] ❌ AudioService getInstance 调用失败:', e);
      return () => {};
    }

    // 【关键修复】订阅全局音频状态变化 — 全路径防御性检查
    let unsubscribe = (() => {}) as () => void;
    
    try {
      if (typeof audioService.addAudioStateListener === 'function') {
        unsubscribe = audioService.addAudioStateListener((state: any) => {
          try {
            setIsPlaying(state?.state === State.Playing || state?.state === State.Buffering);
            setCurrentState(state?.state ?? State.None);
            setCurrentTrackId(state?.id ?? null);
          } catch (err) {
            console.error('[usePlayerState] ❌ 状态回调异常:', err);
          }
        });
      } else {
        console.warn('[usePlayerState] ⚠️ addAudioStateListener 不可用');
      }
    } catch (e) {
      console.error('[usePlayerState] ❌ 订阅失败:', e);
    }

    // 初始同步：获取当前状态
    const syncInitialState = () => {
      try {
        // 【防御】所有方法调用前检查函数存在性
        const currentStateStr = typeof audioService.getCurrentState === 'function' ? audioService.getCurrentState() : '';
        const currentScene = typeof audioService.getCurrentScene === 'function' ? audioService.getCurrentScene() : null;
        
        // 2. 将字符串状态转换为 State 枚举
        let currentStateEnum: State = State.None;
        if (currentStateStr === 'playing') {
          currentStateEnum = State.Playing;
        } else if (currentStateStr === 'paused') {
          currentStateEnum = State.Paused;
        }
        
        // 3. 优先使用 getRealIsPlaying() 获取真实播放状态（同步/异步都支持）
        const syncGetIsPlaying = () => {
          // 先尝试直接读取 isActuallyPlaying 属性（同步）
          if (typeof audioService.isActuallyPlaying === 'boolean') {
            return audioService.isActuallyPlaying;
          }
          return false;
        };
        
        const initialIsPlaying = syncGetIsPlaying();
        
        // 4. 立即更新本地 state
        setIsPlaying(initialIsPlaying);
        setCurrentState(currentStateEnum);
        setCurrentTrackId(currentScene?.id || null);
        
        console.log(`[usePlayerState] Immediate sync: isPlaying=${initialIsPlaying}, id=${currentScene?.id}`);

        // 5. 异步检查作为兜底 — 确保状态准确（防御 getRealIsPlaying 不存在的情况）
        if (typeof audioService.getRealIsPlaying === 'function') {
          audioService.getRealIsPlaying().then((realIsPlaying: boolean) => {
            console.log(`[usePlayerState] Async sync: realIsPlaying=${realIsPlaying}, current=${initialIsPlaying}`);
            if (realIsPlaying !== initialIsPlaying) {
              console.log(`[usePlayerState] Corrected isPlaying from ${initialIsPlaying} to ${realIsPlaying}`);
              setIsPlaying(realIsPlaying);
            }
          }).catch((err: any) => {
            console.warn('[usePlayerState] ⚠️ getRealIsPlaying 失败:', err?.message || err);
          });
        }
      } catch (error) {
        console.error('[usePlayerState] Initial Sync Error:', error);
      }
    };

    syncInitialState();

    return () => {
      try { unsubscribe(); } catch (e) { /* noop */ }
    };
  }, []);

  // 【v1.4.2 Release 防御】返回的安全方法包装器 — 所有方法先检查函数存在性再调用
  const safeGetSvc = () => {
    try {
      if (typeof (AudioService as any) !== 'undefined' && typeof (AudioService as any).getInstance === 'function') {
        return (AudioService as any).getInstance();
      }
    } catch (e) { /* noop */ }
    return null;
  };

  return {
    isPlaying,
    currentState,
    currentTrackId,
    // 提供直接操作全局播放器的方法（全路径防御）
    pause: async () => {
      const svc = safeGetSvc();
      if (svc && typeof svc.pause === 'function') { await svc.pause(); }
      else console.warn('[usePlayerState] ⚠️ AudioService.pause 不可用');
    },
    play: async () => {
      const svc = safeGetSvc();
      if (svc && typeof svc.play === 'function') { await svc.play(); }
      else console.warn('[usePlayerState] ⚠️ AudioService.play 不可用');
    },
    getRealIsPlaying: () => {
      const svc = safeGetSvc();
      if (svc && typeof svc.getRealIsPlaying === 'function') return svc.getRealIsPlaying();
      return Promise.resolve(false);
    }
  };
};

export default usePlayerState;
