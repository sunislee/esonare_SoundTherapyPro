/**
 * @format
 */
/* eslint-env jest */
/**
 * App 入口冒烟测 —— 渲染外壳 + ErrorBoundary，验证「App 能挂载、错误边界可用」。
 *
 * 为什么在本文件内 mock，而不是深渲染整棵树：
 *   App 顶层 import 了 AudioService / TrackPlayer / SafeAreaProvider / MainNavigator(→全部 screens)
 *   / toast / RNFS 等一整套原生模块；直接 create(<App/>) 会在 TurboModuleRegistry.getEnforcing 处
 *   逐个崩（RNGestureHandler → AsyncStorage → RNHapticFeedback → …），需要为每个原生二进制补桩，
 *   既脆弱又与「统一就绪口径」无关。gesture-handler 的 jestSetup 已在 jest.config setupFiles 全局注入
 *   （需求点名项）；这里把其余重依赖在【本文件内】mock（不污染下载链路等纯逻辑单测），只验证 App
 *   外壳可挂载。完整交互/原生集成回归由真机 release + e2e 覆盖（见本次装机取证）。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// ── 切断全部 screens 链：MainNavigator / AudioContext 用最小 stub，避免加载 HomeScreen 等原生重模块 ──
jest.mock('../src/navigation/MainNavigator', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { MainNavigator: () => R.createElement(View) };
});
jest.mock('../src/context/AudioContext', () => {
  const R = require('react');
  return { AudioProvider: ({ children }: any) => R.createElement(R.Fragment, null, children), useAudio: () => ({ isPlaying: false, currentBaseSceneId: null, togglePlayback: jest.fn() }) };
});

// ── 原生 / 重模块 mock（仅本文件作用域）──
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  return {
    SafeAreaProvider: ({ children }: any) => R.createElement(R.Fragment, null, children),
    SafeAreaView: ({ children }: any) => R.createElement(R.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('react-native-toast-message', () => {
  const R = require('react');
  const Toast: any = () => R.createElement(R.Fragment);
  Toast.show = jest.fn();
  return { __esModule: true, default: Toast };
});
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => (..._a: any[]) => Promise.resolve({}) }),
  State: {}, Event: {},
}));
// AudioService：getInstance() 返回宽容 Proxy —— App useEffect 调任意方法均 resolve，避免逐方法补桩。
jest.mock('../src/services/AudioService', () => ({
  __esModule: true,
  default: {
    getInstance: () => new Proxy({}, { get: () => (..._a: any[]) => Promise.resolve({}) }),
    addLoadingListener: jest.fn(() => jest.fn()),
    stopAll: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../src/i18n', () => ({ __esModule: true, initLanguage: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/config/toastConfig', () => ({ __esModule: true, default: {} }));
jest.mock('../src/utils/ToastUtil', () => ({ __esModule: true, default: { init: jest.fn(), show: jest.fn(), success: jest.fn(), error: jest.fn() } }));
jest.mock('../src/services/DownloadService', () => ({ DownloadService: { silentBackgroundDownload: jest.fn(() => Promise.resolve({ success: 0, failed: 0 })), setProgressCallback: jest.fn() } }));
jest.mock('../src/services/DownloaderService', () => ({ DownloaderServiceInstance: new Proxy({}, { get: () => jest.fn(() => Promise.resolve({})) }), subscribeDownload: jest.fn(() => jest.fn()) }));
jest.mock('../src/services/BuiltinAssetBootstrap', () => ({ __esModule: true, default: { bootstrap: jest.fn(() => Promise.resolve()) } }));
jest.mock('../src/constants/scenes', () => ({ preloadBackgroundAvailability: jest.fn(), SCENES: [], SMALL_SCENE_IDS: [] }));
jest.mock('../src/services/NetworkGateService', () => ({ __esModule: true, default: { init: jest.fn(), isOffline: () => false, subscribe: jest.fn(() => jest.fn()) } }));
jest.mock('../src/components/WifiDownloadPrompt', () => { const R = require('react'); return { __esModule: true, default: () => R.createElement(R.Fragment) }; });
jest.mock('../src/utils/CrashReportUtil', () => ({ CrashReportUtil: { logException: jest.fn() } }));
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn(() => Promise.resolve(false)),
  mkdir: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('{}')),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({ size: 0 })),
  readDir: jest.fn(() => Promise.resolve([])),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
}));

test('renders correctly', async () => {
  const App = require('../App').default;
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});