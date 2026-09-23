/**
 * LayaRecommendationService —— 本机 Flask 推荐服务（laya_service.py）的请求封装。
 *
 * 完全离线：只访问本机地址，绝无任何云端依赖。Flask 未启动 / 网络异常 / 超时 /
 * 非 200 / JSON 解析失败都会归一化为可判别的错误类型，供上层决定 UI 提示。
 */
import { Platform } from 'react-native';

// ============================================================ Base URL（集中配置，最易翻车点）
/**
 * 真机访问本机：把 LAN_HOST 改成运行 Flask 的这台 Mac 在局域网里的 IPv4（同一 Wi-Fi）。
 *   macOS 查看：系统设置 → Wi-Fi → 详细信息 → TCP/IP 的「IPv4 地址」，或终端 `ipconfig getifaddr en0`。
 * Android 模拟器无需改这里：它用固定别名 10.0.2.2 指向宿主机回环。
 */
let LAN_HOST = '192.168.1.100';

/**
 * Flask 端口。laya_service.py 默认 5000；
 * ⚠️ macOS Monterey+ 的 AirPlay Receiver 会占用 5000，若无法禁用请同时：
 *   - 启动服务时 `LAYA_PORT=5057 python3 laya_service.py`
 *   - 把下面的 PORT 改成同一个值。
 */
let PORT = 5000;

/** Android 模拟器判定（宿主机回环别名 10.0.2.2）。 */
const isAndroidEmulator =
  Platform.OS === 'android' &&
  (Platform.constants as unknown as { isEmulator?: boolean })?.isEmulator === true;

/** 计算当前环境应使用的 Base URL。 */
export function getLayaBaseUrl(): string {
  if (isAndroidEmulator) return `http://10.0.2.2:${PORT}`;
  // iOS 模拟器与宿主机共享网络，用 localhost 即可；iOS/Android 真机走局域网 IP。
  const host = Platform.OS === 'ios' ? 'localhost' : LAN_HOST;
  return `http://${host}:${PORT}`;
}

/** 运行时覆盖（便于真机联调时热改，不必动源码）。 */
export function setLayaBaseUrl(opts: { lanHost?: string; port?: number }): void {
  if (opts.lanHost) LAN_HOST = opts.lanHost;
  if (typeof opts.port === 'number') PORT = opts.port;
}

// ============================================================ 错误类型与返回结构
export type LayaErrorKind =
  | 'flask_down'        // 连不上（Flask 未启动 / 端口不通）
  | 'timeout'           // 超过 10s
  | 'network'           // 其它网络异常
  | 'http'              // 非 2xx
  | 'model_unavailable' // 服务在但模型没加载好（503）
  | 'parse';            // JSON 解析失败

export interface HealthResult {
  ok: boolean;
  modelLoaded?: boolean;
  error?: LayaErrorKind;
}

export interface RecommendationInput {
  mood: string;
  sleepQuality?: string;
  lastPlayedScene?: string | null;
  todayListeningDuration?: number;
}

export interface RecommendationResult {
  sceneId: string;
  logicalKey?: string;
  confidence: number; // 0-1
  allScores: Record<string, number>;
  reason?: string;
}

export type RecommendationResponse =
  | { ok: true; data: RecommendationResult }
  | { ok: false; kind: LayaErrorKind; status?: number; message: string };

const REQUEST_TIMEOUT_MS = 10000;

/** 带超时的 fetch；超时通过 AbortController 主动中断。 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health —— App 启动时探测 Flask 是否在线、模型是否就绪。 */
export async function checkHealth(): Promise<HealthResult> {
  try {
    const res = await fetchWithTimeout(`${getLayaBaseUrl()}/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, error: 'http' };
    const j = await res.json();
    return { ok: true, modelLoaded: !!j?.model_loaded };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/abort/i.test(msg)) return { ok: false, error: 'timeout' };
    return { ok: false, error: 'flask_down' };
  }
}

/** POST /recommend —— 拉取一次推荐；失败归一化为 RecommendationResponse.error。 */
export async function getRecommendation(
  input: RecommendationInput,
): Promise<RecommendationResponse> {
  const body = {
    state: {
      mood: input.mood,
      sleep_quality: input.sleepQuality ?? '',
      last_played_scene: input.lastPlayedScene ?? '',
      today_listening_duration: input.todayListeningDuration ?? 0,
    },
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${getLayaBaseUrl()}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/abort/i.test(msg)) return { ok: false, kind: 'timeout', message: '请求超时（>10s）' };
    return { ok: false, kind: 'flask_down', message: '无法连接到推荐服务' };
  }

  if (res.status === 503) return { ok: false, kind: 'model_unavailable', status: 503, message: '模型尚未就绪' };
  if (!res.ok) return { ok: false, kind: 'http', status: res.status, message: `服务返回 ${res.status}` };

  let j: any;
  try {
    j = await res.json();
  } catch {
    return { ok: false, kind: 'parse', message: '响应解析失败' };
  }

  if (!j?.success || typeof j.recommendation !== 'string') {
    return { ok: false, kind: 'http', status: res.status, message: j?.error ?? '推荐结果为空' };
  }

  return {
    ok: true,
    data: {
      sceneId: j.recommendation,
      logicalKey: j.logical_key,
      confidence: typeof j.confidence === 'number' ? j.confidence : 0,
      allScores: j.all_scores ?? {},
      reason: j.reason,
    },
  };
}

export const LayaRecommendationService = { checkHealth, getRecommendation, getLayaBaseUrl, setLayaBaseUrl };
export default LayaRecommendationService;
