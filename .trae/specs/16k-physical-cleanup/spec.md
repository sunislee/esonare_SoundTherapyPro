# 16K 物理清除 CxxInterop Spec

## Why
React Native 0.77 在 Android 15 (16k page size) 环境下，`ReactNativeFeatureFlagsCxxInterop` 类的 `external` 方法导致 JVM 尝试加载 `libreact_featureflagsjni.so` 失败。需要彻底"阉割"这个类，将所有 `external` 方法改为普通方法并返回固定值，物理切断 JNI 库加载逻辑。

## What Changes
- **物理清除 `ReactNativeFeatureFlagsCxxInterop`**：删除所有 `external` 方法，改为返回 `false` 的普通方法
- **暴力覆盖 `ReactNativeFeatureFlagsCxxAccessor`**：移除所有对 `CxxInterop` 的引用，所有方法返回 `false`
- **R8 保护**：在 `proguard-rules.pro` 中添加保留规则，防止 R8 优化干扰
- **补丁持久化**：执行 `npx patch-package react-native` 固化修改
- **16k 物理构建**：执行完整的 16k 对齐、签名、安装流程

## Impact
- Affected specs: 16k 适配、启动稳定性
- Affected code: 
  - `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxInterop.kt`
  - `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxAccessor.kt`
  - `android/app/proguard-rules.pro`

## ADDED Requirements

### Requirement 1: 物理清除 `ReactNativeFeatureFlagsCxxInterop`
系统必须将 `ReactNativeFeatureFlagsCxxInterop` 类的所有 `external` 方法改为普通方法，返回固定值。

#### Scenario 1.1: 删除所有 `external` 方法
- **WHEN** 检查 `ReactNativeFeatureFlagsCxxInterop.kt`
- **THEN** 不存在任何 `external` 关键字
- **THEN** 所有方法都是普通方法，返回 `false` 或 `null` 或 `Unit`

#### Scenario 1.2: 移除 JNI 库加载逻辑
- **WHEN** 检查 `ReactNativeFeatureFlagsCxxInterop.kt`
- **THEN** 不存在 `SoLoader.loadLibrary()` 调用
- **THEN** 不存在 `ensureLibraryLoaded()` 方法
- **THEN** 不存在 `@DoNotStrip` 注解

### Requirement 2: 暴力覆盖 `ReactNativeFeatureFlagsCxxAccessor`
系统必须移除 `ReactNativeFeatureFlagsCxxAccessor` 对所有 `CxxInterop` 的引用。

#### Scenario 2.1: 移除 Import 引用
- **WHEN** 检查 `ReactNativeFeatureFlagsCxxAccessor.kt`
- **THEN** 不存在 `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsCxxInterop`

#### Scenario 2.2: 所有方法返回固定值
- **WHEN** 检查 `ReactNativeFeatureFlagsCxxAccessor.kt`
- **THEN** 所有 Boolean 方法返回 `false`
- **THEN** 所有 Unit 方法返回 `Unit`
- **THEN** 所有 String? 方法返回 `null`

### Requirement 3: R8 保护
必须在 `proguard-rules.pro` 中添加保留规则。

#### Scenario 3.1: ProGuard 规则
- **WHEN** 检查 `android/app/proguard-rules.pro`
- **THEN** 包含 `-keep class com.facebook.react.internal.featureflags.** { *; }`

### Requirement 4: 补丁持久化与 16k 构建
必须执行完整的补丁持久化和 16k 构建流程。

#### Scenario 4.1: Patch 文件生成
- **WHEN** 执行 `npx patch-package react-native`
- **THEN** `patches/react-native+0.77.0.patch` 文件已更新

#### Scenario 4.2: 16k 物理构建
- **WHEN** 执行 `./gradlew clean assembleGoogleRelease`
- **THEN** 编译成功
- **WHEN** 执行 `zipalign -P 16 -f 4` 和签名
- **THEN** 生成签名的 APK
- **WHEN** 执行 `adb install -r` 并启动 App
- **THEN** 进入首屏且不报 `SoLoaderDSONotFoundError`

## REMOVED Requirements

### Requirement: 旧的 Java 降级方案
**Reason**: 旧的方案只修改了 `accessor` 字段，但 R8 仍然保留了 `CxxInterop` 类的引用，导致 JNI 库加载失败。
**Migration**: 采用物理清除方案，彻底"阉割" `CxxInterop` 类。
