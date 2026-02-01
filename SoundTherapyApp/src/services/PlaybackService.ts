import TrackPlayer, { Event, State } from 'react-native-track-player';

// 使用延迟加载以避免与 AudioService 的循环依赖
const getAudioService = () => require('./AudioService').default;

export const PlaybackService = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    getAudioService().play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    getAudioService().pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    getAudioService().stop();
  });

  // 监听播放状态变化，同步更新通知栏元数据
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    // 处理不同版本的 state 获取方式
    const state = (event as any).state ?? event;
    const scene = getAudioService().getCurrentScene();
    if (scene) {
      // 某些平台或版本可能需要手动再次触发元数据更新以保持同步
      // NotificationService 已经在 AudioService.updateAudioState 中调用
    }
  });
};

export default PlaybackService;
