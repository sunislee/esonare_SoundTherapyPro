import TrackPlayer, { Event, State } from 'react-native-track-player';

// Use lazy loading to avoid circular dependency with AudioService
const getAudioService = () => require('./AudioService').default;

export const PlaybackService = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    getAudioService().play();
    // 直接同步 TrackPlayer 状态，防止系统夺取焦点
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    getAudioService().pause();
    // 直接同步 TrackPlayer 状态，防止系统夺取焦点
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    getAudioService().stop();
  });

  // Listen for playback state changes and sync notification bar metadata
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    // Handle state acquisition for different versions
    const state = (event as any).state ?? event;
    const scene = getAudioService().getCurrentScene();
    if (scene) {
      // Some platforms or versions may require manual re-triggering of metadata updates to stay in sync
      // NotificationService is already called in AudioService.updateAudioState
    }
  });
};

export default PlaybackService;
