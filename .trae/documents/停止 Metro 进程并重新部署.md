## 停止 Metro 进程并重新部署

### 1. 强制杀掉端口 8081 的进程
- 执行 `sudo lsof -i :8081 | grep LISTEN | awk '{print $2}' | xargs kill -9`

### 2. 手动修改 App.js 中的 handleToggle
- 确保加入 `TrackPlayer.setVolume(1.0)`
- 添加 `setTimeout` 延迟播放逻辑（200ms）
- 添加 `TrackPlayer.getState()` 日志

### 3. 校对文件名确保是 .mp3 后缀
- 检查 res/raw/ 中的实际文件
- 修正 App.js 中的文件名

### 4. 重新部署到真机
- 执行 `npx react-native run-android`
- 安装到真机测试