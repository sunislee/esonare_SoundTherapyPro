# Tasks

- [x] Task 1: 修改 ResourceDownloadScreen 的 checkAndStart 逻辑
  - [x] 删除"资源已存在立即跳转"的逻辑
  - [x] 增加人为缓冲：强制展示至少 1200ms
  - [x] 资源已存在时显示"正在准备冥想空间..."

- [x] Task 2: 实现淡出动画
  - [x] 创建 fadeOut 动画值
  - [x] 1200ms 后执行淡出动画（500ms）
  - [x] 淡出完成后执行 navigation.replace

- [x] Task 3: 优化状态文案
  - [x] 资源已存在时：显示"正在准备冥想空间..."
  - [x] 下载中时：保持原有文案
  - [x] 下载完成时：显示"资源准备完成"

- [ ] Task 4: 测试验证
  - [ ] 测试老用户（资源已存在）场景
  - [ ] 测试新用户（需要下载）场景
  - [ ] 验证小人动画正常显示
  - [ ] 验证淡出动画平滑

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1, Task 2, Task 3
