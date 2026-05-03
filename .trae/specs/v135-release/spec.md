# v1.3.5 (135) Release Spec

## Why
134 版本因 16KB 页面对齐问题（第三方 .so 库仍为 4KB 对齐）无法上传 Google Play。需要执行保底方案，降级到 targetSdkVersion 34 以绕过 16KB 强制要求，确保版本可以发布。

## What Changes
- 降级 targetSdkVersion 和 compileSdkVersion 到 34
- 移除 16KB 页面对齐的强制配置（恢复到稳定状态）
- 生成 v1.3.5 (135) 版本 AAB
- 调研社区 16KB 补丁方案（并行任务）

## Impact
- Affected specs: google-play-compliance, 16KB_PAGE_ALIGNMENT_ISSUE
- Affected code: android/build.gradle, android/app/build.gradle

## ADDED Requirements

### Requirement: v1.3.5 Release Build
The system SHALL provide a production-ready AAB file with targetSdkVersion 34 that can be uploaded to Google Play without 16KB alignment issues.

#### Scenario: Successful Google Play Upload
- **WHEN** AAB file is uploaded to Google Play Console
- **THEN** No 16KB page alignment errors
- **THEN** App installs and runs correctly on Android 14+ devices

### Requirement: Community Patch Research
The system SHALL search for React Native 0.73 community patches for 16KB page alignment (reanimated, expo-av).

#### Scenario: Patch Found
- **WHEN** patch-package or similar solution exists
- **THEN** document the patch source and application steps
- **THEN** test in separate branch

## MODIFIED Requirements

### Requirement: Target SDK Version
**Before**: targetSdkVersion = 35 (Android 15) - requires 16KB alignment  
**After**: targetSdkVersion = 34 (Android 14) - no 16KB requirement

**Reason**: Third-party libraries (expo-av, react-native-reanimated) do not yet support 16KB page alignment.

### Requirement: Build Configuration
**Before**: NDK r26 with 16KB linker flags  
**After**: Stable NDK configuration without 16KB flags

## REMOVED Requirements

### Requirement: 16KB Page Alignment Enforcement
**Reason**: Temporarily deferred until upstream libraries (expo, reanimated) provide official support.

**Migration**: 
1. Keep 16KB alignment code in documentation
2. Monitor upstream library updates
3. Re-enable when libraries support 16KB
