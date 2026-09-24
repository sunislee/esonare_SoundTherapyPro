/**
 * downloadWhitelist — 冷启动「自动下载白名单」防回归断言（单一真相源）。
 *
 * 锁死三条不变式（与 BuiltinSceneIntegrity.test.ts 同思路：直接 import 真实数据源，不 mock）：
 *   1. 白名单非空且规模落在规格区间 [6, 8]（大哥拍板「精选 6~8 个」）。
 *   2. 每个 id 必须存在于 SCENES（防拼错 → prioritizeScene 找不到场景静默失效）。
 *   3. 与 BUILTIN_SCENE_IDS 不重复（内置场景由 BuiltinAssetBootstrap 落盘，绝不进下载队列）。
 *   4. 白名单内部无重复项。
 */
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
}));

import { SCENES } from '../scenes';
import { BUILTIN_SCENE_IDS } from '../audioAssets';
import { CURATED_DOWNLOAD_SCENE_IDS, CURATED_DOWNLOAD_SCENE_ID_SET } from '../downloadWhitelist';

describe('冷启动自动下载白名单 (CURATED_DOWNLOAD_SCENE_IDS)', () => {
  const sceneIds = new Set(SCENES.map((s) => s.id));
  const builtin = new Set(BUILTIN_SCENE_IDS);

  it('非空且规模在 [6,8]（精选高频）', () => {
    expect(CURATED_DOWNLOAD_SCENE_IDS.length).toBeGreaterThanOrEqual(6);
    expect(CURATED_DOWNLOAD_SCENE_IDS.length).toBeLessThanOrEqual(8);
  });

  it('每个 id 都必须存在于 SCENES（防拼错静默失效）', () => {
    const missing = CURATED_DOWNLOAD_SCENE_IDS.filter((id) => !sceneIds.has(id));
    expect(missing).toEqual([]);
  });

  it('与 BUILTIN_SCENE_IDS 不重复（内置场景绝不进下载队列）', () => {
    const overlap = CURATED_DOWNLOAD_SCENE_IDS.filter((id) => builtin.has(id));
    expect(overlap).toEqual([]);
  });

  it('白名单内部无重复项', () => {
    expect(new Set(CURATED_DOWNLOAD_SCENE_IDS).size).toBe(CURATED_DOWNLOAD_SCENE_IDS.length);
  });

  it('Set 视图与数组一致（HomeScreen 判定源）', () => {
    for (const id of CURATED_DOWNLOAD_SCENE_IDS) {
      expect(CURATED_DOWNLOAD_SCENE_ID_SET.has(id)).toBe(true);
    }
  });
});
