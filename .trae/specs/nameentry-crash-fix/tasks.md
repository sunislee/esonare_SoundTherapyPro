# Tasks
- [ ] Task 1: 修复 index.js 初始化顺序
  - [ ] 确保 i18n 导入在所有其他导入之前
  - [ ] 验证 TrackPlayer.registerPlaybackService 在 AppRegistry 之前调用
  - [ ] 添加 i18n 初始化完成的日志

- [ ] Task 2: 增强 AudioContext 错误处理
  - [ ] 在 checkServiceReady 中添加 try...catch
  - [ ] 设置最大重试次数，防止无限循环
  - [ ] 在 AudioService 未就绪时提供降级模式

- [ ] Task 3: 优化 NameEntryScreen 防御性渲染
  - [ ] 增加 i18n 就绪状态检查
  - [ ] 实现 safeT 翻译降级函数
  - [ ] 添加导航就绪性检查

- [ ] Task 4: 验证和测试
  - [ ] 清理缓存并重新编译
  - [ ] 在真机上测试 NameEntry 流程
  - [ ] 验证崩溃日志不再出现

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
