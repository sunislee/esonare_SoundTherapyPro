# 16K SoLoader 崩溃修复 Spec

## Why
React Native 0.77 在 Android 15 (16k page size) 环境下启动时，尝试加载 `libreact_featureflagsjni.so` 失败，导致 `SoLoaderDSONotFoundError` 闪退。需要采用 Java 降级方案，强制使用 `ReactNativeFeatureFlagsLocalAccessor` 绕过 Native 库加载。

## What Changes
- **核心代码手术**：修改 `ReactNativeFeatureFlags.kt` 强制返回 `ReactNativeFeatureFlagsLocalAccessor()`
- **禁用 Native 加载**：注释掉 `ReactNativeFeatureFlagsCxxInterop.kt` 中的 `SoLoader.loadLibrary()` 调用
- **混淆保护**：在 `proguard-rules.pro` 中添加保留规则
- **补丁持久化**：执行 `npx patch-package react-native` 固化修改
- **16k 物理构建**：执行完整的 16k 对齐、签名、安装流程

## Impact
- Affected specs: 16k 适配、启动稳定性
- Affected code: 
  - `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlags.kt`
  - `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxInterop.kt`
  - `android/app/proguard-rules.pro`

## ADDED Requirements

### Requirement 1: 核心代码手术
系统必须修改 React Native 源码以强制使用 Java 降级方案。

#### Scenario 1.1: accessorProvider 修改
- **WHEN** 检查 `ReactNativeFeatureFlags.kt`
- **THEN** `accessorProvider` 返回 `ReactNativeFeatureFlagsLocalAccessor()` 而非 `ReactNativeFeatureFlagsCxxAccessor()`

#### Scenario 1.2: 禁用 Native 库加载
- **WHEN** 检查 `ReactNativeFeatureFlagsCxxInterop.kt`
- **THEN** `init` 块中的 `SoLoader.loadLibrary("react_featureflagsjni")` 已被注释掉
- **THEN** 不存在任何活跃的 `SoLoader.loadLibrary("react_featureflagsjni")` 调用

### Requirement 2: 补丁持久化
所有对 `node_modules` 的修改必须立即固化到 patch 文件。

#### Scenario 2.1: Patch 文件生成
- **WHEN** 执行 `npx patch-package react-native`
- **THEN** `patches/react-native+0.77.0.patch` 文件已更新
- **THEN** patch 文件包含 `ReactNativeFeatureFlags.kt` 和 `ReactNativeFeatureFlagsCxxInterop.kt` 的修改

### Requirement 3: 混淆保护
必须确保降级后的 Java 类不被 R8 剔除。

#### Scenario 3.1: ProGuard 规则添加
- **WHEN** 检查 `android/app/proguard-rules.pro`
- **THEN** 包含 `-keep class com.facebook.react.internal.featureflags.** { *; }`

### Requirement 4: 16k 物理构建流水线
必须执行完整的 16k 对齐、签名、安装流程。

#### Scenario 4.1: 编译
- **WHEN** 执行 `./gradlew clean assembleGoogleRelease`
- **THEN** 编译成功，生成 `app-google-release.apk`

#### Scenario 4.2: 16k 对齐
- **WHEN** 执行 `zipalign -P 16 -f 4`
- **THEN** 生成 `app-google-release-16k-manual.apk`

#### Scenario 4.3: 签名
- **WHEN** 使用 `my-release-key.keystore` 签名
- **THEN** 生成 `app-google-release-16k-signed-final.apk`

#### Scenario 4.4: 安装验证
- **WHEN** 执行 `adb install -r`
- **THEN** 安装成功
- **WHEN** 启动 App
- **THEN** 进入首屏且不报 `SoLoaderDSONotFoundError`

## Constraints

### Constraint 1: 严禁删除核心类
**禁止** 通过删除 `ReactNativeFeatureFlags` 及其关联 Accessor 类来解决报错。

### Constraint 2: 降级而非切除
如果 Native 库加载失败，统一采用"Java 降级方案"，即强制指向 `ReactNativeFeatureFlagsLocalAccessor`。

### Constraint 3: 先 Patch 后编译
所有对 `node_modules` 的修改必须在修改后立即执行 `npx patch-package react-native`。

### Constraint 4: 对齐参数锁定
`zipalign` 必须且只能使用 `-P 16 -f 4` 参数。
