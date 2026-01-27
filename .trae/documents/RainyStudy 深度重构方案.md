# RainyStudy 深度重构执行计划

## 📋 五步走计划

### 第一步：备份与验证
- ✅ 备份当前 App.js 到 backup/ 目录
- ✅ 验证 Android 构建环境：cd android && ./gradlew clean

### 第二步：创建目录结构
- ✅ 创建 src/ 目录（hooks, constants, components, scenes, utils）

### 第三步：核心文件迁移（优先级最高）
- ✅ 创建 src/constants/scenes.js（四大场景配置）
- ✅ 创建 src/constants/sounds.js（所有音效元数据）
- ✅ 创建 src/hooks/useSuperpowered.js（核心音频管理，含单例+淡入淡出）
- ✅ 创建 src/hooks/useAnimations.js（动画管理）

### 第四步：UI 组件迁移
- 创建 src/components/ 通用组件
- 创建 src/scenes/ 四大场景组件

### 第五步：编译测试
- 执行 npx react-native run-android 确保编译通过

## 🎯 本次执行范围
仅执行前三步（备份、验证、核心文件迁移），完成后展示代码供您确认。