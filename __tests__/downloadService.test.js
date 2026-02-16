jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { CrashReport: { getChannel: () => 'googlePlay' } },
}));

jest.mock('../src/constants/audioAssets', () => ({
  AUDIO_MANIFEST: [
    { id: 'nature_ocean', filename: 'base/ocean.mp3', category: 'nature' },
  ],
  IS_GOOGLE_PLAY_VERSION: true,
  getDownloadUrl: jest.fn(() => ['primary', 'secondary']),
  getLocalPath: jest.fn(() => '/tmp/base/ocean.mp3'),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(),
}));

const RNFS = require('react-native-fs');
const { DownloadService } = require('../src/services/DownloadService');

describe('download fallback', () => {
  test('downloadAudio falls back to secondary when primary fails', async () => {
    RNFS.downloadFile.mockImplementation(({ fromUrl }) => ({
      promise: fromUrl === 'primary'
        ? Promise.reject(new Error('fail'))
        : Promise.resolve(),
    }));
    const result = await DownloadService.downloadAudio('nature_ocean', ['primary', 'secondary'], 1);
    expect(result).toBeTruthy();
    expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'primary' }));
    expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'secondary' }));
  });
});
