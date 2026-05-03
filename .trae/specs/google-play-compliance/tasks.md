# Tasks

- [x] Task 1: 权限文件审计 - 检查并清理 AndroidManifest.xml
  - [x] SubTask 1.1: 读取 android/app/src/main/AndroidManifest.xml
  - [x] SubTask 1.2: 检查是否存在 MANAGE_EXTERNAL_STORAGE 或 WRITE_EXTERNAL_STORAGE
  - [x] SubTask 1.3: 如果存在，立即删除这些权限声明
  - [x] SubTask 1.4: 确认只保留 INTERNET 和 ACCESS_NETWORK_STATE 权限

- [x] Task 2: Target SDK 验证 - 确认 targetSdkVersion >= 34
  - [x] SubTask 2.1: 读取 android/app/build.gradle
  - [x] SubTask 2.2: 检查 targetSdkVersion 版本号
  - [x] SubTask 2.3: 如果 < 34，更新到 34

- [x] Task 3: 依赖库检查 - 检查 package.json
  - [x] SubTask 3.1: 读取 package.json
  - [x] SubTask 3.2: 检查是否有 react-native-permissions 或其他权限库
  - [x] SubTask 3.3: 如果有，检查是否在初始化时申请了不必要的权限

- [x] Task 4: 最终确认 - 输出权限清单
  - [x] SubTask 4.1: 读取最终的 AndroidManifest.xml
  - [x] SubTask 4.2: 提取所有 <uses-permission> 标签
  - [x] SubTask 4.3: 输出给用户确认

# Task Dependencies
- [Task 4] depends on [Task 1]
- [Task 4] depends on [Task 2]
