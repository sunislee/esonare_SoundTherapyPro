/**
 * 【网络自愈 · req#1/#3】DownloaderService.recoverFailedOnNetworkRestore 单测
 *   - 终态 failed 场景在网络恢复后 → 状态重置为 pending(等待)、清退避计数、重新入队并触发下载。
 *   - 内置场景从不进下载队列/不会被标 failed → 自愈不受影响（completed 的内置不被重排）。
 */
export {};
let RNFS: any;

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
  CachesDirectoryPath: '/data/test/caches',
  exists: jest.fn(), stat: jest.fn(), mkdir: jest.fn(),
  writeFile: jest.fn(), appendFile: jest.fn(), moveFile: jest.fn(), unlink: jest.fn(),
}));

jest.mock('../../config/ResourceConfig', () => ({
  NOISE_REDUCTION_RESOURCES: [], SORTED_RESOURCES: [], RESOURCE_MAP: {}, SCENE_BACKGROUND_RESOURCES: [],
}));

const TOTAL = 5 * 1024;
// wind_1 / deep_forest：可下载场景；zen_bowl：内置场景（completed，不应被自愈触碰）。
jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [
    { id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', size: TOTAL },
    { id: 'deep_forest', filename: 'deep_forest.mp3', category: 'scenes', size: TOTAL },
    { id: 'zen_bowl', filename: 'zen_bowl.m4a', category: 'scenes', size: TOTAL },
  ],
  ASSET_LIST: [], getAssetUrls: () => ['https://ghproxy.net/x/wind_1.mp3'],
  getLocalPath: (_cat: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
  BUILTIN_SCENE_IDS: ['zen_bowl'],
}));

describe('DownloaderService 网络自愈重排 (req#1/#3)', () => {
  let svc: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.clearAllMocks();
    ({ DownloaderServiceInstance: svc } = require('../DownloaderService'));
    RNFS = require('@dr.pogodin/react-native-fs');
    (globalThis as any).fetch = jest.fn();
    RNFS.exists.mockResolvedValue(false);
    RNFS.mkdir.mockResolvedValue(undefined);
    svc.pollUntilReady = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('终态 failed + 网络恢复 → 重置为等待(pending)、清退避、重新入队并触发下载', () => {
    // 预置两个终态失败场景（含遗留退避/重试计数，应被清除）
    svc.notify({ resourceId: 'wind_1', filename: 'wind_1.mp3', progress: 0, status: 'failed' });
    svc.notify({ resourceId: 'deep_forest', filename: 'deep_forest.mp3', progress: 0, status: 'failed' });
    svc.retrySchedule.set('wind_1', { attempts: 4, nextRetryAt: Date.now() + 999999 });
    svc.retryCount.set('wind_1', 4);

    const startSpy = jest.spyOn(svc, 'startDownload').mockImplementation(() => {});

    const n = svc.recoverFailedOnNetworkRestore();

    expect(n).toBe(2);
    // 重新入队（去重，各一次）
    const ids = svc.downloadQueue.map((r: any) => r.id);
    expect(ids.filter((x: string) => x === 'wind_1')).toHaveLength(1);
    expect(ids).toContain('deep_forest');
    // 状态由 failed → pending（UI 脱离 error「稍后重试」态）
    expect(svc.getStatus('wind_1').status).toBe('pending');
    expect(svc.getStatus('deep_forest').status).toBe('pending');
    // 退避/重试计数被清
    expect(svc.retrySchedule.has('wind_1')).toBe(false);
    expect(svc.retryCount.has('wind_1')).toBe(false);
    // 复用熔断重放链路：触发一次 startDownload
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('内置场景不受自愈影响（completed 的内置不被重排；仅 failed 被重排）', () => {
    // 内置场景以 completed 存在（bootstrap 拷贝成功），且从未进下载队列。
    svc.notify({ resourceId: 'zen_bowl', filename: 'zen_bowl.m4a', progress: 100, status: 'completed' });
    svc.notify({ resourceId: 'wind_1', filename: 'wind_1.mp3', progress: 0, status: 'failed' });

    const startSpy = jest.spyOn(svc, 'startDownload').mockImplementation(() => {});
    const n = svc.recoverFailedOnNetworkRestore();

    expect(n).toBe(1); // 只有 failed 的 wind_1 被重排
    const ids = svc.downloadQueue.map((r: any) => r.id);
    expect(ids).toContain('wind_1');
    expect(ids).not.toContain('zen_bowl'); // 内置未被重新入队
    expect(svc.getStatus('zen_bowl').status).toBe('completed'); // 内置状态原样保留
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('无终态失败场景 → 自愈空转，不触发下载', () => {
    svc.notify({ resourceId: 'wind_1', filename: 'wind_1.mp3', progress: 100, status: 'completed' });
    const startSpy = jest.spyOn(svc, 'startDownload').mockImplementation(() => {});
    expect(svc.recoverFailedOnNetworkRestore()).toBe(0);
    expect(startSpy).not.toHaveBeenCalled();
  });
});
