# 解决 TrackPlayer buffering 问题计划

## 问题现状
- TrackPlayer.add 成功
- TrackPlayer.play 被调用
- 但状态一直卡在 `buffering`，无法进入 `playing`
- 没有声音输出

## 根本原因分析
1. **文件句柄未释放**：下载完成后文件可能还被占用
2. **文件索引未刷新**：Android 系统需要时间刷新文件索引
3. **路径不匹配**：下载的文件名和播放器找的文件名可能对不上
4. **引擎缓存错误**：TrackPlayer 可能有之前的错误缓存

## 解决方案

### 1. 增加下载完成严格判定
**目标**：确保 RNFS.downloadFile 的 promise 彻底 resolve，并且文件完全落盘

**实施**：
- 在 `DownloadService.ts` 中，确保 `RNFS.moveFile` 完成后才 resolve promise
- 添加 `await RNFS.sync()` 确保文件写入完成
- 增加文件存在性验证

### 2. 延迟播放策略
**目标**：给 Android 系统时间刷新文件索引和释放文件句柄

**实施**：
- 在下载完成跳转到主页后，增加 500ms 的 setTimeout
- 在 `App.tsx` 或 `AudioService` 中实现延迟播放逻辑
- 添加日志：`console.log('等待文件句柄释放...')`

### 3. 二次路径确认
**目标**：确保下载的文件名和播放器找的文件名完全匹配

**实施**：
- 在 `playScene` 方法中，调用 `play()` 之前再次检查文件存在性
- 使用 `await RNFS.exists(finalUri)` 验证
- 如果不存在，打印详细的路径对比日志

### 4. 强制重置引擎
**目标**：清空 TrackPlayer 的错误缓存

**实施**：
- 在 `TrackPlayer.add()` 之前调用 `await TrackPlayer.reset()`
- 清空播放队列
- 确保从干净状态开始

## 修改文件清单

1. **SoundTherapy081/src/services/DownloadService.ts**
   - 确保 `RNFS.moveFile` 完成后才 resolve
   - 添加 `await RNFS.sync()` 调用

2. **SoundTherapy081/src/services/AudioService.ts**
   - 在 `playScene` 方法中添加延迟播放逻辑
   - 在 `play()` 之前再次检查文件存在性
   - 在 `add()` 之前调用 `TrackPlayer.reset()`

3. **SoundTherapy081/src/screens/ResourceDownloadScreen.tsx**
   - 已有 `resourcesDownloaded` 标志位
   - 可能需要增加延迟跳转逻辑

## 验收标准

- [ ] 下载完成后文件完全落盘
- [ ] 延迟 500ms 后触发播放
- [ ] 播放前文件存在性验证通过
- [ ] TrackPlayer 状态从 buffering → playing
- [ ] 有声音输出

## 预期日志输出

```
[DownloadService] ✅ 文件下载完成，开始 moveFile
[DownloadService] ✅ moveFile 完成，调用 sync()
[DownloadService] ✅ sync 完成，文件完全落盘
[ResourceDownloadScreen] ✅ 已设置 resourcesDownloaded 标志位
[AudioService] 检测到资源已下载，准备播放
[AudioService] 等待 500ms 确保文件句柄释放...
[AudioService] 调用 TrackPlayer.reset()
[AudioService] 二次路径验证：文件存在
[AudioService] [1/3] 调用 TrackPlayer.seekTo(0)
[AudioService] [2/3] 调用 TrackPlayer.setVolume(1.0)
[AudioService] [3/3] 调用 TrackPlayer.play()
[AudioService] 播放后状态：playing (3)
[AudioService] ✅ 播放已启动
```

## 调试步骤

1. **清除应用数据**：确保从头开始测试
2. **触发下载**：点击场景卡片 → 点击"去下载"
3. **等待下载完成**：看到"资源准备完成"提示
4. **等待自动跳转**：跳转到 NameEntry 页面
5. **查看日志**：确认延迟播放和状态变化
6. **验证声音**：确认有声音输出
