# 部署英文Debug版本到Android真机

## 步骤1：确认英文配置
- 检查 `src/i18n/index.ts` 文件，确认 `lng` 和 `fallbackLng` 已设置为 `'en'`
- 验证结果：配置已正确设置，无需修改

## 步骤2：清理缓存
- 在终端执行：`cd android && ./gradlew clean && cd ..`
- 目的：清除之前的构建残留，确保新构建的代码能够正确部署

## 步骤3：重置Metro
- 执行：`npx react-native start --reset-cache`（在后台运行）
- 目的：清除Metro缓存，确保新的代码变更能够被正确识别

## 步骤4：真机部署
- 执行：`npx react-native run-android --variant=debug`
- 目的：检测连接的Android真机并部署Debug版本

## 步骤5：监控进度
- 密切关注构建过程中的错误信息
- 特别注意M1芯片的兼容性报错
- 如果遇到兼容性问题，立即停止并报告

## 预期结果
- App成功部署到Android真机
- App启动时显示英文界面
- 功能正常运行，无构建错误