# Tasks

## 第一步：环境硬锁定 (Task 1-3)

- [ ] Task 1: SDK & NDK 硬锁定
  - [ ] SubTask 1.1: 修改 android/app/build.gradle 确保 targetSdkVersion = 35
  - [ ] SubTask 1.2: 修改 android/build.gradle 确保 ndkVersion = "27.1.12297006"

- [ ] Task 2: 16KB 编译参数注入
  - [ ] SubTask 2.1: 打开 android/build.gradle
  - [ ] SubTask 2.2: 在 allprojects 块中添加 arguments "-DANDROID_EXTRACT_NATIVE_LIBS=false"
  - [ ] SubTask 2.3: 在 allprojects 块中添加 arguments "-DANDROID_ALIGNED_AS_16KB=true"

- [ ] Task 3: Babel 配置修复
  - [ ] SubTask 3.1: 打开 babel.config.js
  - [ ] SubTask 3.2: 检查 react-native-reanimated/plugin 是否在 plugins 数组最后
  - [ ] SubTask 3.3: 如果不在最后，移动到最后位置

## 第二步：依赖与缓存重置 (Task 4-6)

- [ ] Task 4: 同步 Expo 51 依赖
  - [ ] SubTask 4.1: 运行 npx expo install --fix
  - [ ] SubTask 4.2: 检查 package.json 确认依赖版本同步

- [ ] Task 5: 彻底清空缓存
  - [ ] SubTask 5.1: 物理删除 android/app/build 目录
  - [ ] SubTask 5.2: 物理删除 node_modules/.cache 目录
  - [ ] SubTask 5.3: 执行 ./gradlew clean

- [ ] Task 6: 更新版本号到 1.3.12 (142)
  - [ ] SubTask 6.1: 修改 android/app/build.gradle 的 versionCode = 142 和 versionName = "1.3.12"
  - [ ] SubTask 6.2: 修改 package.json 的 version = "1.3.12"
  - [ ] SubTask 6.3: 修改 app.json 的 version = "1.3.12"

## 第三步：编译与物理自检 (Task 7-10)

- [ ] Task 7: 执行构建
  - [ ] SubTask 7.1: 运行 ./gradlew bundleGoogleRelease
  - [ ] SubTask 7.2: 检查编译是否成功

- [ ] Task 8: 16KB 物理验证
  - [ ] SubTask 8.1: 解压生成的 AAB 文件到临时目录
  - [ ] SubTask 8.2: 运行 check_so_align.sh 脚本检查所有 .so 文件
  - [ ] SubTask 8.3: 确认所有 .so 的 p_align = 0x4000
  - [ ] SubTask 8.4: 如果存在 4KB 对齐的 .so，输出错误报告

- [ ] Task 9: 重新签名 AAB
  - [ ] SubTask 9.1: 使用项目 keystore (my-release-key.keystore) 对 AAB 进行签名
  - [ ] SubTask 9.2: 运行 jarsigner -verify 确保输出 "jar 已验证"

- [ ] Task 10: 最终交付
  - [ ] SubTask 10.1: 将 AAB 文件移动到 Releases/GooglePlay/ 目录
  - [ ] SubTask 10.2: 输出 check_so_align.sh 的验证结果
  - [ ] SubTask 10.3: 输出 jarsigner 的验证结果
  - [ ] SubTask 10.4: 输出最终 AAB 文件路径

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 1, Task 2, Task 3, Task 4, Task 5, Task 6]
- [Task 8] depends on [Task 7]
- [Task 9] depends on [Task 8]
- [Task 10] depends on [Task 9]
