## 修复 pink_noise.mp3 找不到的问题

### 1. 检查 assets/audio/tracks/ 目录中的实际文件名
- 运行 `ls assets/audio/tracks/` 查看真实文件名

### 2. 根据 ls 的结果，像素级同步修改 App.js 里的 SCENES 数组
- 重点检查：把 `pink_noise.mp3` 改成 `pink_noise_zen.m4a`（或者 ls 出来的正确名字）

### 3. 改完后，再次执行 npx react-native start --reset-cache
- 重启 Metro dev server