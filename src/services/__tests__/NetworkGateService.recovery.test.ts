/**
 * 【网络自愈 · req#1 去抖】NetworkGateService.handleConnectivityChange
 *   - 离线→稳定联网(满去抖窗口) → 发一次 NETWORK_RECOVERED。
 *   - 数秒内反复 up/down 抖动 → 仅触发一次重排（拖尾去抖）。
 *   - 从未掉线的首启联网 → 不误触发。
 */
export {};
import DeviceEventEmitterMock from 'react-native';
import gate, { NETWORK_RECOVERED } from '../NetworkGateService';

const RN = require('react-native');
void DeviceEventEmitterMock; // 仅确保 react-native 被解析

const OFFLINE = { isConnected: false, type: 'none' } as any;
const ONLINE = { isConnected: true, type: 'wifi' } as any;
const DEBOUNCE = 3000;

function recoveredEmitCount(emitSpy: jest.SpyInstance): number {
  return emitSpy.mock.calls.filter((c) => c[0] === NETWORK_RECOVERED).length;
}

describe('NetworkGateService 网络恢复去抖 (req#1)', () => {
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    (gate as any)._resetRecoveryForTest();
    emitSpy = jest.spyOn(RN.DeviceEventEmitter, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
    jest.useRealTimers();
  });

  it('离线→稳定联网满窗口 → 发一次 NETWORK_RECOVERED', () => {
    gate.handleConnectivityChange(OFFLINE);
    gate.handleConnectivityChange(ONLINE);
    expect(recoveredEmitCount(emitSpy)).toBe(0); // 去抖未到点
    jest.advanceTimersByTime(DEBOUNCE + 10);
    expect(recoveredEmitCount(emitSpy)).toBe(1);
  });

  it('数秒内 up/down 抖动 → 仅重排一次', () => {
    gate.handleConnectivityChange(OFFLINE); // 掉线
    gate.handleConnectivityChange(ONLINE);  // up → 起定时器
    jest.advanceTimersByTime(500);
    gate.handleConnectivityChange(OFFLINE); // down → 取消（抖动）
    expect(recoveredEmitCount(emitSpy)).toBe(0);
    gate.handleConnectivityChange(ONLINE);  // 再 up → 重起唯一定时器
    jest.advanceTimersByTime(DEBOUNCE + 10);
    expect(recoveredEmitCount(emitSpy)).toBe(1); // 全程只一次
  });

  it('从未掉线的首启联网 → 不误触发恢复', () => {
    gate.handleConnectivityChange(ONLINE); // 首启即在线，无 everDisconnected
    jest.advanceTimersByTime(DEBOUNCE + 100);
    expect(recoveredEmitCount(emitSpy)).toBe(0);
  });

  it('去抖窗口内多次稳定 up（无 down）→ 仍只排一次定时器', () => {
    gate.handleConnectivityChange(OFFLINE);
    gate.handleConnectivityChange(ONLINE);
    gate.handleConnectivityChange(ONLINE); // 重复在线不应再起第二个定时器
    jest.advanceTimersByTime(DEBOUNCE + 10);
    expect(recoveredEmitCount(emitSpy)).toBe(1);
  });
});
