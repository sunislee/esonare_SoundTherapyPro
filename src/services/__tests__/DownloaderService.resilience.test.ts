/**
 * 【req#1/#3/#4】下载韧性单元测试 — DownloaderService
 *   路径A：慢源超时 → 快速切到下一个源（不在坏源上烧完重试）。
 *   路径B：假 404 / 连续失败 → 源健康度降位 + 冷却期内直接跳过死源。
 *   路径C：熔断 → 确定性冷却 → 真正重放剩余队列。
 */
// 显式转为 ES 模块：避免与同目录 resume.test.ts 作为"全局脚本"时顶层 RNFS/TOTAL/DEST/resource 块级重声明冲突(tsc TS2451)。
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

// 4 个不同 host 的源，按【req#1】新静态序返回：ghproxy.net → statically → raw → mirror(死源末位)
const GH = 'https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/wind_1.mp3';
const STATICALLY = 'https://cdn.statically.io/gh/sunislee/sound-therapy-assets/main/wind_1.mp3';
const RAW = 'https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/wind_1.mp3';
const MIRROR = 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/wind_1.mp3';

const TOTAL = 5 * 1024;
jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [{ id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', size: TOTAL }],
  ASSET_LIST: [{ id: 'wind_1', expectedSize: TOTAL }],
  getAssetUrls: () => [GH, STATICALLY, RAW, MIRROR],
  getLocalPath: (_cat: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
}));

const DEST = '/data/test/files/audio_resources/wind_1.mp3';
const resource = { id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', priority: 1, remoteUrl: GH };

/** 反复推进 fake timer + 冲刷微任务，让 async 串行队列在 fake timers 下走完。 */
async function pump(steps = 60, stepMs = 2000) {
  for (let i = 0; i < steps; i++) {
    jest.advanceTimersByTime(stepMs);
    for (let j = 0; j < 50; j++) await Promise.resolve();
  }
}

describe('DownloaderService 下载韧性 (req#1/#3/#4)', () => {
  let svc: any;
  let DeviceEventEmitter: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.clearAllMocks();
    ({ DownloaderServiceInstance: svc } = require('../DownloaderService'));
    RNFS = require('@dr.pogodin/react-native-fs');
    DeviceEventEmitter = require('react-native').DeviceEventEmitter;
    (globalThis as any).fetch = jest.fn();
    RNFS.exists.mockResolvedValue(false); // 文件不存在 → 走下载流程
    RNFS.mkdir.mockResolvedValue(undefined);
    svc.pollUntilReady = jest.fn().mockResolvedValue(undefined); // 跳过 fsync 轮询，聚焦韧性逻辑
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('路径A: 慢源超时 → 快速切到下一个源并成功（不在坏源上烧重试）', async () => {
    svc.streamDownloadTo = jest
      .fn()
      .mockRejectedValueOnce(new Error('Body read timeout (45000ms)')) // ghproxy.net 慢源超时
      .mockResolvedValueOnce(TOTAL);                                    // statically 成功

    await svc.downloadResource(resource);

    expect(svc.streamDownloadTo).toHaveBeenCalledTimes(2);
    expect(svc.streamDownloadTo.mock.calls[0][1]).toBe(GH);          // 先试主源 ghproxy.net
    expect(svc.streamDownloadTo.mock.calls[1][1]).toBe(STATICALLY);  // 超时即切下一家，未 inline sleep
    // ghproxy.net 失败 1 次但未达阈值(2) → 记失败但不冷却
    const h = svc.hostHealth.get('ghproxy.net');
    expect(h.fails).toBe(1);
    expect(h.cooldownUntil).toBe(0);
  });

  it('路径B-1: 连续失败源降位到末位（健康度排序）', () => {
    svc.recordHostResult(GH, false);
    svc.recordHostResult(GH, false); // 达阈值 → ghproxy.net 进冷却
    const urls = svc.getUrlsForResource(resource);
    expect(urls[urls.length - 1]).toBe(GH);     // 失败源被压到末位
    expect(urls[0]).toBe(STATICALLY);           // 未冷却源按原相对序前置
  });

  it('路径B-2: 冷却期内假404死源被直接跳过（连一次连接超时都不浪费）', async () => {
    svc.recordHostResult(MIRROR, false);
    svc.recordHostResult(MIRROR, false); // mirror.ghproxy 进冷却
    svc.streamDownloadTo = jest.fn().mockResolvedValue(TOTAL);

    await svc.downloadResource(resource);

    const triedUrls = svc.streamDownloadTo.mock.calls.map((c: any) => c[1]);
    expect(triedUrls).not.toContain(MIRROR);     // 死源本轮根本没被尝试
    expect(triedUrls[0]).toBe(GH);               // 正常主源优先
  });

  it('路径C: 连续终态失败 → 熔断 → 确定性冷却 → 真正重放剩余队列', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');
    svc.downloadResource = jest.fn().mockRejectedValue(new Error('boom')); // 每次都失败

    // 预置：每个任务已尝试满 MAX_RETRY_ROUNDS → 下一次失败即终态，快速触发熔断（不等真实退避）
    const items = [1, 2, 3, 4, 5].map((n) => ({
      id: `wind_${n}`, filename: `wind_${n}.mp3`, category: 'scenes', priority: 1, remoteUrl: GH,
    }));
    for (const it of items) svc.retrySchedule.set(it.id, { attempts: 3, nextRetryAt: 0 });
    for (const it of items) svc.downloadQueue.push(it);

    const startSpy = jest.spyOn(svc, 'startDownload');
    svc.startDownload();          // 不 await：靠 fake timers 驱动（此调用计入 startSpy）
    await pump(20, 1000);         // 先跑完第一轮（含项间 300ms 节流）

    // 前 3 个终态失败 → 熔断；emit(NETWORK_THROTTLE_EVENT,true) 至少一次
    expect(svc.isAutoBatchPaused()).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(expect.stringContaining('network-throttle'), true);
    const callsAfterFirstRound = svc.downloadResource.mock.calls.length;
    expect(callsAfterFirstRound).toBe(3); // 熔断前处理了 3 个，剩余 2 个留在队列

    // 越过 60s 冷却 → scheduleResume 触发 startDownload 重放剩余队列
    await pump(40, 5000);

    expect(svc.downloadResource.mock.calls.length).toBeGreaterThan(callsAfterFirstRound); // 队列被真正重放
    expect(startSpy).toHaveBeenCalledTimes(2); // 初始 + 冷却后重放各一次
    expect(svc.isAutoBatchPaused()).toBe(false); // 重放后队列清空、熔断解除
  });
});
