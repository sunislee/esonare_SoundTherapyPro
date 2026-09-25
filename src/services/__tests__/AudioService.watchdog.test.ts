/* eslint-env jest */
/**
 * 【流播停摆看门狗 · 行为规格测试】
 *
 * 三态映射（与 AudioService 内注释一致）：
 *   position 前进                                    → playing
 *   position 冻结 + state=Buffering / 读数不可信 / 后台 → buffering，绝不 pause
 *   position 冻结 + state=Playing + 无事件更新 + 无 error → dead → 诚实回退(pause)
 *
 * 依据：RNTP #1121 / #922 —— JS 侧 position 在起播阶段与后台都会说谎，
 * 因此"仅凭 position 冻结"不得作为判死依据；真断流必伴随 native 状态迁移或 PlaybackError。
 */

const rn = require('react-native');

jest.mock('react-native-track-player', () => {
  const State = { None: 0, Ready: 1, Playing: 2, Paused: 3, Stopped: 4, Buffering: 5, Connecting: 6 };
  return {
    __esModule: true,
    State,
    Event: {
      PlaybackState: 'playback-state',
      PlaybackError: 'playback-error',
      PlaybackTrackEnded: 'playback-track-ended',
    },
    Capability: { Play: 'play', Pause: 'pause', SeekTo: 'seek' },
    RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    default: {
      addEventListener: jest.fn(),
      removeListeners: jest.fn(),
      setupPlayer: jest.fn(async () => undefined),
      getProgress: jest.fn(async () => ({ position: 0, buffered: 0, duration: 0 })),
      getPosition: jest.fn(async () => 0),
      getDuration: jest.fn(async () => 0),
      getState: jest.fn(async () => ({ state: State.Playing })),
      pause: jest.fn(async () => undefined),
      play: jest.fn(async () => undefined),
      setRepeatMode: jest.fn(async () => undefined),
    },
  };
});

jest.mock('react-native-sound', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    play: jest.fn(), pause: jest.fn(), stop: jest.fn(), release: jest.fn(),
    setVolume: jest.fn(), numberOfChannels: jest.fn(() => 2), getDuration: jest.fn(() => 0),
    setPosition: jest.fn(), isPlaying: jest.fn(() => false),
  })),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp', CachesDirectoryPath: '/tmp', LibraryDirectoryPath: '/tmp',
  MainBundlePath: '/tmp', existsSync: jest.fn(() => false), exists: jest.fn(async () => false),
  readDir: jest.fn(async () => []), readFile: jest.fn(async () => ''), writeFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined), unlink: jest.fn(async () => undefined),
  stat: jest.fn(async () => ({ size: 0 })),
  downloadFile: jest.fn(() => ({ jobId: 1, promise: Promise.resolve({ statusCode: 200, bytesWritten: 0 }) })),
  readDirIncremental: jest.fn(), unlinkAssetsTree: jest.fn(async () => undefined),
}));

import TrackPlayer, { Event, State } from 'react-native-track-player';
import AudioService from '../AudioService';

const tp = TrackPlayer as any;
const CHECK_MS = 2000;   // 轮询间隔（实现内 STALL_CHECK_MS）
const GRACE_MS = 12000;  // 起播宽限期（STALL_GRACE_MS）
const DEAD_MS = 15000;   // 判死所需冻结时长（STALL_DEAD_MS）

type AnySvc = any;

/** 取单例并把看门狗置于干净起点。 */
function freshService(): AnySvc {
  const svc = AudioService.getInstance() as AnySvc;   // 白盒测试：直接读写私有看门狗状态
  svc.stopStallWatchdog();
  svc.appState = 'active';                 // 单例跨用例存活：必须复位前后台（T5 会置 background）
  rn.AppState.currentState = 'active';
  svc.isActuallyPlaying = true;
  svc.currentBaseScene = { id: 'watchdog_test_scene', title: '测试场景', filename: 'x.mp3', category: 'nature', duration: 300 };
  svc._watchLastPos = -1;
  svc._watchLastBuffered = -1;
  svc._watchStallPolls = 0;
  svc._watchArmedTs = 0;
  svc._watchGraceUntil = 0;
  svc._watchWasPlaying = false;
  svc._watchLastChangeTs = Date.now();
  svc._lastNativeState = null;
  svc._watchLastStateEventTs = 0;
  svc._stallState = 'playing';
  return svc;
}

