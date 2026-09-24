/**
 * BuiltinAssetBootstrap — 内置场景音频首启落盘服务。
 *
 * 背景 / 目标：
 *   5 个核心场景（见 audioAssets.BUILTIN_SCENES）随 APK 打包在
 *   android/app/src/main/assets/sounds/builtin/，全新安装/清数据后需在【零网络】下即可播放。
 *   主场景播放走 TrackPlayer/ExoPlayer，只认 file:// 路径，不认 android_asset；因此采用
 *   「首启把内置文件从 android_asset 拷入 DocumentDir 下载目录」方案 —— 落盘后完全复用既有
 *   OfflineService(exists+size) 就绪真相、播放 URI 解析、大小校验，改动面最小。
 *
 * 三条硬要求（大哥拍板）：
 *   1. 拷贝幂等：逐文件用 OfflineService.checkSceneAudioReady()（= exists + size≥期望95%）判定；
 *      已就绪则跳过，缺失/残缺/损坏才重拷。全程后台异步，不阻塞首屏交互。
 *   2. 失败回退：单场景拷贝失败（磁盘满/异常）→ 该场景回落普通下载队列（addTaskToQueue），
 *      绝不永久卡死；其余场景照常处理。
 *   3. 唯一判定源：是否内置只认 audioAssets.isBuiltinScene()/BUILTIN_SCENE_IDS。
 *
 * @architecture-constraint
 *   - 文件源在 android_asset，必须用 RNFS.copyFileAssets(assetRelativePath, dest) 读取——本包
 *     (dr.pogodin/react-native-fs)的 copyFile('file:///android_asset/...') 走普通文件系统路径，
 *     读不了 android_asset（实测全量 ENOENT）。assetPath 仅作文档用途，实际传参需剥掉
 *     file:///android_asset/ 前缀得到相对 assets 根的路径。⚠️ 绝不能用 res/raw（那是 react-native-sound
 *     MAIN_BUNDLE 专用，RNFS 读不了）。两套内置音频机制互不混用。
 *   - 拷贝目标路径必须 == getLocalPath(category, filename)，才能被 OfflineService/播放链路直接识别。
 *
 * @note 模拟器「假飞行模式」留痕（2026-09）：Android 模拟器在扩展面板点 Airplane mode 时，NetInfo 常不刷新
 *   isConnected（仍报 wifi/cellular connected），使 NetworkGateService.isOffline() 误判为在线 → 离线冷启动取证失真、
 *   非内置下载被当"可补下"静默排队。验证「离线冷启动 · 内置仍可播」务必：(1) 用 `adb shell svc wifi disable;
 *   adb shell svc data disable`（或 emulator console `airplane mode on`）真实断网，别只点飞行图标；(2) 配合
 *   `pm clear` 清数据后冷启动。内置场景走本服务 bootstrap 拷贝、不依赖网络，离线仍应 Ready —— 这正是该回归的判据。
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import { BUILTIN_SCENES, AUDIO_MANIFEST, getLocalPath } from '../constants/audioAssets';
import OfflineService from './OfflineService';

/** assetPath 前缀 → copyFileAssets 需要相对 assets 根的路径（无前缀、无 file://）。 */
const ASSET_URI_PREFIX = 'file:///android_asset/';
function toAssetRelative(assetPath: string): string {
  return assetPath.startsWith(ASSET_URI_PREFIX) ? assetPath.slice(ASSET_URI_PREFIX.length) : assetPath;
}

/** 从 AUDIO_MANIFEST 反查场景落盘 category（拷贝目标目录需与下载路径一致）。 */
function resolveCategory(sceneId: string): string {
  const hit = AUDIO_MANIFEST.find((a) => a.id === sceneId);
  return hit?.category ?? 'scenes';
}

/**
 * 拷贝单个内置场景到 DocumentDir（幂等 + 失败回退）。
 * @returns true=已就绪（跳过或拷贝成功）；false=拷贝失败并已回落下载队列。
 */
async function ensureOneBuiltin(sceneId: string): Promise<boolean> {
  const cfg = BUILTIN_SCENES[sceneId];
  if (!cfg) return false;

  // 【硬要求1 · 幂等】复用 OfflineService 的 exists+size 真相判定：已就绪直接跳过，不重复 IO。
  try {
    if (await OfflineService.checkSceneAudioReady(sceneId)) {
      console.log(`[Builtin] ✅ ${sceneId} 已就绪，跳过拷贝`);
      return true;
    }
  } catch (_e) { /* 判定异常按未就绪处理，继续尝试拷贝 */ }

  const destPath = getLocalPath(resolveCategory(sceneId), cfg.filename);

  try {
    // 清理可能存在的残缺/损坏文件（含残留 .part），避免 copyFile 目标已存在报错或大小校验歧义。
    if (await RNFS.exists(destPath)) {
      await RNFS.unlink(destPath).catch(() => {});
    }
    await RNFS.mkdir(RNFS.DocumentDirectoryPath + '/audio_resources');
    // 目标可能落在 base/ fx/ interactive/ city_rain/ 等子目录 → 先建父目录，避免 ENOENT。
    const destDir = destPath.slice(0, destPath.lastIndexOf('/'));
    if (destDir && destDir.endsWith('audio_resources') === false) {
      await RNFS.mkdir(destDir).catch(() => {});
    }
    // 【硬要求1 · 后台异步】copyFileAssets 走 AssetManager，能读 android_asset 子目录并自动建目标目录。
    await RNFS.copyFileAssets(toAssetRelative(cfg.assetPath), destPath);

    // 落盘后立刻重判单场景 → 转 Ready 并通知 OfflineService 订阅方（HomeScreen）。
    const ready = await OfflineService.recheckScene(sceneId);
    if (ready) {
      console.log(`[Builtin] ✅ ${sceneId} 拷贝完成并已就绪`);
      return true;
    }
    // 拷完仍判定未就绪（极罕见：源损坏/大小不符）→ 按失败处理，回落下载。
    throw new Error('copied-but-not-ready');
  } catch (err: any) {
    // 【硬要求2 · 失败回退】拷贝失败 → 回落普通下载队列，绝不永久卡死。
    console.warn(`[Builtin] ⚠️ ${sceneId} 内置拷贝失败(${err?.message})，回落下载队列`);
    try {
      const { DownloaderServiceInstance } = require('./DownloaderService');
      DownloaderServiceInstance.addTaskToQueue(sceneId);
    } catch (_e) { /* 下载服务未就绪时忽略；下次冷启/前台恢复会再触发 */ }
    return false;
  }
}

class BuiltinAssetBootstrap {
  private started = false;

  /**
   * 启动内置场景落盘（幂等、非阻塞）。App 挂载即调用；已就绪文件秒过，仅缺失/损坏才拷贝。
   */
  async bootstrap(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const ids = Object.keys(BUILTIN_SCENES);
    console.log(`[Builtin] 🚀 内置场景落盘开始，共 ${ids.length} 个`);
    // allSettled：单场景失败不影响其余（硬要求2「不许永久卡死」）。
    const results = await Promise.allSettled(ids.map((id) => ensureOneBuiltin(id)));
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    console.log(`[Builtin] 🏁 内置场景落盘完成：就绪 ${ok}/${ids.length}`);
  }
}

export default new BuiltinAssetBootstrap();
