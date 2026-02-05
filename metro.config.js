const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts } = defaultConfig.resolver;

const config = {
  resolver: {
    assetExts: Array.from(new Set([...assetExts, 'mp3', 'wav', 'flac', 'aiff', 'm4a'])),
    blockList: [
      /temp\//,
    ],
  },
  transformer: {
    // 启用内存优化
    maxWorkers: 2,
    // 启用缓存
    enableBabelRCLookup: false,
  },
  server: {
    // 增加内存限制
    maxWorkers: 2,
    // 启用持久连接
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // 增加响应头以启用缓存
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return middleware(req, res, next);
      };
    },
  },
  // 启用增量构建
  watchFolders: [],
};

module.exports = mergeConfig(defaultConfig, config);
