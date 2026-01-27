## 生成完全脱离电脑运行的 Android 独立版本

### 1. 资源预打包

* 执行 `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/`

* 把 require 的音频和 JS 代码离线化

### 2. 清理原生工程

* 进入 android 目录执行 `./gradlew clean`

### 3. 构建 Debug APK

* 执行 `./gradlew assembleDebug`

* 生成可安装的 APK 文件

### 4. 安装测试

* 使用 `adb install` 将生成的 APK 安装到手机

* 关闭电脑上的 Metro Server

### 5. 验证功能

* 测试音频播放

* 测试定时器功能

* 确认无需电脑连接即可运行

