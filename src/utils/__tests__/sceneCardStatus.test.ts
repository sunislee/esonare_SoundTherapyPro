/**
 * sceneCardStatus 回归测试 —— 锁定产品定稿的两条铁律（纯函数、零 RN/IO 依赖，直接断言）：
 *   1. 【未就绪统一态】音频未就绪时，无论空闲 / 下载中(图片没下完) / 进度多少，一律 'downloading'
 *      → UI 统一「资源正在下载」，不再有 IMG / "Loading Images…" / 「准备中」歧义。
 *   2. 【Ready 以可播为准】音频就绪即 'ready'，即便背景图/缩略图等装饰资源仍未下完
 *      （downloadStatus 仍为 downloading / progress 未满）也不得被挡在 Ready 之外。
 */
import { resolveSceneCardStatus } from '../sceneCardStatus';

describe('resolveSceneCardStatus', () => {
  describe('【A · 不变式② stalled 专属域】内置耗尽 → 本地准备受阻（绝不网络文案）', () => {
    it('内置 + 未就绪 + attemptsExhausted → stalled（C2b 永久静默『资源正在下载』的显式出口）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: true })).toBe('stalled');
    });

    it('内置 + exhausted + 离线 → 仍 stalled，绝不 need_network（f877c429 回归防线）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: true, offline: true })).toBe('stalled');
    });

    it('内置 + exhausted + downloadStatus=error → 仍 stalled，绝不 error（内置与网络下载无关）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: true, downloadStatus: 'error' })).toBe('stalled');
    });

    it('【防线】非内置误传 exhausted → 绝不 stalled（CDN 卡不会被标『本地准备受阻』）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: false, attemptsExhausted: true })).toBe('downloading');
      expect(resolveSceneCardStatus({ audioReady: false, attemptsExhausted: true, offline: true })).toBe('need_network');
      expect(resolveSceneCardStatus({ audioReady: false, attemptsExhausted: true, downloadStatus: 'error' })).toBe('error');
    });

    it('未耗尽(缺省/false)的内置 → 维持静默 downloading（不变式①不受 A 影响）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true })).toBe('downloading');
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: false })).toBe('downloading');
    });

    it('ready 优先级高于 exhausted：磁盘已可播则直接 ready（全组合不变式含新维度）', () => {
      expect(resolveSceneCardStatus({ audioReady: true, isBuiltin: true, attemptsExhausted: true })).toBe('ready');
    });

    it('【两账不一致防线】卡态层对 progress 彻底盲区：stalled 判定只认 attemptsExhausted', () => {
      // store 在 stalled 时保留冻结历史值 progress=90（builtinReadiness :178-183 注释定性），
      // UI 判据必须与它无关——即使调用方把 progress 塞进 input（JS 不拦额外字段），卡态也不许被影响。
      const base = resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: true });
      for (const progress of [0, 45, 90, 100]) {
        expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, attemptsExhausted: true, progress } as any)).toBe(base);
      }
      // 反向锁：冻结的 90 也绝不能把「未耗尽」的内置卡骗成 ready/stalled（唯一判据仍是 audioReady/attemptsExhausted）。
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: true, progress: 90 } as any)).toBe('downloading');
    });
  });

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

  // ════════════════════════════════════════════════════════════════════
  // 【不变式① · 内置场景永不 error / need_network】
  //   内置音频随 APK 打包，落盘只靠本地 bootstrap 拷贝、与网络无关。任何 offline / downloadStatus
  //   （哪怕被误写成 'error'）都不得把未就绪的内置卡翻成「需要网络」或「下载失败」——只能『正在准备』。
  //   这是大哥截图(深海/迷雾森林联网态显示「需要网络·点按重试」)回归的锁死用例：一旦出现立即变红。
  // ════════════════════════════════════════════════════════════════════
  describe('【不变式① · 内置场景永不 error / need_network】', () => {
    const bools2 = [true, false];
    for (const offline of bools2) {
      for (const downloadStatus of ['idle', 'downloading', 'waiting', 'error'] as const) {
        it(`内置 + 未就绪 + offline=${offline} dl=${downloadStatus} → downloading(正在准备)，绝不 error/need_network`, () => {
          const status = resolveSceneCardStatus({ audioReady: false, isBuiltin: true, offline, downloadStatus });
          expect(status).toBe('downloading');
          expect(status === 'error' || status === 'need_network').toBe(false);
        });
      }
    }

    it('内置 + 已就绪 → ready（短路优先级最高）', () => {
      expect(resolveSceneCardStatus({ audioReady: true, isBuiltin: true })).toBe('ready');
    });

    it('非内置才允许 error / need_network（确认未把非内置也误短路）', () => {
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: false, downloadStatus: 'error' })).toBe('error');
      expect(resolveSceneCardStatus({ audioReady: false, isBuiltin: false, offline: true })).toBe('need_network');
    });
  });
});
