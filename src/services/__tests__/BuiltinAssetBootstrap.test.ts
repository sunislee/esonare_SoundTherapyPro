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

// 【D-C7-1 接线断言用】A/C 编排器 spy：bootstrap 收尾对未就绪场景必须自动移交编排调度；
// mock 掉真实现以免单测被真实定时器（快/慢阶段退避）污染。
jest.mock('../../utils/builtinReadiness', () => {
  const fn = jest.fn().mockResolvedValue('pending-retry');
  return { __esModule: true, ensureBuiltinReadyWithRetry: fn, DEFAULT_BUILTIN_RETRY_SCHEDULE: {}, __orchSpy: fn };
});
jest.mock('../../utils/SceneDownloadStore', () => ({ tickScene: jest.fn() }));

const ZEN = 'healing_zen_bowl';
const WHITE = 'interactive_white_noise';
const ZEN_DEST = '/data/test/files/audio_resources/zen_bowl.m4a';

describe('BuiltinAssetBootstrap 内置场景落盘', () => {
  let bootstrap: any;
  let addTaskSpy: jest.Mock;
  let orchSpy: jest.Mock;

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
    orchSpy = require('../../utils/builtinReadiness').__orchSpy;
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

  // ═══════════════ 【D-C7-1 接线 · 冷启动失败必进编排器】（报告 §⑪ 缺陷锁死）═══════════════

  test('【D-C7-1】copyFileAssets 持续 reject(ENOSPC) → bootstrap 收尾对每个未就绪场景自动移交 A/C 编排器', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFileAssets.mockRejectedValue(new Error('ENOSPC: no space left on device'));
    await bootstrap.bootstrap();
    // 接线生效 = 编排器按场景逐个被调用（mock 的 2 个内置场景全部失败 → 2 次）。
    expect(orchSpy).toHaveBeenCalledTimes(2);
    expect(orchSpy.mock.calls.map((c: any[]) => c[0]).sort()).toEqual([ZEN, WHITE]);
    // deps/opts/schedule/log 五参齐全（编排器契约不缩水：磁盘真相+幂等重拷+store tick）。
    const call = orchSpy.mock.calls[0];
    const deps = call[1];
    const opts = call[2];
    expect(typeof deps.isDiskReady).toBe('function');
    expect(typeof deps.copyOnce).toBe('function');
    expect(typeof deps.tick).toBe('function');
    expect(opts.maxCopyAttempts).toBe(3);
    expect(call[3]).toBeDefined();
    expect(typeof call[4]).toBe('function');
    // 接线不得破坏既有不变式：失败仍绝不回落 CDN。
    expect(addTaskSpy).not.toHaveBeenCalled();
  });

  test('【D-C7-1 反向锁】全部就绪 → 编排器零启动（成功路径无多余调度）', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(true);
    await bootstrap.bootstrap();
    expect(orchSpy).not.toHaveBeenCalled();
  });

  test('【D-C7-1 部分失败】仅 zen 拷贝失败 → 只有 zen 进编排器，white 就绪不重复调度', async () => {
    OfflineService.checkSceneAudioReady.mockResolvedValue(false);
    RNFS.copyFileAssets.mockImplementation(async (src: string) => {
      if (src.includes('zen_bowl')) throw new Error('ENOSPC');
    });
    await bootstrap.bootstrap();
    expect(orchSpy).toHaveBeenCalledTimes(1);
    expect(orchSpy.mock.calls[0][0]).toBe(ZEN);
  });
});
