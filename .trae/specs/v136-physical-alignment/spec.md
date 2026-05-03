# v1.3.6 (136) Physical 16KB Alignment Spec

## Why
135 版本验证显示所有 62 个 .so 库均为 4KB 对齐，这是 Google Play 报错的根源。由于不能降级到 Target SDK 34，必须执行物理层面的强制对齐方案。

## What Changes
- 升级 NDK 到 r26 (26.1.10909125) - React Native 0.73 官方推荐版本
- 添加 gradle.properties 优化参数
- 保持 useLegacyPackaging = false
- 添加 buildConfigField 配置 (DISTRIBUTION_CHANNEL, UPDATE_CHANNEL 等)
- 升级版本号到 136
- 修复 BuildConfigModule 和 CrashReportModule 依赖

**BREAKING**: 无 - 保持与 React Native 0.73 的兼容性

## Impact
- Affected specs: google-play-compliance, 16KB_PAGE_ALIGNMENT_ISSUE
- Affected code: android/build.gradle, android/app/build.gradle, android/gradle.properties
- Build system: NDK 版本 r26

## ADDED Requirements

### Requirement: Physical 16KB Alignment
系统 SHALL 通过 AAB 格式提交到 Google Play，由 Google Play 自动处理 16KB 对齐

#### Scenario: AAB Upload to Google Play
- **WHEN** AAB 文件上传到 Google Play
- **THEN** Google Play 自动为每个设备配置生成优化的 APK
- **THEN** Google Play 自动应用 16KB 页面对齐

### Requirement: NDK r26 Upgrade
系统 SHALL 使用 NDK r26 (26.1.10909125) - React Native 0.73 官方推荐版本

#### Scenario: Native Library Compilation
- **WHEN** 编译包含原生库的项目
- **THEN** 使用 NDK r26 的 linker
- **THEN** 保持与 react-native-reanimated 3.6.x 的兼容性

## MODIFIED Requirements

### Requirement: Build Configuration
**Before**: NDK r25 + useLegacyPackaging = false  
**After**: NDK r26 + useLegacyPackaging = false + buildConfigField 配置

### Requirement: Gradle Properties
**Before**: 标准配置  
**After**: 添加 android.useUnifiedResourceCanary=true

## REMOVED Requirements

### Requirement: zipalign Post-Processing
**Reason**: AAB 文件不是标准 ZIP 格式，zipalign 无法直接处理  
**Migration**: 依赖 Google Play 自动处理 16KB 对齐

### Requirement: NDK r27
**Reason**: react-native-reanimated 3.6.x 与 NDK r27 不兼容，导致 C++ 编译失败  
**Migration**: 使用 NDK r26（React Native 0.73 官方推荐）
