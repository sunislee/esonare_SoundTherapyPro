# 修复App启动闪退问题 - 完全静态版本

## 问题分析
App闪退是因为Animated动画在Android真机上存在兼容性问题，特别是涉及opacity变化的动画。

## 修复方案
1. **移除所有Animated动画**：完全使用静态UI，不使用任何Animated组件
2. **纯黑色背景**：设置backgroundColor: '#000000'
3. **文字绝对定位**：将RESONARE标题使用position: 'absolute'定位在屏幕正中心
4. **静态按钮样式**：按钮使用固定样式，不使用任何动画效果
5. **简化代码结构**：移除所有useRef和useEffect中的动画逻辑

## 修改后的代码结构
- 移除所有Animated导入
- SceneButton组件变为纯静态组件
- App组件移除所有动画相关代码
- 使用纯静态样式确保稳定运行