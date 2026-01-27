const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts } = defaultConfig.resolver;

const config = {
  resolver: {
    assetExts: Array.from(new Set([...assetExts, 'mp3', 'wav', 'flac', 'aiff', 'm4a'])),
  },
};

module.exports = mergeConfig(defaultConfig, config);