function firePlaybackState(state: any) {
  const calls = tp.addEventListener.mock.calls.filter((c: any[]) => c[0] === Event.PlaybackState);
  const handler = calls.length ? calls[calls.length - 1][1] : null;
  if (!handler) throw new Error('未注册 Event.PlaybackState 监听');
  return handler({ state });
}

function firePlaybackError(err: any = { message: 'io error' }) {
  const calls = tp.addEventListener.mock.calls.filter((c: any[]) => c[0] === Event.PlaybackError);
  if (!calls.length) throw new Error('未注册 Event.PlaybackError 监听');
  return calls[calls.length - 1][1](err);
}

/** 冻结读数：position/buffered 恒定，duration 有效（远离曲尾）。 */
function freezeProgress(position = 42, buffered = 120, duration = 300) {
  const snap = { position, buffered, duration };
  tp.getProgress.mockResolvedValue(snap);
  tp.getPosition.mockResolvedValue(position);
  tp.getDuration.mockResolvedValue(duration);
  return snap;
}

let emitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  rn.AppState.currentState = 'active';
  emitSpy = jest.spyOn(rn.DeviceEventEmitter, 'emit').mockImplementation(() => true);
});

afterEach(() => {
  (AudioService.getInstance() as AnySvc).stopStallWatchdog();
  emitSpy.mockRestore();
  jest.useRealTimers();
});

/** 推进 fake timers 并冲刷 await 链（轮询回调是 async）。 */
async function tick(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
}

