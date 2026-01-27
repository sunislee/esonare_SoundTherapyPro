## UI 布局重构方案

### 1. 引入 Animated 和 Pressable
- 添加 `Animated` 和 `Pressable` 导入
- 创建背景颜色动画状态

### 2. 背景呼吸动画
- 使用 `Animated.Value` 实现背景色平滑过渡
- 切换分类时触发颜色渐变动画（500ms 持续时间）

### 3. 分类选择器优化
- 选中状态：加粗字体 + 底部指示线（高度 3px）
- 未选中状态：降低透明度（opacity: 0.5）
- 增加间距优化（paddingHorizontal: 24）

### 4. 场景卡片化布局
- 将场景列表改为卡片容器
- 每个分类使用半透明背景：`backgroundColor: 'rgba(255, 255, 255, 0.15)'`
- 场景按钮改为圆角矩形：`borderRadius: 20`
- 添加微弱阴影：`shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }`

### 5. 按钮交互优化
- 使用 `Pressable` 替代 `TouchableOpacity`
- 添加 Animated 缩放反馈（按下时 scale: 0.95）
- 增加按钮尺寸适配高分辨率设备（width: 100, height: 90）

### 6. 间距优化
- 增加组件间距：`margin: 20`
- 优化触摸区域：`padding: 12`
- 适配 Redmi K80 Pro 的高分辨率