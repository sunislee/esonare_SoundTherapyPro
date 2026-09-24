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

  // ════════════════════════════════════════════════════════════════════
  // 【一致性不变式】任何状态组合下，「卡片显示 Ready」严格等价于「磁盘可播(audioReady)」。
  //   imageReady / isBuiltin 是装饰与来源维度，绝不允许翻转该结论 —— 一旦出现"显示下载中却能播"
  //   或"显示 Ready 却不能播"的双轨背离，本组用例立即变红。
  // ════════════════════════════════════════════════════════════════════
  describe('【一致性不变式 · 可播判定 === 卡片Ready判定】', () => {
    const bools = [true, false];

    // 维度一：音频就绪 × 图片就绪 × 内置/非内置（离线/失败均默认未触发）
    for (const audioReady of bools) {
      for (const imageReady of bools) {
        for (const isBuiltin of bools) {
          it(`audio=${audioReady} image=${imageReady} builtin=${isBuiltin} → (status==='ready') ⟺ 可播`, () => {
            const status = resolveSceneCardStatus({ audioReady, imageReady, isBuiltin });
            expect(status === 'ready').toBe(audioReady);
          });
        }
      }
    }

    // 维度二：叠加离线 / 终态失败，仍不得越过可播真相；未就绪时也不得误判 ready。
    for (const audioReady of bools) {
      for (const offline of bools) {
        for (const downloadStatus of ['idle', 'downloading', 'waiting', 'error'] as const) {
          it(`audio=${audioReady} offline=${offline} dl=${downloadStatus} → (status==='ready') ⟺ 可播`, () => {
            const status = resolveSceneCardStatus({ audioReady, offline, downloadStatus });
            expect(status === 'ready').toBe(audioReady);
          });
        }
      }
    }

    it('全维度笛卡尔积：就绪判定恒等于 audioReady（图片/内置/离线/失败皆不得翻转）', () => {
      for (const audioReady of bools)
        for (const imageReady of bools)
          for (const isBuiltin of bools)
            for (const offline of bools)
              for (const downloadStatus of ['idle', 'downloading', 'waiting', 'error'] as const) {
                const status = resolveSceneCardStatus({ audioReady, imageReady, isBuiltin, offline, downloadStatus });
                expect(status === 'ready').toBe(audioReady);
              }
    });
  });
});
