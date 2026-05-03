# Checklist

## 第一步：物理清除 `ReactNativeFeatureFlagsCxxInterop`
- [x] `ReactNativeFeatureFlagsCxxInterop.kt` 中不存在任何 `external` 关键字
- [x] `ReactNativeFeatureFlagsCxxInterop.kt` 中不存在 `@DoNotStrip` 注解
- [x] `ReactNativeFeatureFlagsCxxInterop.kt` 中不存在 `SoLoader` import
- [x] `ReactNativeFeatureFlagsCxxInterop.kt` 中不存在 `ensureLibraryLoaded()` 方法
- [x] 所有 Boolean 方法返回 `false`
- [x] 所有 Unit 方法返回 `Unit`
- [x] 所有 String? 方法返回 `null`

## 第二步：暴力覆盖 `ReactNativeFeatureFlagsCxxAccessor`
- [x] `ReactNativeFeatureFlagsCxxAccessor.kt` 中不存在 `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsCxxInterop`
- [x] 所有 Boolean 方法返回 `false`
- [x] 所有 Unit 方法返回 `Unit`
- [x] 所有 String? 方法返回 `null`

## 第三步：R8 保护
- [x] `android/app/proguard-rules.pro` 包含 `-keep class com.facebook.react.internal.featureflags.** { *; }`

## 第四步：补丁持久化与 16k 构建
- [x] `npx patch-package react-native` 执行成功
- [x] `patches/react-native+0.77.0.patch` 文件已更新
- [x] `./gradlew clean assembleGoogleRelease` 编译成功
- [x] `zipalign -P 16 -f 4` 对齐成功
- [x] APK 已使用 `my-release-key.keystore` 签名
- [x] `adb install -r` 安装成功
- [x] App 能正常启动并进入首屏
- [x] logcat 日志中没有 `SoLoaderDSONotFoundError`
