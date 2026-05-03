# 下载问题终极修复 Spec

## Why
下载进度卡在 4%（1MB/44MB），Extended 资源的 15 个文件根本没有开始下载，需要彻底诊断并修复下载队列问题。

## What Changes
- 打印每个资源的下载 URL，诊断 URL 活性
- 强制单线程串行下载，确保每个文件按顺序下载
- 修复所有硬编码的中文字符，全部使用 i18n
- 检查磁盘空间和权限，确保有足够的存储空间

## Impact
- Affected specs: 下载流程、国际化、错误处理
- Affected code: DownloadService.ts, ResourceDownloadScreen.tsx

## ADDED Requirements
### Requirement: 打印 URL 活性
The system SHALL 在下载每个资源前打印下载链接

#### Scenario: 下载资源
- **WHEN** 开始下载一个资源文件
- **THEN** 打印 `[DownloadService] 下载 URL: ${url}`

### Requirement: 单线程串行下载
The system SHALL 一个一个下载资源，不允许并发

#### Scenario: 下载队列
- **WHEN** 下载资源队列
- **THEN** 文件 1 完成 → 文件 2 开始 → 文件 3 开始...

### Requirement: 强制物理自检
The system SHALL 在下载开始前检查磁盘空间

#### Scenario: 开始下载
- **WHEN** 开始下载资源
- **THEN** 打印 `RNFS.CachesDirectoryPath 空间：${freeSpace} bytes`

## MODIFIED Requirements
### Requirement: 下载循环逻辑
将并发下载改为串行下载，每个文件下载完成后才下载下一个

**修改内容**：
- 移除 `downloadWithConcurrencyLimit` 并发逻辑
- 改为 `for...of` 循环串行下载
- 每个文件下载完成后打印日志

## REMOVED Requirements
### Requirement: 并发下载优化
**Reason**: 并发下载导致问题难以诊断，先改为单线程确保下载正常
**Migration**: 后续可以再加回并发，但必须先确保单线程正常
