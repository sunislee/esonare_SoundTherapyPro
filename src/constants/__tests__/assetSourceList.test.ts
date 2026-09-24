/**
 * CDN 故障转移链防回归断言（2026-09-24 满屏「下载失败/需要网络」根因锁定）。
 *
 * 背景：设备侧统计到 ghproxy.net 190 次、cdn.statically.io / raw.githubusercontent.com /
 *   mirror.ghproxy.com 各 158 次 URL_FAIL。curl 实测证明：
 *     · mirror.ghproxy.com      → http=000（彻底死亡）
 *     · raw.githubusercontent.com → 大陆污染性 404
 *   这两家当时排在故障转移链里，等于每个文件都白烧两轮超时；再叠加"固定 20s 连接超时套在整包
 *   传输上"(RN fetch 无流式 body)，≥1.4MB 的文件必然全源耗尽 → 终态失败 → 熔断 → 满屏红字。
 *
 * 本测试锁死：故障转移链必须【只含实测活源】、【按实测时延排序】、且死源永不再进入。
 */
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
}));

import { getAssetUrls, getDownloadUrlByChannel } from '../audioAssets';

/** 已用 curl 实证死亡的源——绝不允许再出现在任何故障转移链里。 */
const DEAD_HOSTS = ['mirror.ghproxy.com', 'raw.gitmirror.com'];

describe('getAssetUrls · CDN 故障转移链健康度', () => {
  const urls = getAssetUrls('base/deep_ocean_abyss.m4a');

  it('至少给出 4 个可用源（单点故障不得拖垮整条下载链）', () => {
    expect(urls.length).toBeGreaterThanOrEqual(4);
  });

  it('【死源护栏】链上永不含已实证死亡的主机', () => {
    for (const u of urls) {
      for (const dead of DEAD_HOSTS) {
        expect(u).not.toContain(dead);
      }
    }
  });

  it('【实测排序】主源必须是实测最快的 ghproxy.net，GitHub 官方直连只能垫末位', () => {
    expect(urls[0]).toContain('ghproxy.net');
    expect(urls[urls.length - 1]).toContain('raw.githubusercontent.com');
  });

  it('全部为 https 且无重复（重复源只会白烧超时）', () => {
    for (const u of urls) expect(u.startsWith('https://')).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('路径含空格时逐段编码（noise reduction 目录）', () => {
    const spaced = getAssetUrls('noise reduction/balanced_noise_track_1.mp3');
    expect(spaced.length).toBeGreaterThan(0);
    for (const u of spaced) {
      expect(u).toContain('noise%20reduction/balanced_noise_track_1.mp3');
      expect(u).not.toContain(' '); // URL 里出现裸空格会被服务端拒绝/截断
    }
  });

  it('国内渠道沿用同一实证链；海外渠道仅把 GitHub 直连前置', () => {
    const cn = getDownloadUrlByChannel(false, 'base/moonlight.m4a');
    const gp = getDownloadUrlByChannel(true, 'base/moonlight.m4a');
    expect(cn).toEqual(urls.map((u) => u.replace('base/deep_ocean_abyss.m4a', 'base/moonlight.m4a')));
    expect(gp[0]).toContain('raw.githubusercontent.com');
    for (const dead of DEAD_HOSTS) {
      expect(gp.some((u) => u.includes(dead))).toBe(false);
    }
  });
});