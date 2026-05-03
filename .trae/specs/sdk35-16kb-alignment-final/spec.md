# SDK 35 & 16KB 适配最终冲刺 Spec

## Why
Google Play 强制要求 Target SDK 35 和 16KB 页面对齐。必须彻底解决 16KB 合规问题，产出已签名的 AAB。

## What Changes
- 环境硬锁定：SDK 35 + NDK r27.1.12297006
- 16KB 编译参数注入
- Babel 配置修复
- 依赖同步与缓存清理
- 版本更新到 1.3.12 (142)
- 物理验证 16KB 对齐
- AAB 签名验证

## Impact
- Affected specs: Google Play 合规性、16KB 页面对齐
- Affected code: android/build.gradle, android/app/build.gradle, babel.config.js, package.json

## ADDED Requirements

### Requirement 1: 环境硬锁定
系统必须锁定 Target SDK 35 和 NDK r27.1.12297006，不允许降级。

#### Scenario: SDK 版本验证
- **WHEN** 检查 android/app/build.gradle
- **THEN** targetSdkVersion = 35
- **THEN** compileSdkVersion = 35

#### Scenario: NDK 版本验证
- **WHEN** 检查 android/build.gradle
- **THEN** ndkVersion = "27.1.12297006"

### Requirement 2: 16KB 编译参数注入
所有原生模块必须强制支持 16KB 对齐。

#### Scenario: 编译参数注入
- **WHEN** 检查 android/build.gradle 的 allprojects 块
- **THEN** 包含 arguments "-DANDROID_EXTRACT_NATIVE_LIBS=false"
- **THEN** 包含 arguments "-DANDROID_ALIGNED_AS_16KB=true"

### Requirement 3: Babel 配置修复
react-native-reanimated/plugin 必须放在 plugins 数组的最后一位。

#### Scenario: Babel 插件顺序
- **WHEN** 检查 babel.config.js
- **THEN** react-native-reanimated/plugin 是 plugins 数组的最后一个元素

### Requirement 4: 依赖同步
Expo 51 及其配套库版本必须同步。

#### Scenario: 依赖同步验证
- **WHEN** 运行 npx expo install --fix
- **THEN** 所有依赖版本对齐到 Expo 51

### Requirement 5: 缓存彻底清理
编译缓存必须彻底清空。

#### Scenario: 缓存清理验证
- **WHEN** 检查 android/app/build 目录
- **THEN** 目录不存在或为空
- **WHEN** 检查 node_modules/.cache 目录
- **THEN** 目录不存在或为空

### Requirement 6: 版本号更新
版本号必须更新为 1.3.12 (142)。

#### Scenario: 版本验证
- **WHEN** 检查 android/app/build.gradle
- **THEN** versionCode = 142
- **THEN** versionName = "1.3.12"
- **WHEN** 检查 package.json
- **THEN** version = "1.3.12"

### Requirement 7: .so 文件 16KB 对齐
所有 .so 文件的 p_align 必须是 0x4000 (16KB)。

#### Scenario: 物理验证
- **WHEN** 运行 check_so_align.sh 脚本
- **THEN** 所有 .so 文件的 p_align = 0x4000
- **THEN** 不存在 p_align = 0x1000 的 .so 文件

### Requirement 8: AAB 签名验证
AAB 文件必须使用项目 keystore 正确签名。

#### Scenario: 签名验证
- **WHEN** 运行 jarsigner -verify
- **THEN** 输出 "jar 已验证"

### Requirement 9: 最终交付
AAB 文件必须移动到 Releases/GooglePlay/ 目录。

#### Scenario: 文件交付验证
- **WHEN** 检查 Releases/GooglePlay/ 目录
- **THEN** 存在 HeartSound_v1.3.12_vc142_*.aab 文件
