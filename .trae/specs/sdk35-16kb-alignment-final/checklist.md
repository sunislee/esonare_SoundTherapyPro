# Checklist

## 第一步：环境硬锁定
- [ ] android/app/build.gradle 中 targetSdkVersion = 35
- [ ] android/build.gradle 中 ndkVersion = "27.1.12297006"
- [ ] android/build.gradle 的 allprojects 块包含 "-DANDROID_EXTRACT_NATIVE_LIBS=false"
- [ ] android/build.gradle 的 allprojects 块包含 "-DANDROID_ALIGNED_AS_16KB=true"
- [ ] babel.config.js 中 react-native-reanimated/plugin 在 plugins 数组最后

## 第二步：依赖与缓存重置
- [ ] npx expo install --fix 执行成功
- [ ] android/app/build 目录已删除
- [ ] node_modules/.cache 目录已删除
- [ ] ./gradlew clean 执行成功

## 第三步：版本更新
- [ ] package.json 中 version = "1.3.12"
- [ ] app.json 中 version = "1.3.12"
- [ ] android/app/build.gradle 中 versionCode = 142
- [ ] android/app/build.gradle 中 versionName = "1.3.12"

## 第四步：编译与验证
- [ ] ./gradlew bundleGoogleRelease 编译成功
- [ ] AAB 文件已生成
- [ ] check_so_align.sh 验证所有 .so 的 p_align = 0x4000
- [ ] 不存在 p_align = 0x1000 的 .so 文件
- [ ] AAB 已使用 my-release-key.keystore 签名
- [ ] jarsigner -verify 输出 "jar 已验证"
- [ ] AAB 文件已移动到 Releases/GooglePlay/ 目录
