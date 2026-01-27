# 修复音频无声和高亮卡死问题

## 问题分析
1. 音频文件路径可能缺少 `asset:///` 前缀，导致无法正确加载本地文件
2. JS 层的 setTimeout 淡入/淡出循环导致状态更新延迟，造成高亮卡死
3. 原生调用可能阻塞后续的 setActiveSounds 执行

## 修复步骤

### 第 1 步：修复 playWithFade 函数
在 `src/hooks/useSuperpowered.js` 的 `playWithFade` 函数中：

1. **添加 asset:/// 前缀**：
   - 检查 `config.url`，如果是本地文件（不以 http 或 https 开头），则加上 `asset:///` 前缀
   - 示例：`rain.mp3` → `asset:///rain.mp3`

2. **删除 setTimeout 淡入循环**：
   - 删除第 67-78 行的淡入循环
   - 直接将 volume 设为 1.0

3. **确保原生调用不阻塞状态更新**：
   - 使用 Promise.all 确保原生调用完成后再更新状态
   - 或者在原生调用前立即更新状态

### 第 2 步：修复 stopWithFade 函数
在 `src/hooks/useSuperpowered.js` 的 `stopWithFade` 函数中：

1. **删除 setTimeout 淡出循环**：
   - 删除第 97-103 行的淡出循环
   - 直接停止播放

2. **确保原生调用不阻塞状态更新**：
   - 立即更新状态，不等待原生调用完成

### 第 3 步：验证修复
运行应用，验证：
1. 点击场景图标后，音频立即播放
2. 高亮状态立即更新，不再卡死
3. 音频文件正确加载并播放

## 预期结果
- 音频立即播放，无延迟
- 高亮状态立即更新，UI 响应流畅
- 本地文件正确加载（使用 asset:/// 前缀）