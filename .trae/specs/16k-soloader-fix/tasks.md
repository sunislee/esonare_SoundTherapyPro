# Tasks

## 第一步：核心代码手术 (Task 1-2)

- [ ] Task 1: 修改 ReactNativeFeatureFlags.kt
  - [ ] SubTask 1.1: 打开 `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlags.kt`
  - [ ] SubTask 1.2: 将 `accessorProvider` 修改为返回 `ReactNativeFeatureFlagsLocalAccessor()`
  - [ ] SubTask 1.3: 确保 `accessor` 使用 `by lazy { accessorProvider() }`

- [ ] Task 2: 修改 ReactNativeFeatureFlagsCxxInterop.kt
  - [ ] SubTask 2.1: 打开 `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsCxxInterop.kt`
  - [ ] SubTask 2.2: 注释掉 `init` 块中的 `SoLoader.loadLibrary("react_featureflagsjni")` 调用
  - [ ] SubTask 2.3: 确保没有任何活跃的 `SoLoader.loadLibrary("react_featureflagsjni")` 调用

## 第二步：补丁持久化与混淆保护 (Task 3-4)

- [ ] Task 3: 固化补丁
  - [ ] SubTask 3.1: 执行 `npx patch-package react-native`
  - [ ] SubTask 3.2: 验证 `patches/react-native+0.77.0.patch` 文件已更新
  - [ ] SubTask 3.3: 确认 patch 文件包含 `ReactNativeFeatureFlags.kt` 和 `ReactNativeFeatureFlagsCxxInterop.kt` 的修改

- [ ] Task 4: 添加混淆保护
  - [ ] SubTask 4.1: 打开 `android/app/proguard-rules.pro`
  - [ ] SubTask 4.2: 添加 `-keep class com.facebook.react.internal.featureflags.** { *; }`
  - [ ] SubTask 4.3: 保存文件

## 第三步：16k 物理构建流水线 (Task 5-8)

- [ ] Task 5: 执行编译
  - [ ] SubTask 5.1: 执行 `cd android && ./gradlew clean assembleGoogleRelease`
  - [ ] SubTask 5.2: 确认编译成功，生成 `app-google-release.apk`

- [ ] Task 6: 16k 对齐
  - [ ] SubTask 6.1: 执行 `/Users/sunislee/Library/Android/sdk/build-tools/36.0.0/zipalign -P 16 -f 4` 对齐 APK
  - [ ] SubTask 6.2: 生成 `app-google-release-16k-manual.apk`

- [ ] Task 7: 签名
  - [ ] SubTask 7.1: 使用 `my-release-key.keystore` 对 APK 进行签名
  - [ ] SubTask 7.2: 生成 `app-google-release-16k-signed-final.apk`

- [ ] Task 8: 安装验证
  - [ ] SubTask 8.1: 执行 `adb install -r` 安装 APK
  - [ ] SubTask 8.2: 启动 App
  - [ ] SubTask 8.3: 检查 logcat 日志，确认没有 `SoLoaderDSONotFoundError`
  - [ ] SubTask 8.4: 确认 App 能进入首屏

# Task Dependencies
- [Task 3] depends on [Task 1, Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 3, Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 6]
- [Task 8] depends on [Task 7]
