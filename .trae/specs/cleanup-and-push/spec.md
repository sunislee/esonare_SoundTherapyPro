# 清理和推送 Spec

## Why
性能优化已完成，需要清理测试过程中产生的无用代码、调试日志和缓存文件，保持代码库整洁，然后提交并推送到远端仓库（GitHub 和 Gitee）。

## What Changes
- 清理 Android 编译缓存和 Gradle 日志文件
- 清理 node_modules 中的临时文件
- 保留 DownloadService.ts 的性能优化代码（受控并发、超时保护、重试机制）
- 提交当前性能优化成果到本地仓库
- 推送到 GitHub 和 Gitee 远端仓库

## Impact
- **Affected specs**: download-performance spec 完成
- **Affected code**: 无代码逻辑变更，仅清理缓存和提交
- **Git history**: 新增一个 commit，包含性能优化成果

## Requirements

### Requirement: 清理缓存文件
系统 SHALL 清理以下类型的文件：
- Android Gradle 缓存日志（.gradle/kotlin/errors/*.log）
- CMake 编译日志（**/.cxx/**/CMakeOutput.log）
- 临时文件（*.tmp）

#### Scenario: 执行清理
- **WHEN** 执行清理命令
- **THEN** 上述类型的文件应被删除

### Requirement: 保留性能优化代码
系统 SHALL 保留 DownloadService.ts 中的以下优化：
- 受控并发下载（GooglePlay 8 线程，国内 5 线程）
- 30 秒超时保护
- 递增重试机制（1s, 2s 间隔）
- 智能降级机制（连续失败 3 次降级为单线程）
- Worker 启动错峰（100ms 间隔）

### Requirement: 提交代码
系统 SHALL 提交以下变更：
- src/services/DownloadService.ts（性能优化）
- 提交信息应包含性能优化关键词

#### Scenario: 提交成功
- **WHEN** 执行 git commit
- **THEN** 提交信息格式：`perf: optimize download performance with controlled concurrency`

### Requirement: 推送到远端
系统 SHALL 推送到两个远端仓库：
- GitHub: git@github.com:sunislee/esonare_SoundTherapyPro.git
- Gitee: https://gitee.com/sunislee/esonare_SoundTherapyPro.git

#### Scenario: 推送成功
- **WHEN** 执行 git push
- **THEN** GitHub 和 Gitee 都应同步最新代码
