# Tasks

- [x] Task 1: 添加 Android 英文 strings.xml
  - [x] 创建 `android/app/src/main/res/values-en/strings.xml`
  - [x] 设置 app_name 为 "esonare"

- [x] Task 2: 添加 i18n 翻译键
  - [x] 在 `zh.json` 中添加 `notification.playingStatus: "正在深度疗愈中..."`
  - [x] 在 `en.json` 中添加 `notification.playingStatus: "Deep Healing in progress..."`
  - [x] 在 `ja.json` 中添加对应日文翻译
  - [x] 添加 `notification.channelDescription` 翻译

- [x] Task 3: 修改 NotificationService 使用 i18n
  - [x] 导入 i18next 实例
  - [x] 将硬编码中文替换为 `i18next.t()` 调用
  - [x] 修改 channelName、channelDescription、title、artist

- [x] Task 4: 验证国际化效果
  - [x] 安装应用到设备
  - [ ] 切换系统语言到英文
  - [ ] 验证通知栏显示英文
  - [ ] 切换回中文
  - [ ] 验证通知栏显示中文

# Task Dependencies

- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 1, Task 3]
