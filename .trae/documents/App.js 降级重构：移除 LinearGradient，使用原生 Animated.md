## App.js 降级重构方案：移除 LinearGradient，使用原生 Animated

### 1. 移除 LinearGradient 依赖
- 删除 `import LinearGradient from 'react-native-linear-gradient';`
- 移除所有 LinearGradient 组件的使用

### 2. 背景颜色动画
- 使用 useRef 创建一个 Animated.Value(0)
- 当 currentId 改变时，触发 Animated.timing 平滑过渡
- 使用 .interpolate() 方法，将动画值映射到不同场景的颜色
  - 0 对应黑色
  - 1 对应当前场景的 color

### 3. 呼吸缩放效果
- 为正在播放的按钮（currentId === s.id）添加循环的缩放动画
- Scale 从 1 到 1.1 再回到 1

### 4. UI 降级
- 背景使用普通的 View，不需要渐变库
- 确保能够直接编译成功

完成后执行 `npm run android` 测试