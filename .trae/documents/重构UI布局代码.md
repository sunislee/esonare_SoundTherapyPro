# 重构UI布局代码

## 问题分析
1. 容器设置了 `overflow: 'hidden'`，导致按钮被裁剪
2. 环形布局半径 `width * 0.65` 太大，按钮超出屏幕边界
3. 需要添加调试边框确认容器位置

## 修复方案
1. **移除 overflow: hidden**：
   - 从 container 样式中移除 `overflow: 'hidden'`

2. **调整环形布局半径**：
   - 将半径从 `width * 0.65` 减小到 `width * 0.35`
   - 确保按钮在屏幕内完整显示

3. **添加调试边框**：
   - 给 buttonLayer 添加 `borderWidth: 1, borderColor: 'red'`
   - 确认容器覆盖全屏

4. **优化层级结构**：
   - 背景层：纯黑背景，无 overflow 限制
   - 光晕层：绝对定位，透明度 0.1
   - 交互层：按钮容器覆盖全屏，zIndex 最高
   - 文字层：pointerEvents="none"