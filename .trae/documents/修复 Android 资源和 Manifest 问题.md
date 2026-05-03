# 修复 Android 资源和 Manifest 问题

## 问题分析
- 应用闪退，图标丢失
- 当前项目缺少 mipmap 文件夹和图标资源
- Manifest 文件包名与要求不符
- MainActivity 路径可能不正确

## 解决方案

### 1. 复制图标资源
- 从 `node_modules/react-native/template/android/app/src/main/res/` 复制所有 mipmap 文件夹到当前项目的 `SoundTherapyApp/android/app/src/main/res/` 目录
- 确保所有密度的图标文件都被正确复制

### 2. 修改 AndroidManifest.xml
- 将包名从 `com.soundtherapyapp` 改为 `com.esonare.soundtherapypro`
- 更新所有相关的包名引用，包括：
  - permission 名称
  - application android:name
  - activity android:name
  - provider authorities
- 确保应用图标引用正确

### 3. 清理和重新构建
- 运行 `./gradlew clean` 清理旧的构建缓存
- 使用 M1 专用指令重新安装：`~/.gradle/wrapper/dists/gradle-8.14.1-bin/*/gradle-8.14.1/bin/gradle installDebug`

### 4. 验证修复效果
- 确认应用能够正常启动
- 检查应用图标是否显示正确的紫色 React Native 图标
- 验证应用功能是否正常

## 技术要点
- 使用 node_modules 中的默认 React Native 图标资源
- 确保 Manifest 文件配置与包名完全匹配
- 清理旧的构建缓存以避免冲突
- 使用本地 Gradle 缓存加速构建过程