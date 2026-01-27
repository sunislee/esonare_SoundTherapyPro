## 沉浸式 UI 重构方案

### 1. 安装依赖
- 安装 `react-native-linear-gradient`：`npm install react-native-linear-gradient`
- 该库用于实现深度渐变背景效果

### 2. 背景升级
- 引入 `LinearGradient` 组件
- 为三个分类设计深度渐变：
  - Nature：`['#1a1a2e', '#2d3748', '#4A90E2']`（深蓝渐变）
  - Psychology：`['#1a1a2e', '#4a3f52', '#F5A623']`（深橙渐变）
  - Sleep：`['#1a1a2e', '#3d2a4a', '#9B59B6']`（深紫渐变）
- 使用 `Animated` 实现背景色过渡，持续时间 1.5 秒（1500ms）

### 3. 毛玻璃效果
- 场景容器使用半透明遮罩：`backgroundColor: 'rgba(255, 255, 255, 0.12)'`
- 添加微弱阴影：`shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }`
- 营造悬浮感和深度感

### 4. 布局重组
**顶部：**
- 标题 RESONARE 透明化：`opacity: 0.7`
- 字间距加大到 20：`letterSpacing: 20`

**中间：**
- 倒计时数字使用纤细字体：`fontWeight: '200'`
- 去掉周围圈圈，只保留数字
- 增加优雅的间距和布局

**底部：**
- 分类 Tab 改为纯文字切换
- 选中文字有呼吸感缩放：`transform: [{ scale: 1.1 }]`
- 未选中文字低透明度：`opacity: 0.4`

### 5. 图标化
- 为主要场景添加简单的 SVG 图标
- 图标与场景名称并排显示
- 图标使用简洁的线条风格

### 6. 动画优化
- 背景切换使用 `Animated.timing`，duration: 1500ms
- 文字切换使用 `Animated.spring`，营造呼吸感
- 所有动画使用 `useNativeDriver: false`