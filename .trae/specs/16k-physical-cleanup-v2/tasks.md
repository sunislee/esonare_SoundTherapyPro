# Tasks
- [ ] Task 1: 物理删除编译中间产物
  - [ ] 删除 android/app/build/intermediates 文件夹
  - [ ] 删除 android/app/build/generated 文件夹
- [ ] Task 2: 移除 build.gradle 中的 exclude 规则
  - [ ] 移除 `exclude 'lib/**/libreact_featureflagsjni.so'`
- [ ] Task 3: 重新编译并验证
  - [ ] 执行编译（使用 --no-build-cache）
  - [ ] 检查 APK 中是否包含 libreact_featureflagsjni.so
  - [ ] 使用 file 命令检查 so 文件对齐属性
- [ ] Task 4: 安装并测试
  - [ ] 安装 APK
  - [ ] 启动 App 并验证是否崩溃

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
