/**
 * P0 回归锁 · 幽灵调用 startBackgroundDownload（2026-09-26 TypeError 取证 → f83758ab 合入）。
 *
 * 历史事故：ProfileScreen.startRealBackgroundDownload() 调用 DownloaderService 上【不存在】的
 * startBackgroundDownload()，TypeError 在 :214 掐断回调 → 「清除缓存」后 resourceLoadingChanged /
 * subscribeDownload / backgroundImagesReady 全链失联；caller catch 吞错，UI 静默无感知。
 * 修复语义（f83758ab）：删除幽灵调用而非实现它——本函数只订阅与刷新；在此启动
 * DownloaderService 会与旧引擎并发写同一批 .part 文件、破坏 P1-5 续传语义。
 *
 * 锁两条腿：① 实例上该方法必须永远 undefined（谁想"顺手实现"先读上面竞态警告）；
 * ② ProfileScreen 源码正则不得再出现该调用（合并回潮 = 本测试必红）。
 */
import { DownloaderServiceInstance } from '../DownloaderService';

// 源码正则断言用 node fs——以 require 动态取，避免 tsconfig 未含 @types/node 引入新 tsc 基线错误。
declare const require: any;

// 与 DownloaderService.builtin.test.ts 同款最小 mock：让真实 DownloaderService 可在 node/jest 加载。
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
  CachesDirectoryPath: '/data/test/caches',
  exists: jest.fn(), stat: jest.fn(), mkdir: jest.fn(),
  writeFile: jest.fn(), appendFile: jest.fn(), moveFile: jest.fn(), unlink: jest.fn(),
}));

jest.mock('../../config/ResourceConfig', () => ({
  NOISE_REDUCTION_RESOURCES: [],
  SORTED_RESOURCES: [],
  RESOURCE_MAP: {},
  SCENE_BACKGROUND_RESOURCES: [],
}));

jest.mock('../../constants/audioAssets', () => ({
  AUDIO_MANIFEST: [], ASSET_LIST: [], getAssetUrls: () => [],
  getLocalPath: (_c: string, fn: string) => `/data/test/files/audio_resources/${fn}`,
  IS_GOOGLE_PLAY_VERSION: false,
  BUILTIN_SCENE_IDS: [],
}));

describe('P0 回归锁 · 幽灵调用 startBackgroundDownload', () => {
  it('① DownloaderServiceInstance 上该方法必须不存在（undefined）', () => {
    expect((DownloaderServiceInstance as any).startBackgroundDownload).toBeUndefined();
  });

  it('② ProfileScreen 源码不得再出现 startBackgroundDownload( 调用', () => {
    // jest cwd = 项目根（rootDir），相对路径直读源码；与 __dirname/ts node types 解耦。
    const fs = require('fs');
    const src: string = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
    expect(src).not.toMatch(/startBackgroundDownload\s*\(/);
  });
});
