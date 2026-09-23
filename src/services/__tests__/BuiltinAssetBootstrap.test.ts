/**
 * 【内置场景】BuiltinAssetBootstrap 单元测试
 *   覆盖大哥拍板的三条硬要求：
 *     1. 拷贝幂等 —— 已就绪(exists+size)跳过；缺失/损坏才重拷。
 *     2. 失败回退 —— 单场景 copyFile 抛错 → 回落 addTaskToQueue，且不永久卡死、不影响其余场景。
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
    RNFS.copyFile.mockResolvedValue(undefined);
    RNFS.exists.mockResolvedValue(false);
    OfflineService.recheckScene.mockResolvedValue(true);
    bootstrap = require('../BuiltinAssetBootstrap').default;
    addTaskSpy = require('../DownloaderService').DownloaderServiceInstance.__addTaskSpy;
    // 重置内部 started 标志（单例跨用例复用）
    bootstrap.started = false;
  });

  test('幂等：所有场景已就绪 → 不拷贝、不建目录', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(true);
    await bootstrap.bootstrap();
    expect(RNFS.copyFile).not.toHaveBeenCalled();
    expect(RNFS.mkdir).not.toHaveBeenCalled();
    expect(addTaskSpy).not.toHaveBeenCalled();
  });

  test('缺失/损坏 → 逐场景 copyFile(android_asset→DocumentDir) 并 recheckScene 转 Ready', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false); // 未就绪 → 触发拷贝
    await bootstrap.bootstrap();
    expect(RNFS.copyFile).toHaveBeenCalledWith(
      'file:///android_asset/sounds/builtin/zen_bowl.m4a', ZEN_DEST,
    );
    expect(RNFS.copyFile).toHaveBeenCalledTimes(2); // 两个内置场景都拷
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(ZEN);
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(WHITE);
    expect(addTaskSpy).not.toHaveBeenCalled();
  });

  test('失败回退：copyFile 抛错 → 该场景回落 addTaskToQueue，不永久卡死', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFile.mockRejectedValue(new Error('ENOSPC disk full'));
    await bootstrap.bootstrap();
    // 两个内置场景拷贝都失败 → 都回落下载队列
    expect(addTaskSpy).toHaveBeenCalledWith(ZEN);
    expect(addTaskSpy).toHaveBeenCalledWith(WHITE);
  });

  test('部分失败：仅一场景拷贝失败，另一场景仍成功就绪（allSettled 隔离）', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFile.mockImplementation(async (src: string) => {
      if (src.includes('zen_bowl')) throw new Error('boom');
    });
    await bootstrap.bootstrap();
    // zen 失败回落，white 成功不回落
    expect(addTaskSpy).toHaveBeenCalledWith(ZEN);
    expect(addTaskSpy).not.toHaveBeenCalledWith(WHITE);
    expect(OfflineService.recheckScene).toHaveBeenCalledWith(WHITE);
  });

  test('started 幂等：bootstrap 二次调用不重复处理', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    await bootstrap.bootstrap();
    const callsAfterFirst = RNFS.copyFile.mock.calls.length;
    await bootstrap.bootstrap(); // 第二次应被 started 短路
    expect(RNFS.copyFile).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
