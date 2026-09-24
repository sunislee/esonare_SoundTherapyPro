/* eslint-env jest */
/**
 * Jest 全局 setup（setupFilesAfterEnv 入口）
 *
 * 职责边界：只做「让原生模块在单测环境可加载」这一件事，不放业务断言、不改功能代码。
 *
 * netinfo —— DownloaderService.ts:30 引入 NetworkGateService，连带 require netinfo
 * 原生模块；单测无原生实现时 import 阶段即抛 `NativeModule.RNCNetInfo is null`
 * （P1-5 断点续传测试 8/8 全红的根因）。
 * mock 实现见 __mocks__/@react-native-community/netinfo.js（node_modules 包的手动 mock
 * 必须放项目根 __mocks__/@scope/ 下）。需要特定网络状态的用例：
 *   const { __setNetworkState } = require('@react-native-community/netinfo');
 *   __setNetworkState({ type: 'cellular', isConnected: true });
 *
 * 注：App 组件树冒烟渲染所需的原生 mock 放在 __tests__/App.test.tsx 内，
 *     不污染下载链路等纯逻辑单测的执行环境。
 */

jest.mock('@react-native-community/netinfo');

// AsyncStorage —— 无原生模块时须用包内自带的内存实现顶替（裸 jest.mock 因无 __mocks__ 不生效）。
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const netInfoMock = require('@react-native-community/netinfo');

// 默认 WiFi + 已连接 = 移动数据闸门放行；每个用例前重置，
// 避免某个用例切到 cellular 后污染后续下载链路测试。
beforeEach(() => {
  netInfoMock.__resetNetworkState();
});

// reanimated —— App.test.tsx 渲染整棵 App 树会 import react-native-reanimated，其原生 worklet
// 运行时在单测环境不存在。用官方 mock 顶替（提供 useSharedValue/useAnimatedStyle 等空实现）。
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));



