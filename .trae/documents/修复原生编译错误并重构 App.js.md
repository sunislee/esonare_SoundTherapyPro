## 修复原生编译错误并重构 App.js

### 1. 修复 android/settings.gradle
- 手动添加 react-native-linear-gradient 和 react-native-sound 的项目路径
- 确保 Autolinking 能正确找到这些库

### 2. 修复 android/app/build.gradle
- 在 dependencies 块中手动添加 implementation project 引用：
  ```gradle
  implementation project(':react-native-linear-gradient')
  implementation project(':react-native-sound')
  ```

### 3. 重构 App.js 为 UI 高级版
**简陋平铺布局：**
- 使用 LinearGradient 配合 StyleSheet.absoluteFill
- 全屏渐变背景

**毛玻璃效果：**
- 底部场景容器：`backgroundColor: 'rgba(255, 255, 255, 0.12)'`
- `borderRadius: 40`

**极简文字：**
- RESONARE 标题：`letterSpacing: 15`
- 倒计时：`fontWeight: '100'`

**稳健性：**
- LinearGradient 的 colors 属性加上默认数组兜底
- 使用 `|| ['#1e3c72', '#2a5298']` 防止 undefined 错误

### 4. 清理并重新构建
- 清理 Android 构建：`cd android && ./gradlew clean`
- 重新运行：`npm run android`