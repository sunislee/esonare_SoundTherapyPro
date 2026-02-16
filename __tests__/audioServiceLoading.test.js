jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
    setAudioModeAsync: jest.fn(),
  },
}));

jest.mock('../src/constants/audioAssets', () => ({
  AUDIO_MAP: {},
  DEFAULT_FALLBACK_SOURCE: null,
  getLocalPath: jest.fn(() => 'file:///tmp/test.mp3'),
}));

jest.mock('../src/constants/scenes', () => ({
  SCENES: [],
  SMALL_SCENE_IDS: [],
}));

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
}));

jest.mock('react-native-track-player', () => ({
  State: {
    Playing: 'playing',
    Paused: 'paused',
    Buffering: 'buffering',
    Loading: 'loading',
  },
}));

const { Audio } = require('expo-av');
const AudioService = require('../src/services/AudioService').default;

describe('AudioService loading', () => {
  afterEach(async () => {
    await AudioService.stopAll();
  });

  test('emits loading true then false on playback start', async () => {
    const loadingEvents = [];
    const statusCallbacks = [];
    const unsubscribe = AudioService.addLoadingListener((event) => {
      loadingEvents.push(event);
    });

    const mockSound = {
      setOnPlaybackStatusUpdate: (cb) => statusCallbacks.push(cb),
      getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
      playAsync: jest.fn().mockResolvedValue(undefined),
      stopAsync: jest.fn().mockResolvedValue(undefined),
      unloadAsync: jest.fn().mockResolvedValue(undefined),
    };

    Audio.Sound.createAsync.mockResolvedValue({ sound: mockSound });

    const scene = {
      id: 'base_test',
      filename: 'test.mp3',
      category: 'nature',
      audioUrl: 'https://example.com/test.mp3',
    };

    const playPromise = AudioService.playScene(scene, { triggerLoading: true });
    expect(loadingEvents[0]).toEqual({ id: 'base_test', loading: true });

    await playPromise;
    expect(statusCallbacks.length).toBeGreaterThan(0);
    statusCallbacks[0]({ isLoaded: true, isPlaying: true });

    expect(loadingEvents).toContainEqual({ id: 'base_test', loading: false });
    unsubscribe();
  });
});
