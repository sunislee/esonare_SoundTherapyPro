/**
 * sceneCardStatus 回归测试 —— 锁定产品定稿的两条铁律（纯函数、零 RN/IO 依赖，直接断言）：
 *   1. 【未就绪统一态】音频未就绪时，无论空闲 / 下载中(图片没下完) / 进度多少，一律 'downloading'
 *      → UI 统一「资源正在下载」，不再有 IMG / "Loading Images…" / 「准备中」歧义。
 *   2. 【Ready 以可播为准】音频就绪即 'ready'，即便背景图/缩略图等装饰资源仍未下完
 *      （downloadStatus 仍为 downloading / progress 未满）也不得被挡在 Ready 之外。
 */
import { resolveSceneCardStatus } from '../sceneCardStatus';

describe('resolveSceneCardStatus', () => {
  describe('【音频 ready 即 Ready · 图片缺失不影响】', () => {
    it('音频就绪 + 无任何下载进度 → ready', () => {
      expect(resolveSceneCardStatus({ audioReady: true })).toBe('ready');
    });

    it('音频就绪但背景图仍在下载(downloadStatus=downloading) → 仍 ready，不被装饰资源挡状态', () => {
      expect(
        resolveSceneCardStatus({ audioReady: true, downloadStatus: 'downloading' }),
      ).toBe('ready');
    });

    it('音频就绪 + 离线 → 仍 ready（内置场景离线也应 Ready）', () => {
      expect(resolveSceneCardStatus({ audioReady: true, offline: true })).toBe('ready');
    });

    it('音频就绪优先级最高：即便 downloadStatus=error 也判 ready（磁盘已可播）', () => {
      expect(
        resolveSceneCardStatus({ audioReady: true, downloadStatus: 'error' }),
      ).toBe('ready');
    });
  });

  describe('【未就绪统一态 · 一律 downloading】', () => {
    it('空闲(idle) → downloading（统一「资源正在下载」）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, downloadStatus: 'idle' })).toBe('downloading');
    });

    it('音频下载中(downloading) → downloading', () => {
      expect(resolveSceneCardStatus({ audioReady: false, downloadStatus: 'downloading' })).toBe('downloading');
    });

    it('等待中(waiting) → downloading（不再显示「准备中」歧义）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, downloadStatus: 'waiting' })).toBe('downloading');
    });

    it('未就绪 + 在线 → downloading（统一态，无 IMG 转圈）', () => {
      expect(resolveSceneCardStatus({ audioReady: false })).toBe('downloading');
    });
  });

  describe('【诚实兜底】', () => {
    it('未就绪 + 离线 → need_network（需要网络 · 点按重试）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, offline: true })).toBe('need_network');
    });

    it('未就绪 + 终态失败(error) → error（需要网络 · 点按重试）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, downloadStatus: 'error' })).toBe('error');
    });

    it('离线优先级高于 error（先提示离线）', () => {
      expect(
        resolveSceneCardStatus({ audioReady: false, offline: true, downloadStatus: 'error' }),
      ).toBe('need_network');
    });
  });
});