describe('流播停摆看门狗 · 三态判定', () => {
  it('T1 起播后 position 冻结 6s（旧阈值场景）→ 不得判死', async () => {
    const svc = freshService();
    freezeProgress(3.2, 90, 300);
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);      // arm（native 首个 Playing）
    await tick(GRACE_MS);                  // 走完宽限期
    await tick(6000);                      // 再冻结 6s —— 旧实现必杀

    expect(tp.pause).not.toHaveBeenCalled();
    expect(svc.getWatchdogDiagnostics().state).not.toBe('dead');
    expect(emitSpy.mock.calls.some((c: any[]) => c[0] === 'playbackStalled')).toBe(false);
  });

  it('T2 计时起点 = 首个 native Playing 事件（而非 isActuallyPlaying=true）', async () => {
    const svc = freshService();
    freezeProgress(0, 30, 300);            // position 仍为 0，排除 position>0 兜底 arm
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    await tick(8000);                      // isActuallyPlaying=true 已 8s，但 native 尚未报 Playing
    expect(svc.getWatchdogDiagnostics().armedAt).toBe(0);

    firePlaybackState(State.Playing);      // ← 真正的 arm 时刻
    const armedAt = svc.getWatchdogDiagnostics().armedAt;
    expect(armedAt).toBeGreaterThan(0);
    expect(Math.abs(armedAt - Date.now())).toBeLessThan(CHECK_MS);

    await tick(GRACE_MS - 2000);           // 从 arm 起算的宽限期未满
    expect(tp.pause).not.toHaveBeenCalled();
  });

  it('T3 position 冻结但 state=Buffering（buffered 仍增长）→ buffering，不得 pause', async () => {
    const svc = freshService();
    freezeProgress(5, 100, 300);
    tp.getState.mockResolvedValue({ state: State.Buffering });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);      // arm
    await tick(1000);
    firePlaybackState(State.Buffering);    // native 转入缓冲

    let buf = 100;
    for (let i = 0; i < 20; i++) {         // 40s：position 冻结、buffered 持续增长
      buf += 8;
      freezeProgress(5, buf, 300);
      await tick(CHECK_MS);
    }

    expect(tp.pause).not.toHaveBeenCalled();
    expect(svc.getWatchdogDiagnostics().state).toBe('buffering');
    expect(emitSpy.mock.calls.some((c: any[]) => c[0] === 'playbackBuffering')).toBe(true);
  });

  it('T4 state 恒 Playing + 无事件更新 + position/buffered 双冻结超阈值 → 必须判死', async () => {
    const svc = freshService();
    freezeProgress(7.5, 200, 300);         // 完全不动
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);      // 唯一一次状态事件，此后再无事件

    await tick(GRACE_MS + DEAD_MS + CHECK_MS * 2);

    expect(tp.pause).toHaveBeenCalledTimes(1);
    expect(svc.getWatchdogDiagnostics().state).toBe('dead');
    expect(svc.isActuallyPlaying).toBe(false);
    expect(emitSpy.mock.calls.some((c: any[]) => c[0] === 'playbackStalled')).toBe(true);
  });

  it('T5 后台(AppState=background) + position 冻结 → 永不判死（助眠息屏防线）', async () => {
    const svc = freshService();
    freezeProgress(12, 300, 300);
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);
    await tick(2000);
    svc.handleAppStateChange('background'); // 用户锁屏/切后台

    await tick(GRACE_MS + DEAD_MS * 3);     // 远超阈值（模拟整晚挂机）

    expect(tp.pause).not.toHaveBeenCalled();
    expect(svc.isActuallyPlaying).toBe(true);
    expect(emitSpy.mock.calls.some((c: any[]) => c[0] === 'playbackStalled')).toBe(false);
  });

  it('T7【R2 判别项】position 冻结 + buffered 仍增长 + native 恒 Playing → 必须判死（buffered 不是播放进度）', async () => {
    const svc = freshService();
    freezeProgress(9, 150, 300);
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);      // arm，之后再无状态事件

    let buf = 150;
    for (let i = 0; i < 24; i++) {         // 48s：下载仍在进账，播放位置一动不动
      buf += 6;
      freezeProgress(9, buf, 300);
      await tick(CHECK_MS);
    }

    expect(tp.pause).toHaveBeenCalledTimes(1);
    expect(svc.getWatchdogDiagnostics().state).toBe('dead');
  });

  it('T6 PlaybackError 仍立即判死（护栏未被修废）', async () => {
    const svc = freshService();
    freezeProgress(20, 300, 300);
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);
    await firePlaybackError({ message: 'decoder error' });
    await tick(100);

    expect(tp.pause).toHaveBeenCalledTimes(1);
    expect(svc.getWatchdogDiagnostics().state).toBe('dead');
  });

  it('T8【R3·真机回归】后台期间 JS 读数冻结 → 回前台不得用后台累计时长判死', async () => {
    const svc = freshService();
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);

    // 正常播放若干轮：position 持续前进，看门狗记下真实基准（真机即 21s 处）
    let pos = 5;
    for (let i = 0; i < 8; i++) {
      pos += 4;
      freezeProgress(pos, 64, 185);
      await tick(CHECK_MS);
    }
    expect(tp.pause).not.toHaveBeenCalled();

    // 进后台：RNTP #1121 —— JS 读数冻结在 pos，native 其实继续播
    svc.handleAppStateChange('background');
    for (let i = 0; i < 50; i++) {          // 后台 100s
      freezeProgress(pos, 90 + i, 185);     // position 不动，buffered 仍在涨（下载继续）
      await tick(CHECK_MS);
    }
    expect(tp.pause).not.toHaveBeenCalled();

    // 回前台：读数跳到 native 真实位置 55.62s
    freezeProgress(55.62, 129, 185);
    svc.handleAppStateChange('active');
    await tick(GRACE_MS + 4000);

    expect(tp.pause).not.toHaveBeenCalled();          // ← 修复前此处必判死(pos=55.62s/99s)
    expect(svc.getWatchdogDiagnostics().state).not.toBe('dead');
    expect(svc.isActuallyPlaying).toBe(true);
  });

  it('T9【R3 反向保护】回前台后读数仍真冻结 → 重新给完宽限后才判死（不得秒判，也不得永不判）', async () => {
    const svc = freshService();
    freezeProgress(21, 64, 185);
    tp.getState.mockResolvedValue({ state: State.Playing });

    svc.startStallWatchdog();
    firePlaybackState(State.Playing);
    await tick(4000);
    svc.handleAppStateChange('background');
    await tick(60000);
    svc.handleAppStateChange('active');     // 回前台，但读数依旧停在 21s

    await tick(GRACE_MS);                    // 新宽限期内：不得判死
    expect(tp.pause).not.toHaveBeenCalled();

    await tick(DEAD_MS + CHECK_MS * 3);      // 宽限后继续冻结 → 必须判死
    expect(tp.pause).toHaveBeenCalledTimes(1);
    expect(svc.getWatchdogDiagnostics().state).toBe('dead');
  });
});
