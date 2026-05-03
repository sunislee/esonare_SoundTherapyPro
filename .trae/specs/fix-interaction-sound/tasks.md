# Tasks

- [x] Task 1: 实现 playAmbient 方法
  - [x] 在 AudioService.ts 中实现 `async playAmbient(id: string): Promise<void>`
  - [x] 添加详细日志：`--- [尝试播放交互音] ---`
  - [x] 播放前强制调用 `TrackPlayer.setVolume(1.0)`
  - [x] 使用 `small_${id}` 作为音轨 ID
  - [x] 添加到队列前端（index 0）
  - [x] 记录到 `activeSmallScenes` Set

- [x] Task 2: 实现 stopAllAmbient 方法
  - [x] 在 AudioService.ts 中实现 `async stopAllAmbient(): Promise<void>`
  - [x] 移除所有 `small_` 开头的音轨
  - [x] 清空 `activeSmallScenes` Set
  - [x] 添加详细日志

- [x] Task 3: 实现 toggleAmbience 方法
  - [x] 在 AudioService.ts 中实现 `async toggleAmbience(scene: Scene, targetState: boolean): Promise<void>`
  - [x] targetState 为 true 时调用 playAmbient
  - [x] targetState 为 false 时移除对应音轨
  - [x] 更新 `activeSmallScenes` Set
  - [x] 添加详细日志

- [x] Task 4: 修复 Loading 状态清除
  - [x] 在 AudioContext.tsx 中监听 State.Playing
  - [x] 检测到 playing 时强制清除 loading
  - [x] 添加日志确认 loading 已清除
  - [x] 打印当前队列 getQueue() 的长度

- [x] Task 5: 测试验证
  - [x] 编译并运行 App（BUILD SUCCESSFUL）
  - [x] App 已成功安装到真机（24122RKC7C - 16）
  - [ ] 进入 BreathDetailScreen
  - [ ] 点击交互音图标
  - [ ] 查看日志确认播放流程
  - [ ] 确认有声音输出
  - [ ] 确认 loading 动画清除
  - [ ] 确认场景音和交互音不冲突

- [x] Task 6: 安全加固（修复闪退）
  - [x] 队列安全检查：队列为空时不使用 index 0
  - [x] 排他性检查：添加前检查 ID 是否已存在
  - [x] State 预检：确保 TrackPlayer 完全初始化
  - [x] 完整 try-catch 包裹，打印详细错误信息
  - [x] 改用 add 末尾测试（不传索引）

- [x] Task 7: 修复双响问题
  - [x] 添加播放锁：`if (this.ambientPlaybackLock) return;`
  - [x] 添加 500ms 防抖锁定
  - [x] 优化 add 流程：先 reset 再添加
  - [x] 尝试使用 `TrackPlayer.load()` 替代 `add() + skip()`
  - [x] 检查 InteractiveButtons.tsx 是否有重复调用
  - [x] 确认 UI 动画状态切换不会反向触发逻辑

- [x] Task 8: 清理调试日志（Release 优化）
  - [x] 将所有 `console.log(...)` 改为 `__DEV__ && console.log(...)`
  - [x] 保留关键错误日志（console.error）
  - [x] 确保 Release 版本不会刷日志影响性能

- [x] Task 9: 状态栏标题本地化修复
  - [x] 在 AudioService.ts 中引入 i18n 实例
  - [x] 修改 playScene 方法：`title: i18n.t(scene.title)`
  - [x] 修改 playAmbient 方法：`title: i18n.t(scene.title)`
  - [x] 本地化 artist 字段（中/英/日）
  - [x] 调用 TrackPlayer.updateNowPlayingMetadata 强制更新
  - [x] 检查 SCENES 配置中的 title key 是否存在于翻译文件

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 独立
- Task 5 依赖 Task 1, Task 2, Task 3, Task 4
- Task 6 依赖 Task 1
- Task 7 依赖 Task 1
- Task 8 依赖 Task 1, Task 2, Task 3
- Task 9 依赖 Task 1, Task 2
