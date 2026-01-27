## 彻底重构 App.js 确保 LinearGradient 稳定

### 1. 定义稳健的常量
- 在文件顶层定义 THEMES 对象
- 包含固定颜色数组，避免动态映射
- 结构：
  ```javascript
  const THEMES = {
    nature: ['#1e3c72', '#2a5298'],
    psychology: ['#667eea', '#764ba2'],
    sleep: ['#0f2027', '#203a43', '#2c5364']
  };
  ```

### 2. 修复 LinearGradient 渲染逻辑
- 使用逻辑短路确保安全：`colors={THEMES[selectedCategory] || THEMES.nature}`
- 防止 undefined 错误

### 3. 彻底翻新 UI
**全屏背景：**
- LinearGradient 设置为 `StyleSheet.absoluteFill`
- 去掉任何外层边框
- 营造全屏沉浸感

**高级文字：**
- 顶部 RESONARE：`fontSize: 14, letterSpacing: 10, opacity: 0.6`
- 营造轻盈、通透的呼吸感

**卡片布局：**
- 将分类按钮和播放控制放在一个卡片里
- 样式：`backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 25, margin: 20`
- 磨砂感效果

**按钮美化：**
- 场景按钮去掉生硬的边框
- 改为半透明实色背景
- 保持图标和文字布局