## App.js 视觉优化方案：彻底解决视觉问题

### 1. 背景色重塑
- 将 backgroundColor 的插值范围改为：#000000 到场景颜色的超深版
- 使用 rgba(x, y, z, 0.15)
- 确保背景永远是偏黑的，绝不能亮到看不清字

### 2. 彻底解决灰色问题
- 确保当 currentId 为 null 时，动画值必须完全回到 0（纯黑）
- 严禁出现中间灰色

### 3. 按钮层级优化
- 被选中：backgroundColor: 'rgba(255,255,255,0.15)', borderColor: '#FFFFFF', borderWidth: 2
- 未选中：backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1

### 4. 文字对比度
- 无论背景如何变，标题和按钮文字必须保持 opacity: 1（选中）或 opacity: 0.6（未选中）

完成后立即生效，无需重新编译