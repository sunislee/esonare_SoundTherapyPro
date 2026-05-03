# 下载性能优化 Spec - 恢复并发下载

## Why
当前串行下载虽然稳定但速度较慢，需要在保证不卡死的前提下恢复并发下载逻辑，提升下载速度。

## What Changes
- 恢复 GooglePlay 渠道 8 线程、国内渠道 5 线程的并发下载
- 保留单线程的稳定性优势：超时保护、失败重试、详细日志
- 添加健康检查机制，检测到卡死自动降级为单线程
- 保留所有 Debug 日志用于监控

## Impact
- Affected specs: 下载流程、错误处理、性能优化
- Affected code: DownloadService.ts

## ADDED Requirements
### Requirement: 并发下载
The system SHALL 根据渠道使用不同的并发数：GooglePlay 8 线程，国内 5 线程

#### Scenario: 开始下载
- **WHEN** 开始下载资源
- **THEN** GooglePlay 使用 8 线程并发，国内使用 5 线程并发

### Requirement: 超时保护
The system SHALL 为每个文件下载设置超时保护

#### Scenario: 下载单个文件
- **WHEN** 下载一个文件
- **THEN** 30 秒内未完成则超时，记录失败并继续下载下一个

### Requirement: 失败重试
The system SHALL 下载失败时自动重试

#### Scenario: 下载失败
- **WHEN** 文件下载失败
- **THEN** 自动重试 2 次，每次间隔递增

### Requirement: 健康检查
The system SHALL 检测下载队列是否卡死

#### Scenario: 队列卡死
- **WHEN** 连续 3 个文件下载超时或失败
- **THEN** 自动降级为单线程模式

## MODIFIED Requirements
### Requirement: 下载循环逻辑
将串行下载改为并发下载，但保留超时和重试机制

**修改内容**：
- 恢复 `downloadWithConcurrencyLimit` 函数
- 添加超时保护：每个文件 30 秒
- 添加失败重试：最多 2 次
- 添加健康检查：连续失败自动降级

## REMOVED Requirements
无
