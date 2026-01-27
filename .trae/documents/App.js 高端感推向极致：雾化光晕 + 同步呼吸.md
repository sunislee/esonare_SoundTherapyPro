## App.js 高端感推向极致：雾化光晕 + 同步呼吸

### 1. 光晕雾化
- 将背景 Animated.View 的尺寸加大到 500x500
- 将最高透明度限制在 0.12
- 要的是"雾气"而不是"色块"

### 2. 同步呼吸
- 添加一个新的动画变量 `borderOpacityAnim`
- 让选中按钮的 borderColor 也随 breatheAnim 变化
- 呼吸最深时边框透明度为 1，平时为 0.6

### 3. 排版微调
- RESONARE 标题：letterSpacing: 8, marginTop: 60
- 按钮矩阵容器：marginTop: 40

完成后立即生效，无需重新编译