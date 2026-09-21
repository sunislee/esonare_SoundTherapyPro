/**
 * 回归测试：降噪实验室 8 轨资源清单完整性
 *
 * 背景：66edb405 误将 balanced_noise 的 8 条 track 条目（balanced_noise_track_1..8.mp3）
 * 替换为单文件 8track_balanced_m4a，但 NoiseResourceChecker（检查 8 轨存在性）与
 * 8TrackAudioService（按 {folder}_track_N.mp3 加载 8 轨）仍按 8 轨工作。
 *
 * 后果：downloadTargetFilesAsync 用「本地路径反查 AUDIO_MANIFEST 拿远端 URL」，
 * balanced 组 8 个文件查不到 manifest 条目 → MANIFEST_NOT_FOUND → 永远下不下来
 * → checkAllNoiseResourcesReady 的 4 组 AND 判定失败 → NoiseLab 卡"资源准备中"。
 *
 * 本测试精确复现该查找逻辑，确保 4 组 × 8 轨共 32 个文件在 AUDIO_MANIFEST 中均可被反查到。
 * 修复前：balanced 组 8 条断言失败；修复后：全部通过。
 */

// audioAssets.ts 模块加载时读取 RNFS.DocumentDirectoryPath 计算本地资源根路径，
// 测试环境提供该常量即可（路径只需自洽，具体值不影响「检查路径 == manifest 落盘路径」的等值判断）。
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/data/com.anonymous.soundtherapyapp/files',
}));

const { AUDIO_MANIFEST, ASSET_LIST, getLocalPath } = require('../src/constants/audioAssets');

// 与 HomeScreen.NOISE_LAB_AUDIO_GROUPS 保持一致的 4 个降噪音频组
const NOISE_LAB_AUDIO_GROUPS = ['wind_noise', 'balanced_noise', 'crowd_noise', 'traffic_noise'];

/**
 * 精确复现 downloadTargetFilesAsync 的 manifest 反查逻辑：
 *   AUDIO_MANIFEST.find(item => getLocalPath(item.category, item.filename) === localPath)
 * 以及 NoiseResourceChecker.getNoiseResourceFiles 的本地路径构造：
 *   getLocalPath('noise_reduction', `noise reduction/${group}_track_${n}.mp3`)
 */
const findManifestEntryForNoiseTrack = (group, trackNum) => {
  const filename = `${group}_track_${trackNum}.mp3`;
  const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
  return AUDIO_MANIFEST.find(item => getLocalPath(item.category, item.filename) === localPath);
};

describe('降噪实验室 8 轨资源清单完整性（Q8 回归防护）', () => {
  test.each(NOISE_LAB_AUDIO_GROUPS)('%s 组 8 轨文件均可在 AUDIO_MANIFEST 反查到', (group) => {
    for (let trackNum = 1; trackNum <= 8; trackNum++) {
      const entry = findManifestEntryForNoiseTrack(group, trackNum);
      expect({
        group,
        trackNum,
        entry: entry ? entry.id : 'MANIFEST_NOT_FOUND',
      }).toMatchObject({ entry: expect.any(String) });
      if (!entry) {
        // 失败时给出清晰定位（对应下载器抛出的 MANIFEST_NOT_FOUND）
        throw new Error(`MANIFEST_NOT_FOUND: ${group}_track_${trackNum}.mp3`);
      }
      expect(entry.filename).toBe(`noise reduction/${group}_track_${trackNum}.mp3`);
      expect(entry.category).toBe('noise_reduction');
    }
  });

  test('balanced 组 8 轨条目齐全（66edb405 回归点）', () => {
    const balancedIds = AUDIO_MANIFEST
      .filter(item => item.filename && item.filename.startsWith('noise reduction/balanced_noise_track_'))
      .map(item => item.id)
      .sort();
    expect(balancedIds).toEqual([
      '8track_balanced_1',
      '8track_balanced_2',
      '8track_balanced_3',
      '8track_balanced_4',
      '8track_balanced_5',
      '8track_balanced_6',
      '8track_balanced_7',
      '8track_balanced_8',
    ]);
  });

  test('不应残留单文件 8track_balanced_m4a 条目（与 8 轨系统冲突）', () => {
    const hasM4a = AUDIO_MANIFEST.some(item => item.id === '8track_balanced_m4a');
    expect(hasM4a).toBe(false);
  });

  test('ASSET_LIST 与 AUDIO_MANIFEST 的 balanced 8 轨条目数量一致', () => {
    const manifestCount = AUDIO_MANIFEST.filter(item =>
      item.filename && item.filename.startsWith('noise reduction/balanced_noise_track_')).length;
    const assetCount = ASSET_LIST.filter(item =>
      /^8track_balanced_[1-8]$/.test(item.id)).length;
    expect(manifestCount).toBe(8);
    expect(assetCount).toBe(8);
  });
});
