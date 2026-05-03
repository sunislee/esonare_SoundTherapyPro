const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // 解决 PNPM 嵌套依赖问题
    nodeModulesPaths: [
      __dirname + '/node_modules',
      __dirname + '/node_modules/.pnpm/node_modules',
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
