## App.js 质感提升方案：高级视觉效果

### 1. 引入渐变伪造（Radial Mask）
- 在背景 Animated.View 之上，叠加一个全屏的 Animated.View
- 使用超大的圆形 View 配合 blurRadius 模糊处理
- 效果：屏幕中心会透出淡淡的场景色，而四周保持深黑，形成"隧道光"或"舞台灯"的深邃感

### 2. 动态光晕（Glow Effect）
- 为被选中的按钮底层放一个稍大一点的 Animated.View
- 让这个底层的光晕颜色跟随 breatheAnim 一起缩放和透明度变化
- 效果：选中的按钮不仅在跳动，还在向外发射淡淡的柔光

### 3. 色彩混合模式（Opacity Layering）
- 建立两层 Animated.View：底层永远是纯黑，顶层是场景色层
- 通过控制顶层的 opacity（0 到 0.2 之间），让色彩看起来是从黑暗中"渗"出来的

### 4. 文字细节
- 给 RESONARE 标题添加 textShadowColor，让它在深色背景下有微弱的悬浮感

完成后立即生效，无需重新编译