## App.js 彻底重写：逻辑解耦 + 交互保护

### 1. 逻辑解耦
- 不要在背景 Animated.View 里动态计算 outputRange
- 定义两个状态：currentColor（当前场景色）和 nextColor（目标场景色）
- 当点击新场景时：
  - 将 nextColor 设为新场景色
  - 启动一个 Animated.timing 让背景透明度从 1 到 0（或颜色淡出）
  - 动画结束后，更新 currentColor，再让透明度回到 1

### 2. 交互层保护
- 必须给所有背景光晕 View 加上 pointerEvents="none" 和 zIndex: -1
- 确保 TouchableOpacity 容器拥有明确的 zIndex: 99

### 3. 视觉补全
- 保持 blurRadius: 150
- 按钮选中态：borderColor: '#FFFFFF', borderWidth: 2.5
- 未选中态：opacity: 0.5

### 4. 安全检查
- 在 renderScene 函数头部增加：if (!animatedValues.current[s.id]) return null; 防止由于 key 值闪变导致的崩溃

完成后立即生效，无需重新编译