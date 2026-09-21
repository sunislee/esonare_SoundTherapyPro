/**
 * NetworkGateService — 移动数据下载闸门（PR-2：WiFi 提示）
 *
 * @architecture-constraint
 * 1. 本模块是项目网络状态检测的唯一入口：UI 与 DownloaderService 不得直接 import NetInfo，
 *    一律通过 requestDownloadAccess() 与下方两个事件协作。
 * 2. 为避免与 DownloaderService 循环依赖，本模块永不 import 任何下载相关模块——
 *    只发 DeviceEventEmitter 事件；DownloaderService 自行订阅 WIFI_PROMPT_RESOLVED 恢复队列。
 * 3. "允许移动数据"的选择仅存内存（不持久化），每次 App 启动重置——TODO 未要求记住，默认不记。
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { DeviceEventEmitter } from 'react-native';

/** UI 事件：检测到移动数据且用户未允许 → 弹出提示 */
export const WIFI_PROMPT_REQUESTED = 'wifiPromptRequested';
/** 恢复事件：闸门放行（切到 WiFi / 用户允许）→ UI 关闭 + DownloaderService 恢复队列 */
export const WIFI_PROMPT_RESOLVED = 'wifiPromptResolved';

type GateResult = 'granted' | 'waiting';

class NetworkGateService {
  private initialized = false;
  /** 仅内存：不持久化，每次 App 启动重置（默认不记住选择） */
  private cellularAllowed = false;
  /** 本会话已弹过提示且用户已做选择 → 不再重复弹窗（避免反复打断） */
  private promptDismissed = false;
  /** 当前是否有被闸门挂起的下载任务 */
  private hasPending = false;
  /** 【回归修复】最近一次已知连接状态缓存（仅供日志/闸门辅助，不再作为 isOffline 依据）。 */
  private lastConnected: boolean | null = null;
  /** 【回归修复】最近一次已知网络类型：isOffline() 的唯一依据（type==='none' 才是真离线）。
   *  null = 尚未取得任何状态（保守视为未知 → isOffline() 返回 false，避免首帧误伤静默下载）。 */
  private lastType: NetInfoState['type'] | null = null;

  /** App 初始化时调用一次：取初始网络状态 + 监听变化 */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // 【回归修复】禁用 NetInfo 默认互联网可达性探测（google generate_204）——该探测点在国内网络必挂，
    // 会把 type=wifi 的真实在线误判为 isConnected=false，进而被 isOffline() 误伤、掐断静默下载。
    // 关闭后 isConnected 回落为系统层连接状态；离线判定改由下方 lastType(type) 承担，不再依赖可达性探测。
    try {
      NetInfo.configure({ reachabilityShouldRun: () => false });
    } catch (e) {
      console.warn('[NetworkGate] NetInfo.configure 失败:', e);
    }

    NetInfo.fetch()
      .then((state) => {
        this.lastConnected = state.isConnected === true;
        this.lastType = state.type;
        console.log(`[NetworkGate] 初始网络: type=${state.type} connected=${state.isConnected}`);
      })
      .catch((e) => console.warn('[NetworkGate] NetInfo.fetch 失败:', e));

    NetInfo.addEventListener((state) => {
      this.lastConnected = state.isConnected === true;
      this.lastType = state.type;
      console.log(`[NetworkGate] 网络变化: type=${state.type} connected=${state.isConnected}`);
      // 切到 WiFi/以太网且有挂起任务 → 自动恢复下载
      if (this.isWlan(state) && this.hasPending) {
        this.resumeAll('wifi');
      }
    });
  }

  /**
   * 【回归修复】同步判定当前是否"无任何网络连接"。
   * 语义 = type === 'none'（真离线，如飞行模式），不再依赖互联网可达性探测(isConnected)。
   * - type='none'                                → true（离线）
   * - wifi / cellular / bluetooth / vpn / ethernet → false（有链路即可下载；蜂窝另由 requestDownloadAccess 提示闸门管控）
   * - unknown / null(尚未就绪)                    → false（保守：不武断判离线，避免首帧或探测异常误伤静默下载）
   */
  isOffline(): boolean {
    return this.lastType === 'none';
  }

  /** wifi / ethernet 视为不消耗移动数据的"安全网络" */
  private isWlan(state: NetInfoState): boolean {
    return (
      state.isConnected === true &&
      (state.type === 'wifi' || state.type === 'ethernet')
    );
  }

  /**
   * 下载启动前请求放行。
   * @returns 'granted' 可下载；'waiting' 移动数据未允许——调用方应保留任务在队列中直接返回，
   *          待 WIFI_PROMPT_RESOLVED 触发后会重新调 startDownload()（内部防重入保证安全）
   */
  async requestDownloadAccess(): Promise<GateResult> {
    if (this.cellularAllowed) return 'granted';

    let state: NetInfoState;
    try {
      state = await NetInfo.fetch();
    } catch (e) {
      // 检测失败时 fail-open：不因提示功能破坏下载链路
      console.warn('[NetworkGate] NetInfo.fetch 失败，放行:', e);
      return 'granted';
    }

    if (this.isWlan(state)) return 'granted';

    // ⚠️ type=unknown：无法识别网络类型时 fail-open（若 Android 缺 ACCESS_NETWORK_STATE 权限会报 unknown，
    // 此时若拦截会导致 WiFi 下也无法下载）。netinfo 库 manifest 已声明该权限，正常构建不受影响。
    if (state.type === 'unknown') {
      console.warn('[NetworkGate] ⚠️ 网络类型 unknown（ACCESS_NETWORK_STATE 权限缺失?），放行');
      return 'granted';
    }

    // 移动数据且未允许 → 挂起
    this.hasPending = true;
    if (!this.promptDismissed) {
      DeviceEventEmitter.emit(WIFI_PROMPT_REQUESTED);
    }
    console.log('[NetworkGate] ⏸️ 移动数据且未允许，挂起下载任务');
    return 'waiting';
  }

  /** 用户点"继续用流量"：本会话放行 */
  allowCellular() {
    console.log('[NetworkGate] ✅ 用户允许移动数据下载（仅本会话）');
    this.cellularAllowed = true;
    if (this.hasPending) this.resumeAll('allowed');
  }

  /** 用户点"等待 WiFi"：本会话不再弹窗，任务等 WiFi 到达 */
  dismissPrompt() {
    this.promptDismissed = true;
  }

  private resumeAll(reason: 'wifi' | 'allowed') {
    this.hasPending = false;
    console.log(`[NetworkGate] 📶 闸门放行 (reason=${reason})，发出恢复事件`);
    DeviceEventEmitter.emit(WIFI_PROMPT_RESOLVED, { reason });
  }
}

export default new NetworkGateService();
