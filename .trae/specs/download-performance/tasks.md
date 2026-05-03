# Tasks

- [x] Task 1: 恢复并发下载逻辑
  - [x] Subtask 1.1: 恢复 `downloadWithConcurrencyLimit` 函数
  - [x] Subtask 1.2: 根据渠道设置并发数：GooglePlay 8 线程，国内 5 线程
  - [x] Subtask 1.3: 保留 Core 资源优先下载策略

- [x] Task 2: 添加超时保护
  - [x] Subtask 2.1: 为每个文件下载设置 30 秒超时
  - [x] Subtask 2.2: 超时后记录失败并继续下载下一个

- [x] Task 3: 添加失败重试机制
  - [x] Subtask 3.1: 下载失败自动重试 2 次
  - [x] Subtask 3.2: 重试间隔递增（1 秒、2 秒）

- [x] Task 4: 添加健康检查
  - [x] Subtask 4.1: 监控连续失败次数
  - [x] Subtask 4.2: 连续 3 次失败自动降级为单线程

- [x] Task 5: 保留 Debug 日志
  - [x] Subtask 5.1: 保留 [Queue] Starting/Completed 日志
  - [x] Subtask 5.2: 保留 Progress Trace 日志
  - [x] Subtask 5.3: 添加并发数日志

- [ ] Task 6: 测试验证
  - [ ] Subtask 6.1: 测试 GooglePlay 渠道 8 线程下载
  - [ ] Subtask 6.2: 测试超时保护和重试机制
  - [ ] Subtask 6.3: 验证所有文件下载完成

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2, 3
- Task 5 is independent
- Task 6 depends on Task 1, 2, 3, 4, 5