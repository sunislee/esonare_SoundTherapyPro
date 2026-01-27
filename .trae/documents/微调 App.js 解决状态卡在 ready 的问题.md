## 微调 App.js 解决状态卡在 ready 的问题

### 1. 强制播放补丁
- 在 useTrackPlayerEvents 监听里，如果状态变为 ready，直接调用一次 TrackPlayer.play()

### 2. 设置重复模式
- 在 add 音频后，设置 TrackPlayer.setRepeatMode(RepeatMode.Track)
- 确保它不会播完一次就自动停止

### 3. 优化资源释放
- 在 handleToggle 的最开始，加上 await TrackPlayer.stop()
- 确保前一个音频彻底释放后再加载下一个

### 4. 增加音量稳定性
- 在 play() 指令前后，重复调用 await TrackPlayer.setVolume(1.0)

### 5. 重启测试
- 杀掉 8081 端口
- 运行 npx react-native start --reset-cache