# Checklist

## 第一步：核心代码手术
- [ ] `ReactNativeFeatureFlags.kt` 的 `accessorProvider` 返回 `ReactNativeFeatureFlagsLocalAccessor()`
- [ ] `ReactNativeFeatureFlags.kt` 的 `accessor` 使用 `by lazy { accessorProvider() }`
- [ ] `ReactNativeFeatureFlagsCxxInterop.kt` 的 `init` 块中的 `SoLoader.loadLibrary("react_featureflagsjni")` 已被注释掉
- [ ] 不存在任何活跃的 `SoLoader.loadLibrary("react_featureflagsjni")` 调用

## 第二步：补丁持久化与混淆保护
- [ ] `npx patch-package react-native` 执行成功
- [ ] `patches/react-native+0.77.0.patch` 文件已更新
- [ ] patch 文件包含 `ReactNativeFeatureFlags.kt` 的修改
- [ ] patch 文件包含 `ReactNativeFeatureFlagsCxxInterop.kt` 的修改
- [ ] `android/app/proguard-rules.pro` 包含 `-keep class com.facebook.react.internal.featureflags.** { *; }`

## 第三步：16k 物理构建流水线
- [ ] `./gradlew clean assembleGoogleRelease` 编译成功
- [ ] `app-google-release.apk` 已生成
- [ ] `zipalign -P 16 -f 4` 对齐成功
- [ ] `app-google-release-16k-manual.apk` 已生成
- [ ] APK 已使用 `my-release-key.keystore` 签名
- [ ] `app-google-release-16k-signed-final.apk` 已生成
- [ ] `adb install -r` 安装成功
- [ ] App 能正常启动并进入首屏
- [ ] logcat 日志中没有 `SoLoaderDSONotFoundError`
