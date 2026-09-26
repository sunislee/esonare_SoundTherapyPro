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
// 【D-C7-1 接线 · 2026-09-26】冷启动 bootstrap 单轮失败后必须自动进入 A/C 编排调度。
//   缺陷实证（报告 §⑪ D-C7-1）：ENOSPC 冷启动后旧实现只打「等待下次重试」日志，快阶段/
//   stalled/慢阶段自愈全部不可达——编排器仅接在 HomeScreen.prioritizeScene 点按路径。
//   deps 全为服务层单例（OfflineService 磁盘真相 / reensure 幂等重拷 / tickScene 全局 store），
//   无 React 依赖；与点按路径共享 builtinReadiness registry，点击重试的 abort+重入语义不变。
import { ensureBuiltinReadyWithRetry, DEFAULT_BUILTIN_RETRY_SCHEDULE } from '../utils/builtinReadiness';
import { tickScene } from '../utils/SceneDownloadStore';

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

    // 【回归修复 · 深海/迷雾森林首拷失败】copyFileAssets 对子目录目标的建目录并非总是可靠，且并发拷贝
    //   同一目录(base/)时 mkdir/copy 存在竞态 → ENOENT。改为「显式建父目录 + 原地重试」：每次失败都重建
    //   目标目录再试，最多 3 次。内置文件在 APK 内、重拷必成，无需网络。
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (destDir && !destDir.endsWith('audio_resources')) {
          await RNFS.mkdir(destDir).catch(() => {});
        }
        await RNFS.copyFileAssets(toAssetRelative(cfg.assetPath), destPath);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[Builtin] ⚠️ ${sceneId} 第 ${attempt} 次拷贝失败(${(e as any)?.message})，重建目录后重试`);
        await RNFS.unlink(destPath).catch(() => {});
        if (destDir) await RNFS.mkdir(destDir).catch(() => {});
      }
    }
    if (lastErr) throw lastErr;

    // 落盘后立刻重判单场景 → 转 Ready 并通知 OfflineService 订阅方（HomeScreen）。
    const ready = await OfflineService.recheckScene(sceneId);
    if (ready) {
      console.log(`[Builtin] ✅ ${sceneId} 拷贝完成并已就绪`);
      return true;
    }
    // 拷完仍判定未就绪（极罕见：源损坏/大小不符）→ 按失败处理。
    throw new Error('copied-but-not-ready');
  } catch (err: any) {
    // 【不变式 · 内置绝不进下载队列 / 绝不 error】内置音频随包而来，缺失只是本地拷贝待重试，
    //   与网络无关 —— 绝不能回落 CDN（联网慢源失败会把内置卡误标「需要网络/下载失败」并因不跳变而永不自愈）。
    //   UI 层由 resolveSceneCardStatus 的 isBuiltin 短路显示『正在准备』；下次冷启 / 前台恢复会再触发 bootstrap。
    console.error(`[Builtin] ❌ ${sceneId} 内置拷贝失败(${err?.message})，保持「正在准备」等待下次重试(不回落CDN)`);
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
    // 【回归修复 · 串行】逐个 await，而非 Promise.allSettled 并发 —— 深海/迷雾森林同处 base/ 目录，
    //   并发 mkdir + copyFileAssets 存在竞态导致其一 ENOENT 首拷失败、回落 CDN 后被误标 error。
    //   单场景内部已自带重试且不抛（catch 内消化），串行保证目录建立与拷贝互不抢占。
    let ok = 0;
    const failedIds: string[] = [];
    for (const id of ids) {
      try {
        if (await ensureOneBuiltin(id)) ok += 1;
        else failedIds.push(id);
      } catch (_e) { /* ensureOneBuiltin 已消化异常，这里再兜一层，绝不影响其余场景 */ failedIds.push(id); }
    }
    console.log(`[Builtin] 🏁 内置场景落盘完成：就绪 ${ok}/${ids.length}`);

    // 【D-C7-1 · 编排式收尾】未就绪场景逐个接入 A/C 编排器（快阶段 3 轮 → attemptsExhausted=stalled
    //   → 指数退避慢阶段无限自愈；每轮 copyOnce 即磁盘空间恢复探测）。fire-and-forget：
    //   不阻塞 bootstrap 返回；orchestrator 内部消化全部失败，catch 仅兜极端异常（如动态依赖故障）。
    if (failedIds.length > 0) {
      console.log(`[Builtin] 🔁 ${failedIds.length} 个未就绪 → 自动进入编排式重试(快阶段→stalled→慢阶段自愈)`);
      for (const id of failedIds) this.startOrchestratedRetry(id);
    }
  }

  /**
   * 【D-C7-1】对单个未就绪内置场景启动 A/C 编排调度（冷启动 bootstrap 收尾专用）。
   * 与 HomeScreen.runBuiltinEnsure 同一编排器/同一 registry：用户点按「点按重试」时
   * prioritizeScene 会 abortBuiltinRetry + 快阶段重入，二者语义天然兼容、无重复调度。
   */
  startOrchestratedRetry(sceneId: string): void {
    ensureBuiltinReadyWithRetry(
      sceneId,
      {
        isDiskReady: (id) => OfflineService.recheckScene(id), // 磁盘唯一真相（内部 setReady 通知 UI）
        copyOnce: (id) => this.reensure(id),                  // 幂等重拷，返回值由编排器消费
        tick: (id, st) => tickScene(id, st),                  // 全局 store → SceneItem 卡片实时刷新
      },
      { pollMs: 2_000, capMs: 180_000, maxCopyAttempts: 3 },   // 与 HomeScreen 点按路径同参
      DEFAULT_BUILTIN_RETRY_SCHEDULE,
      (level, msg) => console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[Builtin] ${msg}`),
    ).catch((e) => {
      // 编排器设计上不抛（失败=慢阶段继续）；走到这里属极端异常，静默兜底、下轮冷启兜底。
      console.warn(`[Builtin] 编排式重试异常 ${sceneId}`, e);
    });
  }

  /**
   * 【供 UI 点击未就绪内置卡时安全重拷】幂等重判 + 缺失才拷；绝不进下载队列、绝不写 error。
   * @returns true=已就绪；false=仍未就绪（保持『正在准备』，下次冷启再试）。
   */
  async reensure(sceneId: string): Promise<boolean> {
    if (!(sceneId in BUILTIN_SCENES)) return false;
    try {
      return await ensureOneBuiltin(sceneId);
    } catch (_e) {
      return false;
    }
  }
}

export default new BuiltinAssetBootstrap();
