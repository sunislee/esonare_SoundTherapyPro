# 交互音（小图标白噪音）无声问题修复 Spec

## Why
场景音已经完美播放，但交互音（小图标白噪音）仍然无声。经检查，AudioService 中的 `playAmbient`、`stopAllAmbient` 和 `toggleAmbience` 方法都是 TODO 状态，尚未实现。需要实现这些方法并确保交互音能正常播放。

**最新问题**：交互音逻辑已通，但点击时闪退。需要进行安全加固。

## What Changes
- 实现 `playAmbient(id)` 方法：使用 TrackPlayer 播放交互音
- 实现 `stopAllAmbient()` 方法：停止所有交互音
- 实现 `toggleAmbience(scene, targetState)` 方法：切换交互音播放状态
- 在交互音播放前强制设置音量为 1.0
- 添加详细的播放日志
- 确保 UI loading 动画在 State.Playing 时清除
- **安全加固**：
  - 队列安全检查：队列为空时不使用 index 0
  - 排他性检查：添加前检查 ID 是否已存在
  - State 预检：确保 TrackPlayer 完全初始化
  - 完整 try-catch 包裹，打印详细错误信息

## Impact
- 受影响的功能：交互音（小图标白噪音）播放
- 影响范围：所有交互音触发场景（BreathDetailScreen 等）
- 用户可见：交互音能正常播放，不再闪退

## ADDED Requirements

### Requirement: 交互音播放日志
系统必须在交互音播放时添加详细日志：

#### Scenario: 触发交互音
- **WHEN** 用户点击交互音图标
- **THEN** 打印 `--- [尝试播放交互音] ---` 和音轨名称
- **THEN** 打印当前音量、播放状态

### Requirement: 交互音音量控制
系统必须在交互音播放前强制设置音量：

#### Scenario: 播放交互音
- **WHEN** 调用交互音播放方法
- **THEN** 先调用 `await TrackPlayer.setVolume(1.0)`
- **THEN** 再添加音轨并播放

### Requirement: Loading 状态强制清除
系统必须在检测到 State.Playing 时清除 loading：

#### Scenario: 播放状态变更
- **WHEN** TrackPlayer 状态变为 `playing`
- **THEN** 强制设置 `setIsLoading(false)`
- **THEN** 打印日志确认 loading 已清除

### Requirement: 交互音队列管理
交互音必须使用独立的 ID 管理，不与场景音冲突：

#### Scenario: 添加交互音
- **WHEN** 播放交互音时
- **THEN** 使用 `small_${scene.id}` 作为音轨 ID
- **THEN** 添加到队列前端（index 0）
- **THEN** 记录到 `activeSmallScenes` Set 中

## MODIFIED Requirements

### Requirement: playAmbient 方法实现
实现 AudioService 中的 playAmbient 方法：

```typescript
async playAmbient(id: string): Promise<void> {
  if (!this._isReady) {
    console.warn('[AudioService] ⚠️ 初始化未完成，跳过 playAmbient');
    return;
  }
  
  console.log('--- [尝试播放交互音] ---', id);
  
  // 查找对应的场景配置
  const scene = SCENES.find(s => s.id === id);
  if (!scene || !scene.filename) {
    console.error('[AudioService] ❌ 交互音场景未找到:', id);
    return;
  }
  
  const uri = AUDIO_MAP[scene.filename];
  if (!uri) {
    console.error('[AudioService] ❌ 交互音资源未找到:', scene.filename);
    return;
  }
  
  try {
    // 【关键】强制设置音量为 1.0
    await TrackPlayer.setVolume(1.0);
    console.log('[AudioService] ✅ 交互音音量已设置为 1.0');
    
    // 添加到队列前端
    await TrackPlayer.add([{
      id: `small_${id}`,
      url: uri,
      title: scene.title,
      artist: '心声冥想 - 交互音',
    }], 0); // index 0 表示队列前端
    
    console.log('[AudioService] ✅ 交互音已添加到队列前端');
    
    // 播放
    await TrackPlayer.play();
    console.log('[AudioService] ✅ 交互音播放开始');
    
    // 记录到 activeSmallScenes
    this.activeSmallScenes.add(id);
    this.notifySmallScenes();
  } catch (error: any) {
    console.error('[AudioService] ❌ playAmbient 失败:', error);
    throw error;
  }
}
```

