/**
 * 【串行铁律 · 2026-09-24】startDownload 并发必须收敛为单条队列。
 *
 * 线上取证：清数据冷启动时，同一毫秒内出现 43 次 downloadResource —— 因为旧 startDownload 的
 *   防重入守卫写在 `await NetworkGateService.requestDownloadAccess()`(内部 await NetInfo.fetch())
 *   之前、而 queueProcessingPromise 的赋值写在该 await 之后。冷启动同一帧涌入的几十个调用全部
 *   在 await 窗口里穿过守卫 → 并发拉起几十条 processQueue → 共享 GitHub 代理被自我 DDoS 限流
 *   → 全线超时 → 满屏「下载失败/需要网络」。本测试把「串行」这条立命之本直接锁死。
 */
export {};
let RNFS: any;

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
  CachesDirectoryPath: '/data/test/caches',
  exists: jest.fn(),
  stat: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  appendFile: jest.fn(),
  moveFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('../../config/ResourceConfig', () => ({
  NOISE_REDUCTION_RESOURCES: [],
  SORTED_RESOURCES: [],
  RESOURCE_MAP: {},
  SCENE_BACKGROUND_RESOURCES: [],
}));

const GH = 'https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/wind_1.mp3';

jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [{ id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', size: 5120 }],
  ASSET_LIST: [{ id: 'wind_1', expectedSize: 5120 }],
  getAssetUrls: () => [GH],
  getLocalPath: (_cat: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
}));

/** 推进 fake timer + 冲刷微任务，让 async 流程在 fake timers 下走完。 */
async function pump(steps = 30, stepMs = 200) {
  for (let i = 0; i < steps; i++) {
    jest.advanceTimersByTime(stepMs);
    for (let j = 0; j < 50; j++) await Promise.resolve();
  }
}

describe('DownloaderService 串行铁律（并发退化为单飞）', () => {
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
  });

  it('同一帧并发 20 次 startDownload → processQueue 只被启动 1 次、在途并发恒为 1', async () => {
    let started = 0;
    let concurrent = 0;
    let maxConcurrent = 0;

    svc.processQueue = jest.fn(async () => {
      started += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((r) => { setTimeout(() => r(), 500); }); // 模拟一次真实串行处理
      concurrent -= 1;
    });

    for (let i = 0; i < 20; i++) svc.startDownload(); // 同步连发，复刻冷启动涌入
    await pump(30, 200);

    expect(started).toBe(1);
    expect(maxConcurrent).toBe(1);
  });

  it('一轮跑完后守卫必须释放：后续 startDownload 仍能正常再起一轮', async () => {
    let started = 0;
    svc.processQueue = jest.fn(async () => {
      started += 1;
      await new Promise<void>((r) => { setTimeout(() => r(), 200); });
    });

    svc.startDownload();
    await pump(30, 200);
    expect(started).toBe(1);

    svc.startDownload(); // 上一轮已 settle → 允许新一轮（冷却续跑/用户点按依赖此行为）
    await pump(30, 200);
    expect(started).toBe(2);
  });
});