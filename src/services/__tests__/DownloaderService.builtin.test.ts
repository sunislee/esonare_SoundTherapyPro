/**
 * 【内置场景】DownloaderService.initQueue 必须把随包内置场景排除在下载队列之外，
 *   避免冷启/离线时内置场景抢跑联网下载。唯一判定源 = audioAssets.BUILTIN_SCENE_IDS。
 */
export {};

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
  CachesDirectoryPath: '/data/test/caches',
  exists: jest.fn(), stat: jest.fn(), mkdir: jest.fn(),
  writeFile: jest.fn(), appendFile: jest.fn(), moveFile: jest.fn(), unlink: jest.fn(),
}));

jest.mock('../../config/ResourceConfig', () => ({
  NOISE_REDUCTION_RESOURCES: [],
  SORTED_RESOURCES: [
    { id: 'healing_zen_bowl', filename: 'zen_bowl.m4a', category: 'scenes', priority: 1 },   // 内置 → 应被过滤
    { id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', priority: 2 },               // 非内置 → 保留
    { id: 'interactive_white_noise', filename: 'white_noise.m4a', category: 'scenes', priority: 3 }, // 内置 → 应被过滤
    { id: 'deep_forest', filename: 'deep_forest.mp3', category: 'scenes', priority: 4 },     // 非内置 → 保留
  ],
  RESOURCE_MAP: {},
  SCENE_BACKGROUND_RESOURCES: [],
}));

jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [], ASSET_LIST: [], getAssetUrls: () => [],
  getLocalPath: (_c: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
  BUILTIN_SCENE_IDS: ['healing_zen_bowl', 'interactive_white_noise'],
}));

describe('DownloaderService.initQueue 排除内置场景', () => {
  test('内置场景不进队列，非内置保留', () => {
    jest.resetModules();
    const { DownloaderServiceInstance: svc } = require('../DownloaderService');
    svc.initQueue();
    const ids = (svc.downloadQueue as any[]).map((r) => r.id);
    expect(ids).not.toContain('healing_zen_bowl');
    expect(ids).not.toContain('interactive_white_noise');
    expect(ids).toContain('wind_1');
    expect(ids).toContain('deep_forest');
  });
});
