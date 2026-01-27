## App.js 修复严重 Bug

### 1. 修复状态更新滞后
- 在 `handleToggle` 中，`setCurrentColor(nextColor)` 改为使用 `scene.color`
- 因为 `setNextColor` 是异步的，调用 `setCurrentColor` 时，`nextColor` 还是旧的值
- 应该直接使用 `scene.color`

### 2. 添加模糊滤镜
- 在样式 `ambientLight` 里添加 `blurRadius: 150`
- 没有模糊，它在屏幕中间就是一个生硬的实心色圆块，非常丑，完全没有"雾气感"

### 3. 添加呼吸动画循环
- 在 `useEffect` 中添加循环动画
- 让选中的按钮持续呼吸（从 1 到 1.03 再回到 1）
- 使用 `Animated.loop` 和 `Animated.sequence`

完成后立即生效，无需重新编译