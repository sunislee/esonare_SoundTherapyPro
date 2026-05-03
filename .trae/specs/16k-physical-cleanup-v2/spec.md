# 16k Physical Cleanup V2 - 强制清理编译产物并恢复 So 文件

## Why
当前编译系统缓存了旧的 ReactNativeFeatureFlagsCxxInterop 类，即使修改了 node_modules 源码，编译产物仍然包含尝试加载 libreact_featureflagsjni.so 的旧代码。同时，简单粗暴地 exclude 这个 so 文件导致了崩溃，需要改为确保它正确 16k 对齐。

## What Changes
- **物理删除**所有 intermediates 和 generated 编译产物
- **移除** build.gradle 中的 exclude 规则
- **恢复** libreact_featureflagsjni.so 到 APK 中
- **验证** so 文件的 16k 对齐属性

## Impact
- Affected specs: 16k 对齐、SoLoader 兼容性
- Affected code: build.gradle、编译中间产物

## REMOVED Requirements
### Requirement: Exclude libreact_featureflagsjni.so
**Reason**: 排除 so 文件导致 SoLoader 找不到库而崩溃，需要改为确保正确对齐
**Migration**: 移除 exclude 规则，允许 so 文件打包进 APK

## ADDED Requirements
### Requirement: 物理清理编译产物
The system SHALL 手动删除所有 intermediates 和 generated 文件夹，确保编译使用最新源码

#### Scenario: 清理成功
- **WHEN** 执行清理脚本
- **THEN** intermediates 和 generated 文件夹被完全删除

### Requirement: 验证 So 文件对齐
The system SHALL 使用 file 命令检查 libreact_featureflagsjni.so 的对齐属性

#### Scenario: 对齐验证
- **WHEN** 编译完成
- **THEN** so 文件显示 16k 对齐（16384 bytes）
