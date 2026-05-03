# Tasks

- [ ] Task 1: 引入原生语言检测
  - [ ] 导入 `I18nManager` 和 `Platform` from 'react-native'
  - [ ] 创建 `getSystemLocale()` 函数
  - [ ] 实现 locale 解析逻辑（zh/en/ja/other）

- [ ] Task 2: 重写 getSafeTranslation 函数
  - [ ] 移除 i18next 依赖
  - [ ] 实现 `isChinese = systemLocale.startsWith('zh')` 逻辑
  - [ ] 创建硬编码字符串映射表
  - [ ] 返回对应语言的字符串

- [ ] Task 3: 更新 NotificationService 所有文本
  - [ ] channelName 使用原生语言检测
  - [ ] channelDescription 使用原生语言检测
  - [ ] title 使用原生语言检测
  - [ ] artist 使用原生语言检测
  - [ ] playingStatus 使用原生语言检测

- [ ] Task 4: 强制同步 MediaSession
  - [ ] 确保 MediaMetadata 的 title 和 artist 永不为 null
  - [ ] 添加详细日志输出当前语言检测结果
  - [ ] 验证元数据更新成功

- [ ] Task 5: 清理并重新安装
  - [ ] 执行 `./gradlew clean`
  - [ ] 执行 `./gradlew installGoogleRelease`
  - [ ] 清理 Metro 缓存

- [ ] Task 6: 验证修复效果
  - [ ] 中文系统：灵动岛显示 "心声冥想 / 正在深度疗愈中..."
  - [ ] 英文系统：灵动岛显示 "esonare / Deep Healing in progress..."
  - [ ] 切换语言后自动刷新

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
