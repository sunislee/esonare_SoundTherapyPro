import TrackPlayer, { Event, State } from 'react-native-track-player';
import AudioService from './AudioService';

export const PlaybackService = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    AudioService.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    AudioService.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    AudioService.stop();
  });

  // 监听播放状态变化，同步更新通知栏元数据
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    // 处理不同版本的 state 获取方式
    const state = (event as any).state ?? event;
    const scene = AudioService.getCurrentScene();
    if (scene) {
      // 某些平台或版本可能需要手动再次触发元数据更新以保持同步
      // NotificationService 已经在 AudioService.updateAudioState 中调用
    }
  });
};
