# Tasks

- [x] Task 1: 打印 URL 活性
  - [x] Subtask 1.1: 在 downloadSingleFile 函数中，下载前打印 URL
  - [x] Subtask 1.2: 检查日志中是否有无效的 URL

- [x] Task 2: 强制单线程串行下载
  - [x] Subtask 2.1: 移除并发下载逻辑
  - [x] Subtask 2.2: 改为 for...of 循环串行下载
  - [x] Subtask 2.3: 每个文件下载完成后打印"文件 X 完成"

- [x] Task 3: 修复 I18n 盲区
  - [x] Subtask 3.1: 检查 ResourceDownloadScreen 中所有硬编码中文
  - [x] Subtask 3.2: 全部替换为 i18n.t()

- [x] Task 4: 强制物理自检
  - [x] Subtask 4.1: 在下载开始前检查磁盘空间
  - [x] Subtask 4.2: 打印可用空间大小

- [ ] Task 5: 测试验证
  - [ ] Subtask 5.1: 清除数据重新测试
  - [ ] Subtask 5.2: 验证所有 18 个文件都下载完成

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 is independent
- Task 4 is independent
- Task 5 depends on Task 1, 2, 3, 4