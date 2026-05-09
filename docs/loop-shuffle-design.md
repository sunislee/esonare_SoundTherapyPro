# 🔄 Loop & Shuffle 逻辑设计文档

> **分支**: `feature/audio-loop-experiment`
> **创建时间**: 2026-05-09
> **状态**: 实验中（本地测试，未推送）

---

## 一、架构概览

```
┌─────────────────────────────────────────────────────┐
│                    用户交互层                         │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  ImmersivePlayer  │  │      HomeScreen          │ │
│  │  🔁 toggleLoop() │  │  🎲 handleShuffle()      │ │
│  │  🎭 toggleRoaming│  │                          │ │
│  └────────┬─────────┘  └──────────┬───────────────┘ │
│           │                        │                 │
│           ▼                        ▼                 │
│  ┌────────────────────────────────────────────────┐ │
│  │            AudioService (核心引擎)              │ │
│  │  ┌─────────────┐  ┌─────────────────────────┐  │ │
│  │  │ applyLoopMode│  │ forceRepeatModeForRoaming│  │ │
│  │  │ ()          │  │ ()                      │  │ │
│  │  └──────┬──────┘  └────────────┬────────────┘  │ │
│  │         │                      │                │ │
│  │         ▼                      ▼                │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │         TrackPlayer (底层)               │  │ │
│  │  │  RepeatMode.Off / RepeatMode.Track       │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 二、两种模式定义

### 1️⃣ **Loop（单场景循环）**
- **触发位置**: `ImmersivePlayerNew.tsx` — 底部 🔁 按钮
- **默认状态**: **关闭** (`isLooping = false`)
- **行为**: 同一音频播放结束后自动重播
- **底层实现**: `TrackPlayer.setRepeatMode(RepeatMode.Track)`

### 2️⃣ **Shuffle / Roaming（随机漫游）**
- **触发位置**: 
  - `HomeScreen.tsx` — 分类旁 🎲 按钮
  - `ImmersivePlayerNew.tsx` — toggleRoaming()
- **默认状态**: 关闭 (`isRoaming = false`)
- **行为**: 音频结束后自动切换到同分类的下一个随机场景
- **底层实现**: `SceneRoamManager` + `RepeatMode.Off`

---

## 三、状态矩阵

| 场景 | Loop | Shuffle/Roaming | RepeatMode | 行为 |
|------|:----:|:----------------:|:----------:|------|
| 默认进入场景 | ❌ OFF | ❌ OFF | **Off** | 播放一次后停止 |
| 用户点击 🔁 | ✅ ON | ❌ OFF | **Track** | 单曲循环 |
| 用户点击 🎲 | ❌ OFF* | ✅ ON | **Off** | 漫游切换场景 |
| 🎲 激活后再点 🔁 | ✅ ON | ✅ ON | **Off** | 漫游优先，循环忽略 |
| 🔁 激活后再点 🎲 | ❌ OFF* | ✅ ON | **Off** | 漫游优先，循环关闭 |

> *注：UI 上 Loop 按钮可能仍显示激活态，但实际 RepeatMode 被 Roaming 强制覆盖为 Off

---

## 四、代码实现细节

### 4.1 AudioService 核心方法

#### `applyLoopMode(isRoaming: boolean)` — 公共 API
```typescript
// 文件: src/services/AudioService.ts (L554-573)
async applyLoopMode(isRoaming: boolean): Promise<void> {
  if (isRoaming) {
    await TrackPlayer.setRepeatMode(RepeatMode.Off);  // 漫游→关循环
  } else {
    await TrackPlayer.setRepeatMode(RepeatMode.Track); // 非漫游→开循环
  }
}
```

#### `forceRepeatModeOffForRoaming()` — 全局拦截器
```typescript
// 文件: src/services/AudioService.ts (L599-628)
// 在 playScene/play 完成后被调用
// 漫游模式 → 强制 Off + 启动轮询/进度监听
// 非漫游模式 → 不干预（保持用户设置的 Loop 状态）
private async forceRepeatModeOffForRoaming() {
  const isRoaming = sceneRoamManager.getIsRoaming();
  if (isRoaming) {
    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    this.startRoamPolling();
    this.startProgressMonitor();
  } else {
    // 不设置 RepeatMode，保留用户通过 UI 按钮设置的状态
    this.stopRoamPolling();
    this.stopProgressMonitor();
  }
}
```

#### `playScene()` — 场景播放入口
```typescript
// 文件: src/services/AudioService.ts (L1240-1258)
// 【关键】默认始终设为 Off！
// 用户必须手动点击 🔁 按钮才能激活循环
await TrackPlayer.setRepeatMode(RepeatMode.Off);
console.log(`[AudioService] [playScene] RepeatMode=Off (用户需手动激活循环)`);
```

#### `Ended / QueueEnded` 事件 — 循环检测
```typescript
// 文件: src/services/AudioService.ts (L322-330, L354-370)
// 当音频播放结束时：
if (!isRoaming) {
  const currentMode = await TrackPlayer.getRepeatMode();
  if (currentMode === RepeatMode.Track) {
    console.log('[AudioService] 🔁 [Ended] 单场景循环 → 自动重播');
    return; // 保持播放状态，不设 isActuallyPlaying=false
  }
}
// 非 Track 模式 → 正常停止
this.isActuallyPlaying = false;
this.notifyListeners();
```

---

### 4.2 UI 层实现

#### ImmersivePlayerNew — Loop 按钮
```typescript
// 文件: src/screens/ImmersivePlayerNew.tsx

// 状态定义 (L98)
const [isLooping, setIsLooping] = useState(false); // 默认关闭！

