## 修复 TrackPlayer.prepare is not a function 错误

### 1. 删除 prepare 调用
- 把代码第 72 行左右的 `await TrackPlayer.prepare();` 删掉

### 2. 确保直接调用 play()
- `TrackPlayer.add(...)` 之后直接调用 `TrackPlayer.play()` 即可

### 3. 确认 stop() 已添加
- `handleToggle` 函数的最开始已经有 `await TrackPlayer.stop()`
- 防止切换过快导致的 buffering 卡顿

### 4. 重启测试
- 杀掉 8081 端口
- 运行 npx react-native start --reset-cache