import TrackPlayer, { Event } from 'react-native-track-player';

/**
 * 【RN 0.81 适配版】PlaybackService
 * 这个函数必须在 index.js 中通过 registerPlaybackService 注册
 */
export const PlaybackService = async function() {
  
  // 1. 处理远程控制事件（通知栏/蓝牙耳机操作）
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[PlaybackService] Remote Play');
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[PlaybackService] Remote Pause');
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[PlaybackService] Remote Stop');
    TrackPlayer.stop();
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

  // 4. 监听播放状态（用于调试）
  TrackPlayer.addEventListener(Event.PlaybackState, (state) => {
    console.log('[PlaybackService] 播放状态实时流:', state);
  });
};

export default PlaybackService;