# Tasks

- [ ] Task 1: 降级 SDK 版本到 34
  - [ ] 修改 android/build.gradle: compileSdkVersion = 34
  - [ ] 修改 android/build.gradle: targetSdkVersion = 34
  - [ ] 验证配置稳定性

- [ ] Task 2: 清理 16KB 配置（恢复到稳定状态）
  - [ ] 移除 CMake 16KB linker flags
  - [ ] 保持 packagingOptions 配置
  - [ ] 保持 AndroidManifest.xml extractNativeLibs 配置

- [ ] Task 3: 升级版本号到 135
  - [ ] 修改 android/app/build.gradle: versionCode = 135
  - [ ] 修改 android/app/build.gradle: versionName = "1.3.5"
  - [ ] 修改 package.json: version = "1.3.5"

- [ ] Task 4: 清理并编译 AAB
  - [ ] 执行物理清理：rm -rf android/app/build android/.gradle
  - [ ] 执行 ./gradlew clean
  - [ ] 执行 ./gradlew bundleGoogleRelease
  - [ ] 执行 ./gradlew renameGoogleReleaseAab

- [ ] Task 5: 验证 AAB 文件
  - [ ] 确认 AAB 文件生成在 Releases/GooglePlay/
  - [ ] 验证版本号正确
  - [ ] 记录验证报告

- [ ] Task 6: 调研社区 16KB 补丁（并行）
  - [ ] 搜索 React Native 0.73 16KB page alignment patch
  - [ ] 搜索 reanimated 16KB support
  - [ ] 搜索 expo-av 16KB alignment
  - [ ] 记录调研结果

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] is parallel to all tasks
