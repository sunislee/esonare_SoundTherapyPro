import TrackPlayer, { Event, State } from 'react-native-track-player';

// Use lazy loading to avoid circular dependency with AudioService
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
