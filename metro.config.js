const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const rootNodeModules = path.resolve(__dirname, 'node_modules');
const pnpmStore = path.resolve(rootNodeModules, '.pnpm');
const babelRuntimeRoot = fs.realpathSync(path.resolve(rootNodeModules, '@babel/runtime'));
const reactNativePath = fs.realpathSync(path.dirname(require.resolve('react-native/package.json')));
const reactPath = fs.realpathSync(path.dirname(require.resolve('react/package.json')));
const reactNavigationPath = fs.realpathSync(
  path.dirname(require.resolve('@react-navigation/native/package.json'))
);
const safeAreaPath = fs.realpathSync(
  path.dirname(require.resolve('react-native-safe-area-context/package.json'))
);
const gestureHandlerPath = fs.realpathSync(
  path.dirname(require.resolve('react-native-gesture-handler/package.json'))
);
const screensPath = fs.realpathSync(path.dirname(require.resolve('react-native-screens/package.json')));
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.assetExts.push('mp3', 'wav', 'flac', 'aiff', 'm4a');
config.resolver.nodeModulesPaths = [rootNodeModules];
config.resolver.useWatchman = false;
config.resolver.unstable_enableSymlinks = true;
config.watchFolders = [__dirname, rootNodeModules, pnpmStore];
config.resolver.extraNodeModules = {
  '@babel/runtime': babelRuntimeRoot,
  'react-native': reactNativePath,
  react: reactPath,
  '@react-navigation/native': reactNavigationPath,
  'react-native-safe-area-context': safeAreaPath,
  'react-native-gesture-handler': gestureHandlerPath,
  'react-native-screens': screensPath,
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@babel/runtime/')) {
    const subPath = moduleName.replace('@babel/runtime/', '');
    const fileCandidate = path.resolve(babelRuntimeRoot, `${subPath}.js`);
    if (fs.existsSync(fileCandidate)) {
      return { type: 'sourceFile', filePath: fileCandidate };
    }
    const indexCandidate = path.resolve(babelRuntimeRoot, subPath, 'index.js');
    if (fs.existsSync(indexCandidate)) {
      return { type: 'sourceFile', filePath: indexCandidate };
    }
  }
  if (!moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    try {
      const resolvedPath = require.resolve(moduleName, { paths: [__dirname] });
      return { type: 'sourceFile', filePath: resolvedPath };
    } catch (error) {
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
