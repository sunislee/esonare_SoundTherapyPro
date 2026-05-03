# 播放无声问题排查 Spec

## Why
用户反馈 UI 显示播放状态（isPlaying=true），但实际没有声音输出。需要系统性排查播放引擎不工作的原因，可能是路径前缀问题、播放器错误、状态机问题或路径编码问题。

## What Changes
- 在 AudioService 播放逻辑中添加路径前缀处理
- 增加播放器错误监听和日志输出
- 检查 AudioContext 状态机逻辑
- 验证 getLocalPath 返回路径的合法性

## Impact
- 受影响的服务：AudioService, AudioContext
- 影响范围：播放功能
- 用户可见：修复后应该能正常播放音频

## ADDED Requirements

### Requirement: 路径前缀测试
系统必须在播放时尝试添加 file:// 前缀：

#### Scenario: 播放音频
- **WHEN** 调用 TrackPlayer.load() 或 TrackPlayer.add()
- **THEN** 尝试给路径添加 `file://` 前缀（如果原路径没有）
- **THEN** 记录使用的路径格式

### Requirement: 播放错误监听
系统必须监听并记录所有播放错误：

#### Scenario: 播放失败
- **WHEN** 播放器触发 onError 事件
- **THEN** 打印详细的错误信息（包括错误类型、消息、堆栈）
- **THEN** 区分 Source Error 和 Codec Error

### Requirement: AudioContext 状态机检查
系统必须确保 Alert 关闭后状态正确：

#### Scenario: 资源下载完成后
- **WHEN** 用户点击"去下载"并完成下载
- **THEN** isPlaying 状态应该正确更新
- **THEN** 不应该被意外重置

### Requirement: 路径编码验证
系统必须验证路径不包含非法字符：

#### Scenario: 生成路径
- **WHEN** 调用 getLocalPath()
- **THEN** 返回的路径不能包含 undefined、null 等非法字符串
- **THEN** 路径应该是合法的 URI 格式

## MODIFIED Requirements

### Requirement: AudioService 播放逻辑
修改 AudioService 中调用 TrackPlayer 的方法，添加路径前缀处理：

```typescript
// 在 loadTrack 或 playScene 中
const uri = AUDIO_MAP[scene.filename];
// 强制添加 file:// 前缀（仅限播放时）
const playbackUri = uri.startsWith('file://') ? uri : `file://${uri}`;
console.log('[AudioService] 播放路径（带前缀）:', playbackUri);

await TrackPlayer.load({
  url: playbackUri,
  // ... 其他配置
});
```

### Requirement: AudioContext 状态管理
检查 AudioContext 中的状态更新逻辑，确保在资源下载完成后正确触发播放：

```typescript
// 在下载完成后
if (downloadComplete) {
  // 重新触发播放，而不是等待用户再次点击
  await audioService.playScene(scene);
}
```

## REMOVED Requirements
无

## 验收标准

### 检查清单
- [ ] 播放路径包含 file:// 前缀
- [ ] 播放器错误被捕获并记录
- [ ] AudioContext 状态机正确更新
- [ ] getLocalPath 返回合法路径
- [ ] 音频能够正常播放

## 调试步骤

1. **清除应用数据**：确保从头开始测试
2. **点击场景卡片**：触发播放
3. **查看 Logcat**：
   ```bash
   adb logcat | grep -E "AudioService|TrackPlayer|播放器错误|播放路径"
   ```
4. **对比路径**：
   - RNFS.exists 检查的路径
   - 传给 TrackPlayer 的路径
   - 两者是否一致

## 可能的问题

### 问题 1: 路径前缀不匹配
- RNFS.exists 不需要 file:// 前缀
- TrackPlayer 需要 file:// 前缀
- **解决**：在播放时强制添加前缀

### 问题 2: 状态机不同步
- Alert 关闭后没有重新触发播放
- **解决**：在下载完成后自动调用 playScene

### 问题 3: 路径包含非法字符
- AUDIO_MAP 生成时 category 为 undefined
- **解决**：已修复，确保传入正确的 category
