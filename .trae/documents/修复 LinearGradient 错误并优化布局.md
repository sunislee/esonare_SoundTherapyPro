## 修复 LinearGradient 错误并优化布局

### 1. 修复 LinearGradient colors 属性
- 给 LinearGradient 的 colors 属性添加默认值
- 使用 `backgroundColor || ['#1a1a2e', '#4A90E2']` 作为后备值
- 防止在分类切换瞬间出现 undefined

### 2. 检查数据一致性
- 确保 CATEGORY_CONFIG 的 key 与 selectedCategory 状态匹配
- 当前 keys：'Nature', 'Psychology', 'Sleep'
- selectedCategory 初始值：'Nature'（匹配）

### 3. 优化场景按钮布局
- 场景按钮改为半透明磨砂感：`backgroundColor: 'rgba(255, 255, 255, 0.1)'`
- 增加外边距：`margin: 16`，避免按钮贴在一起
- 优化间距和布局，让界面更透气

### 4. 调试日志
- 添加 console.log 输出 selectedCategory 和 backgroundColor 的值
- 便于排查问题