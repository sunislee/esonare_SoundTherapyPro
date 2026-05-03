# Google Play 上架合规性检查 Spec

## Why
为确保 App 顺利通过 Google Play 审核，必须严格遵守 2026 年 Google Play 的权限政策和目标 SDK 要求。重点是移除不必要的外部存储权限，避免触碰"全文件管理"红线。

## What Changes
- 审计并清理 AndroidManifest.xml 中的权限声明
- 移除 MANAGE_EXTERNAL_STORAGE 和 WRITE_EXTERNAL_STORAGE 权限
- 确认 targetSdkVersion >= 34 (Android 14)
- 检查并移除不必要的权限申请库

## Impact
- Affected specs: Google Play 上架合规性
- Affected code: android/app/src/main/AndroidManifest.xml, package.json

## 合规性要求

### Requirement 1: 权限最小化原则
**核心要求**：由于使用 App 私有目录（Internal Storage）存储音频，不需要任何外部存储读写权限。

**允许的权限**：
- `android.permission.INTERNET` - 下载音频资源
- `android.permission.ACCESS_NETWORK_STATE` - 检查网络状态

**禁止的权限**：
- `android.permission.MANAGE_EXTERNAL_STORAGE` - 全文件管理权限（Google Play 红线）
- `android.permission.WRITE_EXTERNAL_STORAGE` - 外部存储写入（不需要）
- `android.permission.READ_EXTERNAL_STORAGE` - 外部存储读取（不需要）

### Requirement 2: Target SDK 要求
**目标 SDK**：targetSdkVersion 必须 >= 34 (Android 14)，符合 2026 年 Google Play 最新要求。

### Requirement 3: 依赖库合规性
**禁止的库**：
- react-native-permissions（如果申请了不必要的权限）
- 任何自动申请外部存储权限的库

## 验证场景

#### 场景 1: 权限文件审计
- **WHEN** 打开 android/app/src/main/AndroidManifest.xml
- **THEN** 只包含 INTERNET 和 ACCESS_NETWORK_STATE 权限
- **THEN** 不包含 MANAGE_EXTERNAL_STORAGE 或 WRITE_EXTERNAL_STORAGE

#### 场景 2: Target SDK 验证
- **WHEN** 检查 android/app/build.gradle
- **THEN** targetSdkVersion >= 34

#### 场景 3: 依赖库检查
- **WHEN** 检查 package.json
- **THEN** 不包含主动申请外部存储权限的库
