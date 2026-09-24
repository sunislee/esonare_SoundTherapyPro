/**
 * 【内置场景】BuiltinAssetBootstrap 单元测试
 *   覆盖大哥拍板的三条硬要求：
 *     1. 拷贝幂等 —— 已就绪(exists+size)跳过；缺失/损坏才重拷。
 *     2. 失败不回落 —— 单场景 copyFileAssets 抛错 → 绝不进下载队列(CDN)，仅保持『正在准备』，下次冷启重试；不影响其余场景。
 *     3. 唯一判定源 —— 仅处理 BUILTIN_SCENES 内场景。
 */
export {};
let RNFS: any;
let OfflineService: any;

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
  exists: jest.fn(),
  stat: jest.fn(),
  mkdir: jest.fn(),
  copyFile: jest.fn(),
  copyFileAssets: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('../../constants/audioAssets', () => ({
  BUILTIN_SCENES: {
    healing_zen_bowl:        { filename: 'zen_bowl.m4a',     assetPath: 'file:///android_asset/sounds/builtin/zen_bowl.m4a',     expectedSize: 391549 },
    interactive_white_noise: { filename: 'white_noise.m4a',  assetPath: 'file:///android_asset/sounds/builtin/white_noise.m4a',  expectedSize: 69881 },
  },
  BUILTIN_SCENE_IDS: ['healing_zen_bowl', 'interactive_white_noise'],
  isBuiltinScene: (id: string) => id === 'healing_zen_bowl' || id === 'interactive_white_noise',
  AUDIO_MANIFEST: [
    { id: 'healing_zen_bowl', filename: 'zen_bowl.m4a', category: 'scenes', size: 391549 },
    { id: 'interactive_white_noise', filename: 'white_noise.m4a', category: 'scenes', size: 69881 },
  ],
  getLocalPath: (_cat: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
}));

jest.mock('../OfflineService', () => ({
  __esModule: true,
  default: { checkSceneAudioReady: jest.fn(), recheckScene: jest.fn() },
}));

// 工厂内自包含 mock：实例直接挂 addTaskToQueue，并用 __addTaskSpy 暴露同一引用供断言。
jest.mock('../DownloaderService', () => {
  const fn = jest.fn();
  const inst = { addTaskToQueue: fn, __addTaskSpy: fn };
  return { __esModule: true, get DownloaderServiceInstance() { return inst; } };
});

const ZEN = 'healing_zen_bowl';
const WHITE = 'interactive_white_noise';
const ZEN_DEST = '/data/test/files/audio_resources/zen_bowl.m4a';

describe('BuiltinAssetBootstrap 内置场景落盘', () => {
  let bootstrap: any;
  let addTaskSpy: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    RNFS = require('@dr.pogodin/react-native-fs');
    OfflineService = require('../OfflineService').default;
    // 默认：拷贝成功 + 落盘后就绪
    RNFS.mkdir.mockResolvedValue(undefined);
    RNFS.unlink.mockResolvedValue(undefined);
    RNFS.copyFileAssets.mockResolvedValue(undefined);
    RNFS.exists.mockResolvedValue(false);
    OfflineService.recheckScene.mockResolvedValue(true);
    bootstrap = require('../BuiltinAssetBootstrap').default;
    addTaskSpy = require('../DownloaderService').DownloaderServiceInstance.__addTaskSpy;
    // 重置内部 started 标志（单例跨用例复用）
    bootstrap.started = false;
  });

  test('幂等：所有场景已就绪 → 不拷贝', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(true);
    await bootstrap.bootstrap();
    expect(RNFS.copyFileAssets).not.toHaveBeenCalled();
    expect(addTaskSpy).not.toHaveBeenCalled();
  });

  test('缺失/损坏 → 逐场景 copyFileAssets(android_asset→DocumentDir) 并 recheckScene 转 Ready', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false); // 未就绪 → 触发拷贝
    await bootstrap.bootstrap();
    expect(RNFS.copyFileAssets).toHaveBeenCalledWith(
      'sounds/builtin/zen_bowl.m4a', ZEN_DEST, // 相对 assets 根、无 file:// 前缀
    );
    expect(RNFS.copyFileAssets).toHaveBeenCalledTimes(2); // 两个内置场景都拷
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(ZEN);
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(WHITE);
    expect(addTaskSpy).not.toHaveBeenCalled();
  });

  test('【不变式①】copyFileAssets 持续抛错 → 绝不回落 CDN(addTaskToQueue)、内置不进下载队列、不卡死', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFileAssets.mockRejectedValue(new Error('ENOSPC disk full'));
    await bootstrap.bootstrap();
    // 内置音频绝不进下载队列：失败只保持『正在准备』，下次冷启再拷。回落 CDN 会把内置卡误标 error —— 严禁。
    expect(addTaskSpy).not.toHaveBeenCalled();
    // 但每个场景仍被尝试(含原地重试)，且单例正常返回不抛、不永久卡死。
    expect(RNFS.copyFileAssets).toHaveBeenCalled();
  });

  test('【串行隔离】仅一场景拷贝失败，另一场景仍成功就绪；失败者绝不回落 CDN', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFileAssets.mockImplementation(async (src: string) => {
      if (src.includes('zen_bowl')) throw new Error('boom');
    });
    await bootstrap.bootstrap();
    // white 成功就绪；zen 失败但绝不回落下载队列(内置铁律)。
    expect(addTaskSpy).not.toHaveBeenCalled();
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(WHITE);
  });

  test('started 幂等：bootstrap 二次调用不重复处理', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    await bootstrap.bootstrap();
    const callsAfterFirst = RNFS.copyFileAssets.mock.calls.length;
    await bootstrap.bootstrap(); // 第二次应被 started 短路
    expect(RNFS.copyFileAssets).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
