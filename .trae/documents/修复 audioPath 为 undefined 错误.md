# 修复 audioPath 为 undefined 错误

## 问题分析
1. `config.url` 可能为 `undefined`，导致 `audioPath` 为 `undefined`
2. `setActiveSounds` 在 `await` 之后执行，导致 UI 高亮卡住
3. 路径处理逻辑可能不够健壮

## 修复步骤

### 第 1 步：修正变量定义和路径处理
在 `src/hooks/useSuperpowered.js` 的 `playWithFade` 函数中：

1. **修正变量定义**：
   - 将 `let audioPath = config.url;` 改为 `const audioPath = config.url || '';`
   - 添加 `undefined` 检查

2. **路径加固**：
   - 使用更健壮的路径处理逻辑
   - `const finalPath = audioPath.startsWith('http') ? audioPath : ('asset:///' + audioPath.replace(/^\//, ''));`

3. **移除阻塞**：
   - 将 `setActiveSounds` 移到 `await SuperpoweredModule.openScene` 之前
   - 确保立即更新状态，UI 高亮不会卡住

### 第 2 步：验证修复
运行应用，验证：
1. `audioPath` 不再为 `undefined`
2. 点击后立即高亮，UI 响应流畅
3. 音频正确播放

## 预期结果
- `audioPath` 不再为 `undefined`
- UI 高亮立即更新，不再卡死
- 音频正确播放