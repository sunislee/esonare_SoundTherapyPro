module.exports = {
  preset: 'react-native',
  // gesture-handler 自带 jestSetup（副作用式注册 jest.mock，须在测试框架初始化期执行）。
  //   App.test.tsx 渲染整棵 App 树会触达 RNGestureHandlerModule TurboModule，无原生实现即崩。
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  // 原生模块 mock 注入（netinfo / reanimated 等），详见 jest.setup.js
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // 图片/字体等二进制资源 stub 成字符串，避免 node_modules 内包的 .png 被当 JS 解析而 SyntaxError。
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif|webp|psd|mp4)$': '<rootDir>/__mocks__/fileMock.js',
  },
};
