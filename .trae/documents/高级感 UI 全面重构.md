## 高级感 UI 重构方案

### 1. 修复 LinearGradient 报错
- 为 LinearGradient 的 colors 属性提供硬编码的默认值
- 防止映射失败：`colors={CATEGORY_CONFIG[selectedCategory]?.gradient || ['#1e3c72', '#2a5298']}`

### 2. 更新配色方案
- **Nature**：`['#1e3c72', '#2a5298']`（深邃蓝）
- **Psychology**：`['#667eea', '#764ba2']`（薰衣草紫）
- **Sleep**：`['#0f2027', '#203a43', '#2c5364']`（极夜黑）

### 3. 沉浸式背景
- 让渐变色铺满全屏，隐藏不必要的边框
- LinearGradient 使用 `start={{ x: 0, y: 0 }}` 和 `end={{ x: 1, y: 1 }}`
- 移除容器边框，营造全屏沉浸感

### 4. 磨砂玻璃卡片
- 将底部的场景按钮包裹在大卡片里
- 样式设置：`backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 30, padding: 20`
- 增加卡片标题和更清晰的视觉层次

### 5. 文字呼吸感
- 顶部 RESONARE 字体：`fontSize: 12, letterSpacing: 15, color: 'rgba(255, 255, 255, 0.6)'`
- 营造轻盈、通透的呼吸感

### 6. 消除拥挤
- 场景按钮之间增加 `margin: 10`
- 优化布局间距，避免按钮粘在一起
- 提升整体视觉舒适度