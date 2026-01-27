## Android APK 打包方案：离线运行版本

### 1. 检查 assets 目录
- 检查 `android/app/src/main/assets` 目录
- 确保音频文件能被正确离线引用
- 检查是否有必要的资源文件

### 2. 生成 debug keystore
- 使用 `keytool` 生成临时的 debug keystore
- 用于 APK 签名
- 设置密码和别名

### 3. 配置签名信息
- 配置 `android/gradle.properties`
- 配置 `android/app/build.gradle`
- 添加签名配置

### 4. 构建 release APK
- 运行 `./gradlew assembleRelease`
- 生成最终的 APK 文件
- 优化构建速度

### 5. 目标验证
- 拔掉数据线，App 依然能正常播放音乐
- 显示背景图
- 所有功能正常

完成后生成可离线运行的 APK 文件