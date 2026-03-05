module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxRuntime: 'classic' }],
      ['@babel/preset-react', { runtime: 'classic' }],
    ],
    plugins: [
      ['@babel/plugin-transform-flow-strip-types'],
    ],
  };
};