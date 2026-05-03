# 下载进度卡住修复 Spec

## Why
下载进度卡在 5% 不动，说明下载逻辑或进度更新逻辑存在问题，导致用户无法完成下载流程。

## What Changes
- 检查下载服务是否正常工作
- 检查进度更新逻辑是否正确
- 修复可能导致进度卡住的问题

## Impact
- Affected specs: 下载流程、进度更新逻辑
- Affected code: DownloadService.ts, ResourceDownloadScreen.tsx

## ADDED Requirements
### Requirement: 下载进度正常更新
The system SHALL 确保下载进度从 0% 到 100% 正常更新

#### Scenario: 下载过程
- **WHEN** 用户进入下载页面
- **THEN** 进度条应该从 0% 逐渐增长到 100%

### Requirement: 下载完成后跳转
The system SHALL 在所有文件下载完成后跳转到起名页

#### Scenario: 下载完成
- **WHEN** 所有 18 个文件下载完成
- **THEN** 进度条达到 100% 并跳转到起名页

## MODIFIED Requirements
无

## REMOVED Requirements
无
