# Tasks

- [ ] Task 1: 在 AudioService.playScene 中添加路径诊断日志
  - [ ] 打印 AUDIO_MAP[scene.filename] 的值
  - [ ] 打印 getLocalPath() 返回的路径
  - [ ] 打印 RNFS.exists() 检查的路径和结果

- [ ] Task 2: 在 DownloadService 中添加路径日志
  - [ ] 打印 localPath 的完整路径
  - [ ] 打印文件保存后的实际路径

- [ ] Task 3: 验证路径一致性
  - [ ] 触发下载流程
  - [ ] 收集 Logcat 日志
  - [ ] 对比 AudioService 和 DownloadService 的路径
  - [ ] 确认路径完全一致

- [ ] Task 4: 清理调试日志（可选）
  - [ ] 如果路径一致，保留关键日志
  - [ ] 如果路径不一致，修复后移除冗余日志

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1 和 Task 2
