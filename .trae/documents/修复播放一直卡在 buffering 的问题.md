## 修复播放一直卡在 buffering 的问题

### 1. 增加缓冲监听
- 添加 `useTrackPlayerEvents` 监听 `PlaybackState`
- 如果状态是 `buffering` 超过 1 秒，强制再次调用 `TrackPlayer.play()`

### 2. 优化预加载
- 在 `TrackPlayer.add` 之后，先调用 `await TrackPlayer.prepare()`（如果版本支持）
- 然后再调用 `play()`

### 3. 增大延迟
- 将 handleToggle 里的 setTimeout 增加到 1500ms
- 给 Android 系统充足的解码缓冲时间

### 4. 针对 m4a 的特殊处理
- 如果点击的是 `final_healing_rain.m4a`，在 add 时显式指定 `type: 'm4a'`

### 5. 重新部署
- 执行 `npx react-native run-android`
- 测试播放