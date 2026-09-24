// @fileoverview 首页场景卡片「显示状态」的纯映射（零 RN / IO 依赖，可单测）。
//
// 产品决策（2026-09，撤销白名单方案后定稿）：
//   - 【Ready 以可播为准】音频落盘就绪(audioReady)即 Ready to Play ✨。背景图/缩略图等装饰性资源
//     未下完【绝不】阻塞状态——能否播放是唯一标准（内置场景即使图片缺失也应显示 Ready）。
//   - 【未就绪统一态】所有未就绪卡片（音频没下完、图片没下完、空闲排队）一律落到 'downloading'，
//     UI 统一显示安静的「资源正在下载」+ ↓ 图标。不再有 IMG 转圈 / "Loading Images…" / 「准备中」歧义。
//   - 【诚实兜底】仅在离线 / 下载终态失败时给出明确可操作文案（需要网络 · 点按重试）。
//
// 本模块把上述规则抽成单一真相纯函数，便于脱离 RN 直接 Jest 覆盖「未就绪→统一文案」「音频 ready 即 Ready」。

export type SceneCardStatus = 'ready' | 'need_network' | 'error' | 'downloading';

export interface SceneCardStatusInput {
  /**
   * 【唯一可播真相】= OfflineService.readyIds.has(id)（磁盘 exists + size≥期望95%）。
   * 卡片状态、点击门控、播放入口三处一律以此为准；任何其它信号都不得越过它独立判 ready。
   */
  audioReady: boolean;
  /**
   * 背景图/缩略图等装饰资源是否就绪。仅为「不变式可被测试遍历」而显式建模，
   * 【绝不参与 ready 判定】——装饰资源永远不配挡状态（内置场景图缺失也应 Ready）。
   */
  imageReady?: boolean;
  /**
   * 是否内置场景。同样仅为不变式表达而建模，【绝不参与 ready 判定】：
   * 内置与否只决定「离线能否补回」，不改变「此刻磁盘有没有可播文件」这一事实。
   */
  isBuiltin?: boolean;
  /** 当前是否离线（NetworkGateService.isOffline()）。 */
  offline?: boolean;
  /** 下载器映射后的场景状态（'error' 表示终态失败），仅用于未就绪时的副文案细分。 */
  downloadStatus?: string;
}

/**
 * 决定卡片显示状态。优先级：音频就绪 > 离线 > 失败 > 统一未就绪。
 * - audioReady=true → 'ready'：无视图片/装饰资源、内置与否（req3 + 不变式）。
 * - 否则离线 → 'need_network'；终态失败 → 'error'；其余一律 'downloading'（req2 统一文案）。
 *
 * 【一致性不变式】卡片是否显示 Ready 严格等价于 audioReady(可播真相)：
 *   resolveSceneCardStatus(x).status === 'ready'  ⟺  x.audioReady === true
 * imageReady / isBuiltin 任何取值都不得翻转该结论（由 sceneCardStatus.test.ts 全组合锁死）。
 */
export function resolveSceneCardStatus(input: SceneCardStatusInput): SceneCardStatus {
  if (input.audioReady) return 'ready';
  if (input.offline) return 'need_network';
  if (input.downloadStatus === 'error') return 'error';
  return 'downloading';
}
