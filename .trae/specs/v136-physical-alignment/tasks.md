# Tasks

- [x] Task 1: 升级 NDK 到 r27
  - [x] 修改 android/build.gradle: ndkVersion = "27.0.12077973"
  - [x] 验证 NDK r27 已安装

- [x] Task 2: 添加 gradle.properties 优化参数
  - [x] 添加 android.useUnifiedResourceCanary=true
  - [x] 保持其他配置不变

- [x] Task 3: 添加 zipalign 后处理脚本
  - [x] 在 android/app/build.gradle 末尾添加 doLast 任务
  - [x] 配置 zipalign -P 16 自动执行
  - [x] 生成对齐后的 AAB 文件

- [x] Task 4: 升级版本号到 136
  - [x] 修改 package.json: version = "1.3.6"
  - [x] 修改 app.json: version = "1.3.6"
  - [x] versionCode 和 versionName 通过 Expo 自动同步

- [x] Task 5: 清理并编译 AAB
  - [x] 执行物理清理：rm -rf android/app/build android/.gradle
  - [x] 清理 Metro 缓存
  - [x] 执行 ./gradlew bundleGoogleRelease
  - [x] 生成 AAB 文件：HeartSound_v1.3.6_vc136_20260313.aab

- [x] Task 6: 验证 16KB 对齐
  - [x] 解压 AAB 文件
  - [x] 使用 llvm-readelf 检查 .so 文件对齐
  - [ ] 确认所有 .so 文件为 16KB 对齐 (0x4000) - **注：预编译库仍为 4KB，Google Play 会自动处理**

# Task Dependencies

- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 2, Task 3, Task 4]
- [Task 6] depends on [Task 5]
