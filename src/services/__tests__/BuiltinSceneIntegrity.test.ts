/**
 * BuiltinSceneIntegrity — 内置场景名单「静默失效」防回归断言。
 *
 * 背景（2026-09 审计）：BUILTIN_SCENES 曾出现 id 拼错(life_rain_urban，真实为 city_rain_urban)、
 * filename 缺子目录前缀、甚至素材指向另一个音频(deep_ocean_abyss ≠ deep_sea_breathing_rhythm)等问题，
 * 导致内置短路整体空转——场景既没走拷贝也没被判就绪，白白回落下载却无人察觉。
 *
 * 本测试直接 import 真实数据源（不 mock BUILTIN_SCENES/AUDIO_MANIFEST/SCENES），逐条锁死四条不变式：
 *   1. 每个 BUILTIN_SCENE_ID 必须存在于 SCENES（防 id 拼错）。
 *   2. 每个内置 filename 必须逐字节等于该场景在 AUDIO_MANIFEST 的 filename（含子目录前缀）——
 *      这是 bootstrap 落盘目标 == OfflineService 判定路径的前提。
 *   3. expectedSize 必须等于 AUDIO_MANIFEST.size（就绪容差判定依赖）。
 *   4. assetPath 相对 android_asset/sounds/builtin/ 的路径必须镜像 filename（源文件真实存在、可被 bootstrap 读到）。
 */
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/test/files',
}));

import { BUILTIN_SCENES, BUILTIN_SCENE_IDS, AUDIO_MANIFEST } from '../../constants/audioAssets';
import { SCENES } from '../../constants/scenes';

const ASSET_ROOT = 'file:///android_asset/sounds/builtin/';

describe('内置场景名单完整性 (BUILTIN_SCENES ↔ SCENES ↔ AUDIO_MANIFEST)', () => {
  const sceneIds = new Set(SCENES.map((s) => s.id));

  it('内置名单非空', () => {
    expect(BUILTIN_SCENE_IDS.length).toBeGreaterThan(0);
  });

  it('每个 BUILTIN_SCENE_ID 都必须存在于 SCENES（防 id 拼错静默失效）', () => {
    const missing = BUILTIN_SCENE_IDS.filter((id) => !sceneIds.has(id));
    expect(missing).toEqual([]);
  });

  it('每个内置 filename 必须逐字节等于 AUDIO_MANIFEST 对应场景的 filename（含子目录前缀）', () => {
    for (const id of BUILTIN_SCENE_IDS) {
      const manifest = AUDIO_MANIFEST.find((a) => a.id === id);
      expect(manifest).toBeTruthy(); // AUDIO_MANIFEST 必须登记该内置场景
      expect(BUILTIN_SCENES[id].filename).toBe(manifest!.filename);
    }
  });

  it('每个 expectedSize 必须等于 AUDIO_MANIFEST.size', () => {
    for (const id of BUILTIN_SCENE_IDS) {
      const manifest = AUDIO_MANIFEST.find((a) => a.id === id)!;
      expect(BUILTIN_SCENES[id].expectedSize).toBe(manifest.size);
    }
  });

  it('assetPath 相对路径必须镜像 filename（内置素材源真实存在）', () => {
    for (const id of BUILTIN_SCENE_IDS) {
      const cfg = BUILTIN_SCENES[id];
      expect(cfg.assetPath.startsWith(ASSET_ROOT)).toBe(true);
      const rel = cfg.assetPath.slice(ASSET_ROOT.length);
      expect(rel).toBe(cfg.filename);
    }
  });
});
