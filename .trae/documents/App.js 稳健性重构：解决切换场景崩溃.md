## App.js 稳健性重构：解决崩溃问题

### 1. 锁定插值范围
- 不要动态生成 outputRange
- 固定背景色插值为 [0, 1]
- 0 对应纯黑 #000000，1 对应 activeColor

### 2. 切换逻辑优化
- 切换场景时，先通过 Animated.timing 把背景变回 0（黑）
- 更新 activeColor 后，再弹回 1
- 这样绝对不会报错

### 3. 防御性编程
- 在所有用到 animatedValues.current[s.id] 的地方
- 必须加上 if (!animatedValues.current[s.id]) return null; 的判断

### 4. 彻底释放交互层
- 确保背景光晕 View 加上 pointerEvents="none" 属性
- 并且 zIndex 设置为 -1

### 5. 清理渲染闭包
- 确保 useEffect 监听 currentId 时
- 内部的动画有 .start() 且没有逻辑死循环

完成后立即生效，无需重新编译