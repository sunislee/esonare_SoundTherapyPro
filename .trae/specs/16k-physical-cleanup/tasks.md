# Tasks

## 第一步：物理清除 `ReactNativeFeatureFlagsCxxInterop` (Task 1)

- [x] Task 1: 彻底"阉割" `ReactNativeFeatureFlagsCxxInterop.kt`
  - [x] SubTask 1.1: 打开 `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxInterop.kt`
  - [x] SubTask 1.2: 删除所有 `@DoNotStrip` 注解
  - [x] SubTask 1.3: 删除 `SoLoader` import 和 `ensureLibraryLoaded()` 方法
  - [x] SubTask 1.4: 将所有 `external fun` 改为普通方法，返回 `false` 或 `null` 或 `Unit`
  - [x] SubTask 1.5: 确保没有任何 `external` 关键字

## 第二步：暴力覆盖 `ReactNativeFeatureFlagsCxxAccessor` (Task 2)

- [x] Task 2: 移除 `ReactNativeFeatureFlagsCxxAccessor.kt` 对 `CxxInterop` 的所有引用
  - [x] SubTask 2.1: 打开 `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxAccessor.kt`
  - [x] SubTask 2.2: 删除 `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsCxxInterop`
  - [x] SubTask 2.3: 将所有方法改为直接返回固定值（Boolean 返回 `false`，Unit 返回 `Unit`，String? 返回 `null`）

## 第三步：添加 R8 保护规则 (Task 3)

- [x] Task 3: 在 `proguard-rules.pro` 中添加保留规则
  - [x] SubTask 3.1: 打开 `android/app/proguard-rules.pro`
  - [x] SubTask 3.2: 添加 `-keep class com.facebook.react.internal.featureflags.** { *; }`
  - [x] SubTask 3.3: 保存文件

## 第四步：补丁持久化与 16k 构建 (Task 4-7)

- [x] Task 4: 固化补丁
  - [x] SubTask 4.1: 执行 `npx patch-package react-native`
  - [x] SubTask 4.2: 验证 `patches/react-native+0.77.0.patch` 文件已更新

- [x] Task 5: 执行编译
  - [x] SubTask 5.1: 执行 `cd android && ./gradlew clean assembleGoogleRelease`
  - [x] SubTask 5.2: 确认编译成功

- [x] Task 6: 16k 对齐与签名
  - [x] SubTask 6.1: 执行 `zipalign -P 16 -f 4` 对齐 APK
  - [x] SubTask 6.2: 使用 `my-release-key.keystore` 签名

- [x] Task 7: 安装验证
  - [x] SubTask 7.1: 执行 `adb install -r` 安装 APK
  - [x] SubTask 7.2: 启动 App
  - [x] SubTask 7.3: 检查 logcat 日志，确认没有 `SoLoaderDSONotFoundError`
  - [x] SubTask 7.4: 确认 App 能进入首屏

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 1, Task 2, Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 6]
