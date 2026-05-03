# Tasks

- [ ] Task 1: 在 AudioService 播放逻辑中添加路径前缀处理
  - [ ] 在 loadTrack 方法中，给传给 TrackPlayer 的路径添加 file:// 前缀
  - [ ] 打印使用的播放路径
  - [ ] 对比 RNFS.exists 检查的路径和播放路径

- [ ] Task 2: 增加播放器错误监听
  - [ ] 在 TrackPlayer 事件监听中添加 onError 处理
  - [ ] 打印详细的错误信息
  - [ ] 区分 Source Error 和 Codec Error

- [ ] Task 3: 检查 AudioContext 状态机
  - [ ] 查看 Alert 关闭后的状态更新逻辑
  - [ ] 确认 isPlaying 状态是否被正确更新
  - [ ] 确保下载完成后自动触发播放

- [ ] Task 4: 验证 getLocalPath 返回值
  - [ ] 检查路径是否包含 undefined、null 等非法字符串
  - [ ] 检查路径编码是否正确
  - [ ] 打印路径的原始值和格式化后的值

- [ ] Task 5: 测试播放功能
  - [ ] 清除应用数据
  - [ ] 下载资源
  - [ ] 播放音频
  - [ ] 查看 Logcat 日志
  - [ ] 确认音频正常播放

# Task Dependencies
- Task 2 依赖 Task 1
- Task 5 依赖 Task 1, Task 2, Task 3, Task 4
