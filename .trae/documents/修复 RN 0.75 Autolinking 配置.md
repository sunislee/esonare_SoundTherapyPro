## 修复 React Native 0.75 Autolinking 问题

### 问题分析
React Native 0.75 使用新的 autolinking 机制，但配置不正确导致找不到 packageName。

### 解决方案
1. 检查 package.json 确认 react-native 和 gradle-plugin 版本
2. 更新 settings.gradle 使用 FAIL_ON_PROJECT_REPOS 模式
3. 更新 build.gradle 移除 allprojects，使用项目级 repositories
4. 正确配置 react-native.config.js
5. 重新生成 autolinking.json
6. 运行构建