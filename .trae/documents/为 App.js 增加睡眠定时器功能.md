## 为 App.js 增加睡眠定时器（Sleep Timer）功能

### 1. 增加状态管理
- 使用 useState 增加 `timerLeft`（剩余秒数）和 `isTimerActive`
- 使用 useState 增加 `selectedTimer`（选中的定时器选项）

### 2. 倒计时逻辑
- 使用 useEffect 监听 `timerLeft`
- 当倒计时大于 0 时，每秒减 1
- 当减到 0 时，执行 `TrackPlayer.stop()` 并清空 `currentId`

### 3. UI 交互
- 在顶部 Logo 下方增加三个简单的定时选项：[15min, 30min, 60min]
- 使用 TouchableOpacity 实现定时器按钮选择
- 显示当前倒计时（格式：MM:SS）

### 4. 安全保护
- 在切换场景或手动停止播放时，可以选择重置或保留定时器
- 添加清除定时器的逻辑

### 5. 代码逻辑
- 使用 setInterval 处理倒计时
- 时间到时确保调用 `await TrackPlayer.reset()` 以释放资源

### 6. UI 样式
- 保持现在的黑色简约风格
- 定时器按钮使用圆形样式，与场景按钮保持一致