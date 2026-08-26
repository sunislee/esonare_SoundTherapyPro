/**
 * P1-5 断点续传单元测试 — DownloaderService.streamDownloadTo
 */
// 注意：不能顶层 import RNFS —— beforeEach 里 jest.resetModules() 会重建 mock 注册表，
// svc 内部每次拿到的是新实例；必须在 reset 后重新 require 才能与 svc 共享同一 mock。
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

const TOTAL = 5 * 1024; // 测试文件总大小 5KB
jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [{ id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', size: TOTAL }],
  ASSET_LIST: [{ id: 'wind_1', expectedSize: TOTAL }],
  getAssetUrls: () => ['https://cdn.example.com/wind_1.mp3'],
  getLocalPath: (_cat: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
}));

const KB = 1024;
const CDN_URL = 'https://cdn.example.com/wind_1.mp3';
const DEST = '/data/test/files/audio_resources/wind_1.mp3';
const PART = `${DEST}.part`;
const resource = { id: 'wind_1', filename: 'wind_1.mp3', category: 'scenes', priority: 1, remoteUrl: CDN_URL };

/** arrayBuffer 风格响应（RN whatwg-fetch 主路径：无 body.getReader） */
function abResponse(status: number, bytes: Uint8Array) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-length', String(bytes.length)]]),
    arrayBuffer: async () => bytes.buffer,
  };
}

/** Web Streams 风格响应（body.getReader 可用） */
function streamResponse(status: number, chunks: Uint8Array[]) {
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }) }) },
  };
}

describe('streamDownloadTo 断点续传 (P1-5)', () => {
  let svc: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    ({ DownloaderServiceInstance: svc } = require('../DownloaderService'));
    RNFS = require('@dr.pogodin/react-native-fs'); // 与 svc 内部同一 mock 实例
    (globalThis as any).fetch = jest.fn();
    RNFS.exists.mockResolvedValue(false);
    RNFS.writeFile.mockResolvedValue(PART);
    RNFS.appendFile.mockResolvedValue(undefined);
    RNFS.moveFile.mockResolvedValue(true);
    RNFS.unlink.mockResolvedValue(undefined);
  });

  it('A1: 全新下载（arrayBuffer 主路径）— 覆盖写 + 改名，返回总字节数', async () => {
    (globalThis as any).fetch.mockResolvedValue(abResponse(200, new Uint8Array(TOTAL)));

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect(written).toBe(TOTAL);
    expect((globalThis as any).fetch.mock.calls[0][1].headers.Range).toBeUndefined();
    expect(RNFS.writeFile).toHaveBeenCalledWith(PART, expect.any(String), 'base64');
    expect(RNFS.appendFile).not.toHaveBeenCalled();
    expect(RNFS.moveFile).toHaveBeenCalledWith(PART, DEST);
  });

  it('A2: .part 已存在(1KB) + 服务端 206 — Range 续传，返回值 = 断点 + 新字节', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: KB }).mockResolvedValue({ size: TOTAL });
    (globalThis as any).fetch.mockResolvedValue(abResponse(206, new Uint8Array(TOTAL - KB)));

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect((globalThis as any).fetch.mock.calls[0][1].headers.Range).toBe('bytes=1024-');
    expect(RNFS.appendFile).toHaveBeenCalledWith(PART, expect.any(String), 'base64');
    expect(written).toBe(TOTAL);
    expect(RNFS.moveFile).toHaveBeenCalledWith(PART, DEST);
  });

  it('A3: .part 已存在但服务端返回 200（忽略 Range）— 丢弃断点从 0 重下', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: KB }).mockResolvedValue({ size: TOTAL });
    (globalThis as any).fetch.mockResolvedValue(abResponse(200, new Uint8Array(TOTAL)));

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect(RNFS.unlink).toHaveBeenCalledWith(PART);
    expect(written).toBe(TOTAL);
    expect(RNFS.moveFile).toHaveBeenCalledWith(PART, DEST);
  });

  it('A4: 服务端返回 416（.part 实际已完整）— 零写入直接改名', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: KB }).mockResolvedValue({ size: TOTAL });
    (globalThis as any).fetch.mockResolvedValue(abResponse(416, new Uint8Array(0)));

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect(written).toBe(KB);
    expect(RNFS.moveFile).toHaveBeenCalledWith(PART, DEST);
    expect(RNFS.appendFile).not.toHaveBeenCalled();
  });

  it('A5: .part 已达期望大小（上次写满但改名前被杀）— 跳过 fetch 直接改名', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: TOTAL });

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect(written).toBe(TOTAL);
    expect(RNFS.moveFile).toHaveBeenCalledWith(PART, DEST);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('A6: 大小校验失败 — 抛错且保留 .part（供下次续传），不改名', async () => {
    (globalThis as any).fetch.mockResolvedValue(abResponse(200, new Uint8Array(KB)));
    RNFS.stat.mockResolvedValue({ size: KB });

    await expect(svc.streamDownloadTo(resource, CDN_URL, DEST)).rejects.toThrow(/大小校验失败/);
    expect(RNFS.unlink).not.toHaveBeenCalled();
    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it('A7: fetch 网络异常 — reject，.part 不删除', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: KB });
    (globalThis as any).fetch.mockRejectedValue(new Error('network down'));

    await expect(svc.streamDownloadTo(resource, CDN_URL, DEST)).rejects.toThrow();
    expect(RNFS.unlink).not.toHaveBeenCalled();
  });

  it('A8: 流式路径（body.getReader）续传 — 每个 chunk 都 appendFile 到 .part', async () => {
    RNFS.exists.mockImplementation((p: string) => Promise.resolve(p === PART));
    RNFS.stat.mockResolvedValueOnce({ size: KB }).mockResolvedValue({ size: TOTAL });
    (globalThis as any).fetch.mockResolvedValue(
      streamResponse(206, [new Uint8Array(KB), new Uint8Array(TOTAL - 2 * KB), new Uint8Array(KB)])
    );

    const written = await svc.streamDownloadTo(resource, CDN_URL, DEST);

    expect((globalThis as any).fetch.mock.calls[0][1].headers.Range).toBe('bytes=1024-');
    expect(RNFS.appendFile).toHaveBeenCalledTimes(3);
    RNFS.appendFile.mock.calls.forEach((c: any) => expect(c[0]).toBe(PART));
    expect(written).toBe(TOTAL);
  });
});