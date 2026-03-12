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
const findPnpmPackagePath = (packageName) => {
  try {
    const entries = fs.readdirSync(pnpmStore);
    const match = entries.find((entry) => entry.startsWith(`${packageName}@`));
    if (!match) return null;
    const candidate = path.join(pnpmStore, match, 'node_modules', packageName);
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
    return null;
  } catch (error) {
    return null;
  }
};
const regeneratorRuntimePath =
  findPnpmPackagePath('regenerator-runtime') ||
  (() => {
    try {
      return fs.realpathSync(
        path.dirname(require.resolve('regenerator-runtime/package.json', { paths: [__dirname] }))
      );
    } catch (error) {
      return null;
    }
  })();

config.resolver.assetExts.push('mp3', 'wav', 'flac', 'aiff', 'm4a');
config.resolver.nodeModulesPaths = [rootNodeModules, pnpmStore];
config.resolver.useWatchman = false;
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;
config.watchFolders = [__dirname, rootNodeModules, pnpmStore];
const expoModulesCorePath = findPnpmPackagePath('expo-modules-core') || fs.realpathSync(
  path.dirname(require.resolve('expo-modules-core/package.json', { paths: [__dirname] }))
);

config.resolver.extraNodeModules = {
  '@babel/runtime': babelRuntimeRoot,
  'react-native': reactNativePath,
  react: reactPath,
  '@react-navigation/native': reactNavigationPath,
  'react-native-safe-area-context': safeAreaPath,
  'react-native-gesture-handler': gestureHandlerPath,
  'react-native-screens': screensPath,
  'expo-modules-core': expoModulesCorePath,
  'expo-file-system': findPnpmPackagePath('expo-file-system') || expoModulesCorePath,
  'expo-av': findPnpmPackagePath('expo-av') || expoModulesCorePath,
  'expo-asset': findPnpmPackagePath('expo-asset') || expoModulesCorePath,
  'expo-constants': findPnpmPackagePath('expo-constants') || expoModulesCorePath,
  ...(regeneratorRuntimePath ? { 'regenerator-runtime': regeneratorRuntimePath } : {}),
};

// Web平台兼容性配置
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 处理Web平台的特殊模块
  if (platform === 'web') {
    // 处理PermissionsAndroid模块
    if (moduleName === 'react-native/Libraries/PermissionsAndroid') {
      return {
        type: 'sourceFile',
        filePath: require.resolve('react-native-web/dist/modules/PermissionsAndroid'),
      };
    }
    
    // 处理其他可能的原生模块
    if (moduleName.includes('NativeModules')) {
      return {
        type: 'sourceFile',
        filePath: require.resolve('react-native-web/dist/modules/NativeModules'),
      };
    }
  }
  
  // 原有解析逻辑
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
  if (
    regeneratorRuntimePath &&
    (moduleName === 'regenerator-runtime/runtime' || moduleName === 'regenerator-runtime/runtime.js')
  ) {
    return { type: 'sourceFile', filePath: path.resolve(regeneratorRuntimePath, 'runtime.js') };
  }
  if (regeneratorRuntimePath && moduleName.startsWith('regenerator-runtime/')) {
    const subPath = moduleName.replace('regenerator-runtime/', '');
    const normalizedSubPath = subPath.endsWith('.js') ? subPath : `${subPath}.js`;
    const fileCandidate = path.resolve(regeneratorRuntimePath, normalizedSubPath);
    if (fs.existsSync(fileCandidate)) {
      return { type: 'sourceFile', filePath: fileCandidate };
    }
    const indexCandidate = path.resolve(regeneratorRuntimePath, subPath, 'index.js');
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
