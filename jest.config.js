module.exports = {
  preset: 'react-native',
  // 原生模块 mock 注入（netinfo 等），详见 jest.setup.js
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
