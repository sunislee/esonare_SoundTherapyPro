/**
 * downloadStatusMapping 回归测试 —— 锁定「下载器终态 → 首页卡片状态」映射，
 * 证明任何失败路径都离开 preparing-0% 落到 error（修复 HomeScreen 永久「准备中 0%」）。
 *
 * 纯函数、零 RN/IO 依赖，直接覆盖状态转移矩阵。
 */
import { mapDownloaderStatusToSceneState } from '../downloadStatusMapping';

describe('mapDownloaderStatusToSceneState', () => {
  it('failed → error(0)，绝不留在 downloading（永久准备中根因）', () => {
    const out = mapDownloaderStatusToSceneState({ status: 'failed', progress: 0 });
    expect(out).toEqual({ progress: 0, status: 'error' });
    // 反证：失败绝不能映射成仍显示 spinner 的 downloading。
    expect(out?.status).not.toBe('downloading');
  });

  it('failed 即便带残留进度也必须归零到 error，不显示部分百分比', () => {
    const out = mapDownloaderStatusToSceneState({ status: 'failed', progress: 47 });
    expect(out).toEqual({ progress: 0, status: 'error' });
  });

  it('completed → ready(100)', () => {
    expect(mapDownloaderStatusToSceneState({ status: 'completed', progress: 100 })).toEqual({
      progress: 100,
      status: 'ready',
    });
  });

  it('downloading → downloading，进度钳制在 [0,100]', () => {
    expect(mapDownloaderStatusToSceneState({ status: 'downloading', progress: 42 })).toEqual({
      progress: 42,
      status: 'downloading',
    });
    expect(mapDownloaderStatusToSceneState({ status: 'downloading', progress: -5 })?.progress).toBe(0);
    expect(mapDownloaderStatusToSceneState({ status: 'downloading', progress: 137 })?.progress).toBe(100);
  });

  it('pending / null → null（不强制改变 UI）', () => {
    expect(mapDownloaderStatusToSceneState({ status: 'pending', progress: 0 })).toBeNull();
    expect(mapDownloaderStatusToSceneState(null)).toBeNull();
    expect(mapDownloaderStatusToSceneState(undefined)).toBeNull();
  });

  it('状态转移不变式：任何终态输入都不会产出 downloading', () => {
    const terminals = ['completed', 'failed'] as const;
    for (const s of terminals) {
      const out = mapDownloaderStatusToSceneState({ status: s, progress: 30 });
      expect(out?.status).not.toBe('downloading');
    }
  });
});
