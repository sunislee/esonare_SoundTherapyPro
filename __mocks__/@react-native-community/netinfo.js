/* eslint-env jest */
/**
 * Jest 手动 mock — @react-native-community/netinfo
 *
 * 位置说明（勿改动目录）：被 mock 的是 node_modules 包，Jest 规定其手动 mock
 * 必须放在与 node_modules 同级的项目根 `__mocks__/@scope/package.js`，
 * 放进 src/__mocks__ 不会被解析到。
 *
 * 存在原因：DownloaderService.ts:30 引入 NetworkGateService → 连带 require netinfo
 * 原生模块；单测环境无原生实现，会在 import 阶段直接抛
 * `NativeModule.RNCNetInfo is null`（P1-5 续传测试 8/8 全红的根因）。
 *
 * 默认状态为 WiFi + 已连接，等价于「闸门放行」，
 * 因此不影响既有下载链路测试的断言。需要特定网络状态时用：
 *   const { __setNetworkState } = require('@react-native-community/netinfo');
 *   __setNetworkState({ type: 'cellular' });          // 改后续 fetch() 的返回值
 *   __emitNetworkChange({ type: 'wifi' });            // 推给 addEventListener 回调
 */

/** 与 NetInfoState 对齐的最小可用形状（NetworkGateService.isWlan 只读 isConnected/type） */
const DEFAULT_STATE = {
  type: 'wifi', // 'wifi' | 'cellular' | 'bluetooth' | 'ethernet' | 'vpn' | 'other' | 'none' | 'unknown'
  isConnected: true,
  isInternetReachable: true,
  isConnectionExpensive: false,
  details: { isConnectionExpensive: false },
};

/** 当前状态：__setNetworkState 可覆盖，fetch() 与 useNetInfo() 都读它 */
let currentState = { ...DEFAULT_STATE };

/** 已注册的网络变化监听器（addEventListener → Set，退订函数从 Set 移除） */
const listeners = new Set();

const getState = () => ({ ...DEFAULT_STATE, ...currentState });

const fetch = jest.fn(() => Promise.resolve(getState()));

const refresh = jest.fn(() => Promise.resolve(getState()));

const addEventListener = jest.fn((listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
});

/** 真实实现里 removeEventListener(cb) 接收的是 addEventListener 返回的订阅函数 */
const removeEventListener = jest.fn((unsubscribe) => {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  } else {
    listeners.delete(unsubscribe);
  }
});

const configure = jest.fn(() => () => {});

const useNetInfoInstance = jest.fn(() => ({
  netInfo: getState(),
  fetchState: { isStale: false, isError: false, isSuccess: true },
  refresh,
}));

const useNetInfo = jest.fn(() => getState());

/** NetInfo 默认导出是一个「对象 + 可调用」的混合体，这里只需对象形态 */
const NetInfo = {
  fetch,
  refresh,
  addEventListener,
  removeEventListener,
  configure,
  useNetInfoInstance,
  useNetInfo,
};

// ── 测试专用辅助 API（真实包无此导出，下划线前缀标识）──────────────

/** 覆盖后续 fetch() 返回的状态；参数浅合并进默认状态 */
const __setNetworkState = (patch = {}) => {
  currentState = { ...DEFAULT_STATE, ...patch };
  return getState();
};

/** 恢复 WiFi + 已连接（建议在 beforeEach 调用，避免用例间串味） */
const __resetNetworkState = () => {
  currentState = { ...DEFAULT_STATE };
  listeners.clear();
  fetch.mockClear();
  refresh.mockClear();
  addEventListener.mockClear();
  removeEventListener.mockClear();
  return getState();
};

/** 主动推送一次网络变化（模拟 WiFi ↔ 移动数据切换） */
const __emitNetworkChange = (patch = {}) => {
  const state = { ...DEFAULT_STATE, ...currentState, ...patch };
  currentState = state;
  listeners.forEach((listener) => listener(state));
  return state;
};

/** 当前监听器数量，用于断言订阅/退订是否泄漏 */
const __listenerCount = () => listeners.size;

module.exports = {
  __esModule: true,
  default: NetInfo,
  // 具名导出与真实包保持一致（部分调用方用 import { fetch } 形式）
  fetch,
  refresh,
  addEventListener,
  removeEventListener,
  configure,
  useNetInfoInstance,
  useNetInfo,
  // 测试辅助
  __setNetworkState,
  __resetNetworkState,
  __emitNetworkChange,
  __listenerCount,
};