### Requirement: stopAllAmbient 方法实现
实现 AudioService 中的 stopAllAmbient 方法：

```typescript
async stopAllAmbient(): Promise<void> {
  if (!this._isReady) {
    console.warn('[AudioService] ⚠️ 初始化未完成，跳过 stopAllAmbient');
    return;
  }
  
  console.log('[AudioService] 🛑 停止所有交互音');
  
  try {
    // 移除所有 small_ 开头的音轨
    const queue = await TrackPlayer.getQueue();
    for (const track of queue) {
      if (track.id?.startsWith('small_')) {
        await TrackPlayer.remove([track.id]);
      }
    }
    
    // 清空 activeSmallScenes
    this.activeSmallScenes.clear();
    this.notifySmallScenes();
    
    console.log('[AudioService] ✅ 所有交互音已停止');
  } catch (error: any) {
    console.error('[AudioService] ❌ stopAllAmbient 失败:', error);
    throw error;
  }
}
```

### Requirement: toggleAmbience 方法实现
实现 AudioService 中的 toggleAmbience 方法：

```typescript
async toggleAmbience(scene: Scene, targetState: boolean): Promise<void> {
  if (!this._isReady) {
    console.warn('[AudioService] ⚠️ 初始化未完成，跳过 toggleAmbience');
    return;
  }
  
  console.log('--- [切换交互音] ---', scene.id, 'targetState:', targetState);
  
  try {
    if (targetState) {
      // 播放交互音
      await this.playAmbient(scene.id);
    } else {
      // 停止单个交互音
      const trackId = `small_${scene.id}`;
      const queue = await TrackPlayer.getQueue();
      const track = queue.find(t => t.id === trackId);
      
      if (track) {
        await TrackPlayer.remove([trackId]);
        console.log('[AudioService] ✅ 交互音已停止:', scene.id);
      }
      
      this.activeSmallScenes.delete(scene.id);
      this.notifySmallScenes();
    }
  } catch (error: any) {
    console.error('[AudioService] ❌ toggleAmbience 失败:', error);
    throw error;
  }
}
```

### Requirement: AudioProvider 状态监听
在 AudioProvider 的状态监听器中添加 loading 清除逻辑：

```typescript
if (state.state === 'playing') {
  console.log('[AudioContext] ✅ 检测到 State.Playing，清除 loading');
  // 通知 UI 层清除 loading
}
```

## REMOVED Requirements
无

## 验收标准

### 检查清单
- [ ] 交互音播放时打印详细日志
- [ ] 交互音播放前设置音量为 1.0
- [ ] 交互音能正常播放（有声音）
- [ ] State.Playing 时 loading 动画清除
- [ ] 场景音和交互音不冲突

## 调试步骤

1. **点击交互音图标**：触发小场景音播放
2. **查看 Logcat**：
   ```bash
   adb logcat | grep -E "交互音|小场景|smallScene|setVolume"
   ```
3. **确认播放**：
   - 检查是否调用 `addSmallScene`
   - 检查音量设置
   - 检查播放状态

## 可能的问题

### 问题 1: 音量被覆盖
- 场景音播放后音量被重置
- **解决**：在交互音播放前重新设置音量

### 问题 2: 队列冲突
- 交互音被添加到队列末尾
- **解决**：使用 `TrackPlayer.add(track, 0)` 添加到队列前端

### 问题 3: 播放器状态不对
- 播放器处于 paused 状态
- **解决**：先调用 `TrackPlayer.play()` 再添加交互音
