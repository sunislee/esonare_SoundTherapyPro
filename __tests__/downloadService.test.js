jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { CrashReport: { getChannel: () => 'googlePlay' } },
  // DownloadService / DownloaderService 均从 react-native 取 DeviceEventEmitter，
  // 整体替换 react-native mock 时必须补上，否则模块加载即 TypeError
  DeviceEventEmitter: {
    emit: jest.fn(() => true),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

jest.mock('../src/constants/audioAssets', () => ({
  AUDIO_MANIFEST: [
    { id: 'nature_ocean', filename: 'base/ocean.mp3', category: 'nature' },
  ],
  IS_GOOGLE_PLAY_VERSION: true,
  getDownloadUrl: jest.fn(() => ['primary', 'secondary']),
  getLocalPath: jest.fn(() => '/tmp/base/ocean.mp3'),
  // DownloadService / DownloaderService 还依赖以下导出，缺失会让模块级引用变 undefined
  ASSET_LIST: [{ id: 'nature_ocean', expectedSize: 1024 }],
  GLOBAL_TOTAL_SIZE: 1024,
  getAssetUrls: jest.fn(() => ['primary', 'secondary']),
  STATICALLY_URL: 'https://cdn.example.com/',
  GITHUB_URL: 'https://github.example.com/',
  GHPROXY_NET_URL: 'https://ghproxy.example.com/',
  MIRROR_GHPROXY_URL: 'https://mirror.example.com/',
  // 【P1-6】ResourceConfig 现从该常量派生 base，mock 缺此导出会让模块级 .replace() 抛错
  PRIMARY_REMOTE_RESOURCE_BASE_URL: 'https://ghproxy.example.com/sunislee/sound-therapy-assets/main/',
}));

// 项目已从 react-native-fs 迁移到 @dr.pogodin/react-native-fs（见 AGENTS.md），
// 旧包名不再存在 → 必须 mock 新包名，否则套件加载即 Cannot find module。
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
  moveFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  stopDownload: jest.fn().mockResolvedValue(undefined),
}));

const RNFS = require('@dr.pogodin/react-native-fs');
const { DownloadService } = require('../src/services/DownloadService');

describe('download fallback', () => {
  test('downloadAudio falls back to secondary when primary fails', async () => {
    // 当前实现要求 result.statusCode === 200 且 stat().size > 0 才算成功，
    // 故主源 reject、备源返回 200（旧 mock 返回 undefined 会被 catch 吞掉 → 恒失败）
    RNFS.downloadFile.mockImplementation(({ fromUrl }) => ({
      jobId: fromUrl === 'primary' ? 1 : 2,
      promise: fromUrl === 'primary'
        ? Promise.reject(new Error('fail'))
        : Promise.resolve({ statusCode: 200, bytesWritten: 1024 }),
    }));
    const result = await DownloadService.downloadAudio('nature_ocean', ['primary', 'secondary'], 1);
    expect(result).toBe('/tmp/base/ocean.mp3');
    expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'primary' }));
    expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'secondary' }));
  });
});

