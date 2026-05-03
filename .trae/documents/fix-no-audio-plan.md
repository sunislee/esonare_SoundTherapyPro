# 播放无声问题排查与修复计划

## 问题现状
- TrackPlayer.add 成功
- 路径正确（包含 file:// 前缀）
- 文件存在（RNFS.exists 通过）
- 但没有声音输出

## 可能原因
1. TrackPlayer.play() 未被调用
2. 音量为 0
3. 播放器状态不正确（Buffering/Paused）
4. 下载完成后未触发自动播放

## 排查步骤

### 1. 强制播放测试
**目标**：确保 playScene 方法中 TrackPlayer.play() 被正确调用

**实施**：
- 在 `playScene` 方法的 `TrackPlayer.add` 成功后，强制调用 `await TrackPlayer.play()`
- 添加详细日志：`console.log('--- [强制执行播放] ---')`
- 打印播放器状态

### 2. 音量自检
**目标**：确保音量不是 0

**实施**：
- 在播放前强制调用 `await TrackPlayer.setVolume(1.0)`
- 打印当前音量值
- 确认音量设置成功

### 3. 状态监控
**目标**：确认播放器状态

**实施**：
- 调用 `await TrackPlayer.getState()` 获取当前状态
- 打印状态值（Buffering/Paused/Playing/None）
- 在播放前后分别检查状态

### 4. 检查下载回调
**目标**：确保下载完成后触发自动播放

**实施**：
- 检查 `ResourceDownloadScreen.tsx` 下载完成后的逻辑
- 确认 `navigation.goBack()` 后是否触发播放
- 如果没有，添加自动播放逻辑

## 修改文件清单

1. **SoundTherapy081/src/services/AudioService.ts**
   - 在 `playScene` 方法中添加强制播放逻辑
   - 添加音量自检
   - 添加状态监控日志

2. **SoundTherapy081/src/screens/ResourceDownloadScreen.tsx**
   - 检查下载完成后的回调
   - 添加自动播放逻辑（如果缺失）

## 验收标准

- [ ] playScene 方法中明确调用 TrackPlayer.play()
- [ ] 音量设置为 1.0
- [ ] 打印播放器状态（Playing）
- [ ] 下载完成后自动触发播放
- [ ] 能听到声音输出

## 预期日志输出

```
[AudioService] ====== 调用 TrackPlayer.add ======
[AudioService] ✅ TrackPlayer.add 成功
[AudioService] --- [强制执行播放] ---
[AudioService] 当前音量：1.0
[AudioService] 播放器状态：PLAYING(3)
[AudioService] ✅ 播放已启动，isActuallyPlaying = true
```