// 切换函数 (L555-567)
const toggleLoop = useCallback(async () => {
  triggerHaptic();
  const newLoopState = !isLooping;
  setIsLooping(newLoopState);
  
  const audioService = AudioService.getInstance();
  // isRoaming=true → Off, newLoopState=false → Off, 只有两者都false才Track
  await audioService.applyLoopMode(isRoaming || !newLoopState);
}, [isLooping, isRoaming]);

// UI 渲染 (L678-693) — 位于播放按钮上方左侧
<TouchableOpacity
  style={[styles.loopButton, isLooping && styles.loopButtonActive]}
  onPress={toggleLoop}
>
  <Icon
    name={isLooping ? "repeat" : "repeat-outline"}
    size={22}
    color={isLooping ? "#6C5DD3" : "rgba(255,255,255,0.5)"}
  />
</TouchableOpacity>
```

#### HomeScreen — Shuffle 按钮
```typescript
// 文件: src/screens/HomeScreen.tsx (L636-685)

const handleShuffle = useCallback((category) => {
  if (shufflingCategory === category) {
    // 停止漫游 → 恢复单场景循环
    sceneRoamManager.stopRoaming();
    setShufflingCategory(null);
    audioService.applyLoopMode(false); // ← 尝试恢复循环
    return;
  }
  
  // 启动漫游 → 关闭循环
  sceneRoamManager.startRoaming(category);
  setShufflingCategory(category);
  audioService.applyLoopMode(true); // ← 强制关闭循环
  
  // 切换到随机场景...
}, [...]);
```

---

## 五、数据流图

### 正常播放流程（无 Loop）
```
用户点击场景 → playScene()
             → RepeatMode.Off (默认)
             → 音频开始播放
             → 27s 后 Ended 事件
             → isActuallyPlaying = false
             → UI 显示暂停 ⏸
```

### 用户激活 Loop 后
```
用户点击 🔁 → toggleLoop()
             → applyLoopMode(false)
             → RepeatMode.Track
             → 音频播放中...
             → 27s 后 Ended 事件
             → 检测到 RepeatMode.Track
             → return (不停止!)
             → TrackPlayer 自动从头播放
             → ♻️ 无限循环
```

### Shuffle 激活后
```
用户点击 🎲 → handleShuffle()
             → applyLoopMode(true)
             → RepeatMode.Off (强制)
             → startRoaming()
             → 切换到随机场景
             → playScene() → RepeatMode.Off
             → 音频结束 → QueueEnded
             → SceneRoamManager.getNextRoamScene()
             → switchSoundscape(nextScene)
             → 🎲 继续漫游...
```

### Shuffle → 停止 → Loop 恢复？
```
用户再次点击 🎲 → stopRoaming()
                  → applyLoopMode(false)
                  → RepeatMode.Track??
                  
⚠️ 注意：applyLoopMode(false) 会设为 Track，
   但如果用户之前没有手动开启 Loop，
   这会导致"意外循环"！
   
   当前行为：停止漫游后默认恢复循环。
   如需改为"停止漫游后也默认 Off"，
   需要传递 isLooping 状态给 applyLoopMode。
```

---

## 六、已知问题 & 待优化

| # | 问题 | 严重度 | 建议 |
|---|------|--------|------|
| 1 | 停止 Shuffle 时自动恢复 Loop，可能与用户预期不符 | 中 | 改为传入 `isLooping` 状态，只有用户明确开启过才恢复 |
| 2 | Loop + Shuffle 同时激活时，UI 上 🔁 可能显示紫色但实际无效 | 低 | Shuffle 激活时禁用或灰显 Loop 按钮 |
| 3 | Sine-Crossfade v2.0 与 Loop 重播点的配合未验证 | 高 | 需真机测试 27s 循环点是否有爆音 |
| 4 | Loop 状态在场景切换后是否持久化？ | 中 | 当前 `isLooping` 是组件 state，切场景会重置。可考虑存入 AudioContext 或 AsyncStorage |

---

## 七、涉及文件清单

| 文件 | 修改内容 | 行号范围 |
|------|----------|----------|
| `src/services/AudioService.ts` | applyLoopMode(), RepeatMode 智能判断, Ended/QueueEnded 循环检测 | L554-573, L599-628, L322-330, L354-370, L1240-1258, L1709-1715 |
| `src/screens/ImmersivePlayerNew.tsx` | isLooping 状态, toggleLoop(), 🔁 按钮UI, 样式 | L98, L555-567, L678-693, L857-870 |
| `src/screens/HomeScreen.tsx` | handleShuffle() 中调用 applyLoopMode() | L647-650, L673-676 |

---

## 八、测试用例

### TC-01: 默认行为验证
- [ ] 进入任意场景 → 播放 → 等 27s → **确认停止**（不循环）
- [ ] 🔁 按钮显示灰色空心图标

### TC-02: 手动激活 Loop
- [ ] 进入场景 → 播放 → 点击 🔁 → 变紫色实心
- [ ] 等 27s → **确认自动重播**（无停顿）
- [ ] UI 图标始终保持 ▶

### TC-03: Loop + Crossfade 平滑度
- [ ] 激活 Loop → 播放晨钟佛音(27s)
- [ ] 观察循环点是否有爆音/断点/跳变
- [ ] Sine-Crossfade v2.0 淡入淡出是否丝滑

### TC-04: Shuffle 冲突
- [ ] 先激活 Loop (🔁紫) → 再点 Shuffle (🎲)
- [ ] 确认 RepeatMode 被强制 Off
- [ ] 漫游切换正常工作

### TC-05: Shuffle 停止后
- [ ] Shuffle 激活中 → 再次点击 🎲 停止
- [ ] 观察 Loop 是否恢复（当前会恢复为 Track）

---

> **文档维护**: 此文档随 `feature/audio-loop-experiment` 分支同步更新。
> 合并到 main/RN0.81-16k 前请确认所有 TC 通过。
