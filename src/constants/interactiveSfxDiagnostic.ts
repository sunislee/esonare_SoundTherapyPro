import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 【交互音诊断日志】开关模块。
 *
 * 作用：为"city_rain_urban（城市夜雨）等场景点击交互音效无声、而其它场景正常"的排查，
 * 提供一处可临时开启的分级日志入口。开启后由 handlePress / playAmbient 输出的日志均带
 * [SFX-DIAG]（信息级）或 [SFX-DIAG-ERR]（错误分级）前缀，便于在海量日志中定位"无声"发生在哪一步。
 *
 * 【设计要点】
 * - 默认关闭：污染 release/生产日志；确认根因后可直接删除本文件及两处调用点，无残留逻辑耦合。
 * - 开关持久化到 AsyncStorage（键名 INTERACTIVE_SFX_DIAG_ENABLED），便于在 debugger 控制台
 *   一次性设置后复现，无需改代码重新打包。
 * - 幂等初始化：ensureInteractiveSfxDiagnosis() 首次调用读取一次存储，之后走内存标志位（同步、廉价）。
 * - 仅用于诊断输出，不改动任何播放/下载逻辑。
 */

export const INTERACTIVE_SFX_DIAGNOSTIC_KEY = 'INTERACTIVE_SFX_DIAG_ENABLED';

let diagnosticEnabled = false;
let initialized = false;

/** 首次访问时从 AsyncStorage 读取开关状态（幂等，只读一次）。开启后后续判断直接读内存标志位。 */
export async function ensureInteractiveSfxDiagnosis(): Promise<boolean> {
  if (initialized) return diagnosticEnabled;
  initialized = true;
  try {
    const raw = await AsyncStorage.getItem(INTERACTIVE_SFX_DIAGNOSTIC_KEY);
    diagnosticEnabled = raw === '1' || raw === 'true';
  } catch {
    // 读取失败保持默认关闭，绝不因此影响播放逻辑
  }
  return diagnosticEnabled;
}

/** 手动开关（供调试面板 / App 启动入口调用；也便于在 debugger 控制台临时开启）。 */
export function setInteractiveSfxDiagnosis(on: boolean): void {
  initialized = true;
  diagnosticEnabled = on;
  AsyncStorage.setItem(INTERACTIVE_SFX_DIAGNOSTIC_KEY, on ? '1' : '0').catch(() => {});
}

/** 同步读取当前开关状态（供 UI / 控制台查询；尚未初始化时返回默认关闭。 */
export function isInteractiveSfxDiagnosisEnabled(): boolean {
  return diagnosticEnabled;
}
