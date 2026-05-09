import TrackPlayer, { Event, State } from 'react-native-track-player';
import AudioService from './AudioService';

/**
 * 【RN 0.81 适配版】PlaybackService
 * 这个函数必须在 index.js 中通过 registerPlaybackService 注册
 */
export const PlaybackService = async function() {
  
  // 1. 处理远程控制事件（通知栏/蓝牙耳机操作）
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[PlaybackService] Remote Play - 强制同步状态');
    const audioService = AudioService.getInstance();
    
    // 【关键修复】先更新 AudioService 状态，再调用 TrackPlayer
    audioService.setIsActuallyPlaying(true);
    await TrackPlayer.play();
    audioService.notifyListeners(); // 强制通知 UI 更新
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[PlaybackService] Remote Pause - 强制同步状态');
    const audioService = AudioService.getInstance();
    
    // 【关键修复】先更新 AudioService 状态，再调用 TrackPlayer
    audioService.setIsActuallyPlaying(false);
    await TrackPlayer.pause();
    audioService.notifyListeners(); // 强制通知 UI 更新
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[PlaybackService] Remote Stop - 强制同步状态');
    const audioService = AudioService.getInstance();
    
    // 【关键修复】先更新 AudioService 状态，再调用 TrackPlayer
    audioService.setIsActuallyPlaying(false);
    await TrackPlayer.stop();
    audioService.notifyListeners(); // 强制通知 UI 更新
  });

  // 2. 核心：处理播放器底层错误
  // 在 0.81 中，许多路径或解码问题会在这里抛出，而不是在 playScene 的 try-catch 里
  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.error('[PlaybackService] 🚨 底层音频播放错误:', error);
  });

  // 3. 监听音频焦点丢失（例如接电话、其他 App 播放音乐）
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      await TrackPlayer.pause();
    } else {
      // 降低音量或恢复播放
      await TrackPlayer.setVolume(event.permanent ? 0 : 0.5);
    }
  });

  // 4. 【关键修复】监听播放状态变化，确保 UI 与状态栏同步
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    try {
      const state = (event as any).state ?? event;
      console.log('[PlaybackService] 播放状态变化:', state);
      
      const audioService = AudioService.getInstance();
      
      // 【🔥🔥🔥 精准修复】只对"最终停止状态"设为 false！中间状态不覆盖！
      if (state === State.Playing) {
        audioService.setIsActuallyPlaying(true);
        console.log('[PlaybackService] ▶️ state=Playing → isActuallyPlaying=true');
      } else if (state === State.Stopped || state === State.Ended || state === State.None || state === State.Paused) {
        // 只有明确停止的状态才设为 false
        audioService.setIsActuallyPlaying(false);
        console.log(`[PlaybackService] ⏹️ state=${state} → isActuallyPlaying=false`);
      } else {
        // Buffering / Ready 等中间状态 → 保持 isActuallyPlaying 不变！
        console.log(`[PlaybackService] ⏳ state=${state} → 中间状态，保持 isActuallyPlaying=${audioService.isActuallyPlaying}`);
      }
      
      // 强制通知 UI 更新
      audioService.notifyListeners();
      console.log('[PlaybackService] ✅ 状态已同步到 UI');
    } catch (error) {
      console.error('[PlaybackService] 状态同步错误:', error);
    }
  });
};

export default PlaybackService;