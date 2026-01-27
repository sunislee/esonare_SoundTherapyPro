## 统一使用 React Native 静态资源管理

### 1. 删除 res/raw 目录下刚才复制的音频文件
- 删除 `alpha_wave.m4a` 等文件，避免混淆

### 2. 确保所有音频文件都在 assets/audio/tracks/ 目录下
- 检查并确认所有 .mp3 和 .m4a 文件都在正确位置

### 3. 修正 App.js 里的 SCENES 数组
- 统一使用 `require('./assets/audio/tracks/文件名')`

### 4. 运行 npx react-native-asset
- 这会把 assets 目录链接到 Android 的原生资源里
- 这样 require 才能生效

### 5. 重启
- 杀掉 8081 端口
- 运行 `npx react-native start --reset-cache`