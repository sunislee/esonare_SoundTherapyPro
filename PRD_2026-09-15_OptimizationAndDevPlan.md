# 心声冥想 / esonare SoundTherapyPro — 优化与开发 PRD

| 项 | 内容 |
|---|---|
| 文档日期 | 2026-09-14（供 09-15 起按日执行） |
| 代码基线 | `main` @ `a8059baf`，versionName **1.4.3** / versionCode **146**，RN **0.81.5**，已上线 Google Play |
| 分析范围 | `src/` 全部 87 个 ts/tsx（约 32,600 行）+ App.tsx + android 配置 + i18n + git 历史 |
| 结论一句话 | **业务主线（场景播放 / 降噪实验室 / 下载体系）已成型可用，但线上包里埋着一个必崩 P0；同时"混音方案 / 播放历史 / 闹钟唤醒 / iOS"四块业务只写了骨架没接线。** |

> ⚠️ 说明：按项目规则本应先查 supermemory 记忆库，但当前会话未挂载 supermemory MCP 工具，无法检索历史记录，本文结论全部来自代码与 git 实证。所有 P0/P1 条目都给了 `文件:行号`，可直接跳转复核。

> ✅ **2026-09-14 二次复核记录**：重跑 `npx tsc --noEmit`（182 条，分布见 P1-B）、重算三语键差集、逐条 grep 验证 P0-2/3/4/5 断言，全部成立；据此**新增 P0-7、P0-8 两项**，并**更正 F-5 中"en 缺 6 键"的方向性错误**（实为 zh 缺 6 / ja 缺 154），`git status` 变更数修正为 152。

---

## 一、现状盘点：已完成业务地图

### 1.1 场景播放主线（完成度 ~95%，App 核心）
- **场景库**：`AUDIO_MANIFEST`（`src/constants/audioAssets.ts`）单一事实源 → `SCENES`（`src/constants/scenes.ts`）派生；26 个主场景 + 交互音效/背景图资源，6 大分类（Nature / Life / Healing / Brainwave / WesternChurch / Oriental），`SCENE_ORDER` 强制排序。
- **首页**：`HomeScreen.tsx`(1504 行) 分类卡片流 + `SceneItem` 按场景独立订阅下载进度（`SceneDownloadStore` v4）+ 分类内 Shuffle 漫游 + 降噪实验室入口。
- **无缝切换**：Sine-Crossfade v2.0（`LFOService.createVolumeEnvelope`），FadeOut 2000ms / FadeIn 1500ms / 重叠 500ms，UI 乐观更新 <16ms。
- **沉浸式播放器**：`ImmersivePlayerNew.tsx`(1120 行) 背景图音画同步淡切、场景切换 BottomSheet、交互音效按钮层（`InteractiveButtons` + `SFXPlayer`）、老唱片店三层混音（`RecordShopAudioManager`）、QuickPresets、退出确认。
- **漫游**：`SceneRoamManager` 分类内随机不重复 + 三重兜底（Ended 事件 / 进度 98% / paused）+ 循环检测。

### 1.2 降噪实验室（完成度 ~85%，差异化卖点）
- 两套入口：独立页 `NoiseCancellationRoom.tsx`(960 行) + 首页 Modal `NoiseCancellationExperiment.tsx`(1126 行)。
- 4 组场景 × **8 轨空间音频**（`8TrackAudioService.ts` 926 行）+ 三频段分轨（`MultiTrackAudioService`）+ 实时频谱（`AudioAnalyzer`）+ 原生 EQ（`NativeEQ` / `AudioLevel` / `EQManager` / `EQGenerator`）。
- 麦克风自动环境识别（可手动关闭）、8 轨资源下载前置检查 → `ResourceDownloadScreen`。

### 1.3 资源下载体系（完成度 ~75%，近三个月主攻方向）
- **路径 B（主）**：`DownloaderService.ts`(802 行) — fetch 流式写入 + `.part` 断点续传（`Range: bytes=N-`，服务端忽略 Range 自动回退）+ `expectedSize` 严格校验 + 4 级 CDN 故障转移（`getAssetUrls`）+ 优先级队列。
- **闸门与续命**：`NetworkGateService` + `WifiDownloadPrompt`（移动数据下载确认）、Headless JS `tasks/DownloadTask`（后台切回前台自动续传）、`AppState` 恢复触发。
- **状态层**：`ResourceStatusManager`、`SceneDownloadStore`（按场景 tick，避免整页重渲染）。

### 1.4 辅助业务（完成度不一）
| 模块 | 状态 | 备注 |
|---|---|---|
| 呼吸法训练 `BreathDetailScreen`(896行) | ✅ 可用 | 动画 + 环境音联动，但见 P0-1 崩溃点 |
| 睡眠定时 | ⚠️ **线上必崩** | `SleepTimerSheet` 已接 ProfileScreen，见 P0-1 |
| 播放控制通知栏 / 前台服务 | ✅ 可用 | TrackPlayer + `NotificationService`，三语本地化 |
| 个人中心 | ✅ 可用 | 昵称、头像选图、自定义背景、清缓存、重置数据 |
| 设置页 | ✅ 可用 | 淡出开关、高品质开关、语言(zh/en/ja/系统)、清理历史/预设/资源、开发者模式彩蛋 |
| 合规 | 🟡 部分 | 隐私政策/用户协议 WebView 已接；**账号注销入口缺失**（Google Play 长期要求） |
| 崩溃上报 | ❌ **未启用** | `build.gradle:7,149-151` Crashlytics 全部注释，线上裸奔 |
| 播放历史 | ❌ **半成品** | `HistoryScreen` + `HistoryService` 齐全，但 `addToHistory` 全项目零调用、入口被注释 |
| 自定义混音方案 | ❌ **未接线** | `MixerScreen`(479) + `RemixSchemeManagerScreen`(359) + `EditSchemeModal` 均未注册路由 |
| 闹钟 / 定时唤醒 | ❌ **未接入** | `AlarmPickerSheet.tsx`(363 行) 零引用 |
| 收藏 / 搜索 / 最近播放 | ❌ 无 | 全项目无 favorite/search 相关代码 |
| 数据埋点 | ❌ 无 | 无任何 analytics/logEvent |
| 商业化 | ❌ 无 | package.json 无 billing / ads 依赖 |
| iOS | ❌ **不可用** | 两套工程并存（`SoundTherapy081` / `SoundTherapyPro`），Info.plist **无 `UIBackgroundModes`** → 后台播放直接挂 |

---

## 二、P0 — 阻断性缺陷（共 8 项，明天上午必须清；其中 P0-1/2/7 已在 v1.4.2 线上包内）

### 🔴 P0-1 `AudioService.ts` 源码被 AI 提示词污染 → 5 个监听器方法整段被注释掉【最高危】
**证据**：`src/services/AudioService.ts:2316-2374`

```
2316| /**
2317|  * 场景级状态变更监听（替代 DeviceEventEmitter）
2319| [Showing lines 1-37 of 52 total. Use start_line=38 to continue reading.]
2322|                 # TODO LIST UPDATE REQUIRED - You MUST include the task_progress parameter ...
2340| <system-reminder>
2341| The tool call you made did not produce any output yet...
```

该 `/**` 之后 **直到 2374 行才出现第一个 `*/`**，因此 2316–2374 整体成为一个巨型块注释，吞掉了下面 5 个方法：

| 被吞方法 | 原行号 | 调用方 | 后果 |
|---|---|---|---|
| `addLoadingListener` | ~2342 | `ImmersivePlayerNew.tsx:425`（`?.()` 可选调用） | **静默失效**：播放器 loading 态不更新 |
| `addAudioStateListener` | 2346 | `AudioContext.tsx:327`、`usePlayerState.ts:40`（typeof 守卫） | **静默失效**：播放状态同步退化，MiniPlayer/按钮态易反向 |
| `addSmallScenesListener` | 2351 | `BreathDetailScreen.tsx:403`（**无守卫直接调用**） | **TypeError 崩溃**：呼吸详情页一进去就炸 |
| `addVolumeListener` | 2356 | 音量监听 | 静默失效 |
| `addSleepTimerListener` | 2361 | `SleepTimerSheet.tsx:46`（**无守卫直接调用**） | **TypeError 崩溃**：我的 → 睡眠定时，一点就炸 |
| `addResourceLoadingListener` | 2367 | 资源加载提示 | 静默失效 |

- tsc 已明确报警：`SleepTimerSheet.tsx(46,40) TS2339: Property 'addSleepTimerListener' does not exist on type 'AudioService'`、`BreathDetailScreen.tsx(403,30) TS2339: addSmallScenesListener`。
- 全项目无 `AudioService.prototype` 运行时补挂，确认是真缺失。
- 污染由 commit **`1eeb7e33`（2026-06-21 "fix: multi-source download deadlock..."）** 引入，且 **已包含在 tag `v1.4.2` 内 → 线上用户可复现崩溃**。

**修复动作**（约 15 分钟）：删除 2319–2341 的污染文本，补回被吞掉的 `addLoadingListener` 方法签名并正确闭合 JSDoc `*/`；随后 `npx tsc --noEmit | grep -c 'error TS'` 应减少至少 2 条（上述两条 TS2339 消失）。
**验收**：① 我的→睡眠定时打开不崩、倒计时环正常走；② 呼吸详情页进入不崩、交互音按钮激活态正确；③ 播放器 loading 指示在切场景时正常出现/消失。

### 🔴 P0-2 `SFXPlayer` 缺 `setVolume` / `playOneShot` → 老唱片店场景音效层整体失效
**证据**：`RecordShopAudioManager.ts:63,101`（`this.sfxPlayer.setVolume(...)`）、`:181`（`this.sfxPlayer.playOneShot(...)`）；而 `SFXPlayer.ts` 对外只暴露 6 个方法 —— `play(:64) / stop(:125) / stopAll(:137) / isPlaying(:170) / getActiveCount(:178) / getActiveSoundIds(:185)`，**没有 `setVolume`、也没有 `playOneShot`**（注意：`SFXPlayer.ts:112` 那行 `sound.setVolume(1.0)` 是内部对 `Sound` 实例的调用，不是对外方法，别被 grep 误导）。
**后果**：两处调用都落在 `try/catch` 里被吞掉 → 表现为"雨声正常，但黑胶底噪和随机的门铃/脚步/收音机调台音效一个都不响"，日志只留一行 `启动失败`。属于线上体验缺陷。
**修复动作**（约 40 行）：给 `SFXPlayer` 补 `setVolume(soundId, vol)`（内部 `sound.setVolume`）与 `playOneShot(path, id, vol)`（不循环、播完自动 release）。
**验收**：进入"消失在雨中的老唱片店"，能听到底层黑胶噼啪声；静置 10–35s 随机触发一次环境音效。

### 🔴 P0-3 `MultiTrackAudioService` 引用未定义变量 `volumeStep`
**证据**：`src/services/MultiTrackAudioService.ts:201` `const volume = Math.max(0, 1.0 - (step * volumeStep));`，全文件无声明（tsc TS2304）。
**后果**：`fadeOutMultiTrack()` 首次迭代即抛 ReferenceError → `stopMultiTrackAudio()`(:219) 无法收尾，三轨实例残留（内存 + 音频焦点占用）。
**修复动作**：改为 `const volumeStep = 1 / steps;`（或直接 `1 - step/steps`），并给 `stopMultiTrackAudio` 外层加 try/finally 保证 release 一定执行。

### 🟠 P0-4 混音方案入口点击即报错：路由未注册
**证据**：`ProfileScreen.tsx:87` `navigation.navigate('Mixer', { presetId })`，但 `MainNavigator.tsx` 的 `RootStackParamList` **没有 Mixer**。
**后果**：`NAVIGATE 'Mixer' was not handled by any navigator`，用户点"混音/我的方案"无反应或红屏。
**修复动作**：注册 `Mixer` + `RemixSchemeManager` 两个 Stack.Screen（详见 F-2）。

### 🟠 P0-5 资源缺失弹窗"下载"按钮点了没反应：路由名写错
**证据**：`AudioContext.tsx:181` `navObj.navigate('ResourceDownload')`；实际注册名是 **`ResourceDownloadScreen`**（`MainNavigator.tsx:149`，其余 3 处调用均用对）。
**修复动作**：改成 `'ResourceDownloadScreen'` 并补 `{ targetFiles }` 参数。

### 🟡 P0-6 `SceneDownloadStore.tickSceneByAsset` 恒空转（死逻辑）
**证据**：`src/utils/SceneDownloadStore.ts:87-88` 读取 `item.sceneKey`，但 `AUDIO_MANIFEST` 条目结构只有 `id/filename/category/title/description/size`（tsc TS2339 ×3）→ 全部被 `continue` 过滤，映射表永远为空。当前零调用方。
**决策项**：二选一 —— (a) 给 manifest 补 `sceneKey` 字段并接到 `DownloaderService` 进度事件上，让"一个场景多资源"的合并进度可用；(b) 直接删除该函数。**建议 (a)**，降噪实验室"8 轨/场景"正需要它。

### 🔴 P0-7（09-14 复核新增）资源缺失引导弹窗正文显示 `[object Object]`
**证据链**（三步都核实过）：
1. `src/context/AudioContext.tsx:159` `const dialogMessage = safeT('download.message', { sceneTitle });`
2. **`download.message` 在 zh / en / ja 三语 JSON 中全部不存在**（`download.title`→"资源准备中"、`common.cancel`、`actions.download` 都在，唯独 message 缺）；
3. `safeT(key, defaultValue?)`（`src/i18n/index.ts:186-199`）第二参是 **defaultValue，不是 i18next 插值参数**，内部只调 `i18n.t(key)` 未透传 options。key 缺失时 `t()` 返回 key 本身 → 命中 `result === key` 分支 → **返回那个对象 `{ sceneTitle }`**。

→ `Alert.alert(dialogTitle, dialogMessage /* object */)`（`:165-167`）正文渲染为 `[object Object]`。这是"未下载场景点播放"的必经引导弹窗，用户可见且无法看懂。
**修复动作**：① 三语补 `download.message`（含 `{{sceneTitle}}` 占位）；② 给 `safeT` 增加第三参 `options` 并透传 `i18n.t(key, options)`，或此处直接改用 `i18n.t('download.message', { sceneTitle })`。
**验收**：删掉某场景本地音频 → 点播放 → 弹窗正文出现"需要下载〈森林雨声〉…"这类带真实场景名的文案，而非 `[object Object]`。

### 🟡 P0-8（09-14 复核新增）Provider value 重复键 `updateEqGain`
**证据**：`AudioContext.tsx:653` 与 `:655` 连续两次写 `updateEqGain`（tsc TS1117 `An object literal cannot have multiple properties with the same name`），且 653/654 行缩进异常（多一个空格），是复制粘贴残留。
**影响**：当前两处指向同一实现，暂无功能差异；但 Provider value 手工罗列已出现重复，说明缺一道 lint 兜底（`no-dupe-keys`）。**修复**：删掉 `:655` 一行，并确认 eslint 开启 `no-dupe-keys`。

---

## 三、P1 — 稳定性与工程治理（本周内）

### P1-A 线上无崩溃上报（合规 + 排障双重风险）
`android/app/build.gradle:7` `// apply plugin: 'com.google.firebase.crashlytics'`，`:149-151` 三个 firebase 依赖全注释；但 `android/app/google-services.json` 与 `android/build.gradle:22` 的 crashlytics-gradle classpath 都还在。JS 侧 `src/utils/CrashReportUtil.ts` 已封装好，原生 `CrashReport` 模块存在（还带 `getChannel()` 渠道识别）。
**动作**：取消注释恢复插件与依赖 → release 包制造一次崩溃验证 Crashlytics 控制台可见 → 在 GlobalErrorBoundary（`App.tsx:13`）与 `AudioService` 关键 catch 里补 `CrashReportUtil.logException`。

### P1-B TypeScript 全红：**当前 `npx tsc --noEmit` 共 182 条 error**
| 文件 | 条数 | 主要类型 |
|---|---|---|
| `src/services/AudioService.ts` | 44 | Promise executor 返回值、`Sound.pan`/`TrackPlayer.setPan` 不存在、`State.Playing` 恒假比较、`string[]` 赋给 `string` |
| `src/services/8TrackAudioService.ts` | 37 | `TrackPlayers` 数字索引签名缺失 |
| `src/screens/BreathDetailScreen.tsx` | 16 | — |
| `NoiseCancellationRoom / NameEntryScreen / HomeScreen` | 8/8/7 | vector-icons 缺类型声明、WebView prop 过期 |
| `components/InteractiveButton.tsx` | 5 | — |
| `utils/SceneDownloadStore.ts` | 3 | 即 P0-6 的 `item.sceneKey` |

> 上表为 **2026-09-14 重新跑 `npx tsc --noEmit` 复核**后的结果（总计 182），并确认 P0-1 的两条 TS2339（`SleepTimerSheet.tsx(46,40)` / `BreathDetailScreen.tsx(403,30)`）仍在报错清单中。

**动作（分域，不要一次改完）**：① 先加 `src/types/vector-icons.d.ts` 消掉 14 条噪音；② 再修 P0 相关 6 条；③ 剩余按文件建 follow-up，CI 里加 `tsc --noEmit` 但先以"错误数不得增加"作门禁（记录基线 182）。

### P1-C 双下载引擎并存（P1-3 未完成项）
`DownloadService.ts`(765 行) 仍用 `RNFS.downloadFile`，被 `ResourceDownloadScreen` / `ResourceStatusManager` / `App.tsx` 使用；`DownloaderService.ts`(802 行) 是新的 fetch + Range 引擎。**两套并行 = 进度/重试/校验行为不一致**，历史 Release 死锁隐患仍在。
**动作**：把 `DownloadService` 的下载执行改走 `DownloaderService.streamDownloadTo`（或让前者退化为"任务编排层"），URL 解析统一 `getAssetUrls()`。

### P1-D 剩余 P1 项（沿用 `TODO.md` 编号，已核对代码现状）
| 编号 | 事项 | 现状核实 |
|---|---|---|
| P1-4 | 重试改**指数退避 + 抖动** | ❌ 未完成。`DownloaderService.ts:405-408` 仍是失败即直接入队 |
| P1-6 | 残留硬编码 CDN URL 收敛 | ❌ 未完成。`DownloaderService.ts:688` 仍有 `GITHUB_BASE`；`ResourceConfig.ts` 仍有 **40 处** `remoteUrl` |
| P1-2 | 下载后完整性校验 | ✅ 已完成（`:595-597` 严格 `size !== expectedSize` 判定） |
| P1-5 | Range 断点续传 | ✅ 已完成（`:449-535`，含 `.part` 探测与 206/200 分支） |

### P1-E 测试覆盖几乎为零
仅 6 个测试文件（`__tests__/App.test.tsx`、`audioServiceLoading`、`downloadService`、`noiseResourceManifest`、`src/services/__tests__/DownloaderService.resume.test.ts`、`src/tasks/__tests__/DownloadTask.test.ts`），全部集中在下载链路；**场景切换 / Crossfade / EQ / 降噪 8 轨 / i18n 键完整性 0 覆盖**。
**动作（性价比最高的三个）**：① `AudioService` 监听器注册回归测试（正好锁住 P0-1 不再复发）；② i18n 三语键差集校验脚本 + `npm run lint:i18n`；③ `SCENES` 派生快照测试（防 order/缩略图映射回退，历史上已反复出问题）。

### P1-F iOS 从工程层面就是坏的
- `ios/` 下 **两套工程并存**：`SoundTherapy081.xcworkspace` 与 `SoundTherapyPro.xcworkspace`（还有 `Podfile.bak`），职责不清。
- `Info.plist` **缺 `UIBackgroundModes: audio`** → 后台/锁屏播放直接中断；`PrivacyInfo.xcprivacy` 只在 SoundTherapyPro 下有。
**动作**：先定一套工程（建议保留 `SoundTherapyPro`），补后台音频模式，跑通 TestFlight；TODO 里挂的"灵动岛封面翻转/消失"归入此项。

---

## 四、P2 — 死代码与仓库卫生（半天可清完，但影响协作效率）

### 4.1 写了但从未接线的页面 / 组件（要么接上要么删）
| 资产 | 行数 | 状态 | 建议 |
|---|---|---|---|
| `MixerScreen.tsx` | 479 | 未注册路由，但被 ProfileScreen 调用 | **接线**（见 F-2） |
| `RemixSchemeManagerScreen.tsx` + `EditSchemeModal` | 359+246 | 零引用 | **接线**（见 F-2） |
| `AlarmPickerSheet.tsx` | 363 | 零引用 | **接线**（见 F-3 闹钟） |
| `StudyScreen.tsx` | 486 | 零引用（专注模式雏形） | 决策：并入 F-6 或删除 |
| `WebviewScreen.tsx` | 131 | 零引用，与 `PolicyWebView`(327) 功能重复 | **删除** |
| `TimerPickerSheet.tsx` | 325 | 零引用（`SleepTimerSheet` 已替代） | **删除** |
| `MultiTrackEQPanel.tsx` / `Track8ControlPanel.tsx` | 332/370 | 零引用（降噪实验室旧面板） | 降噪改版时再评估，暂列删除候选 |
| `RainStreakLayer` / `GlassmorphismPlayButton` / `ChannelTestComponent` / `hooks/useAnimation` | 101/177/121/73 | 零引用 | **删除** |
| `ImmersivePlayerNew.tsx.bak` / `AudioService.ts.bak` / `i18n/index.ts.backup` / `Podfile.bak` | — | 备份文件混在源码树 | **删除**（git 已有历史） |

### 4.2 仓库体积与噪声
- `.git` **486 MB**；根目录混入上百个 `dump_*.xml`、`frame_*.png`、`window_*.xml`、`*_video.mp4`、`build*.log`；`android/.kotlin/errors/*.log` **已被 git 跟踪**。
- 存在两份完整嵌套副本：`SoundTherapy081/`（**2.8 GB**，含 node_modules）、`mobile_app/`（318 MB）。
- `git status` 当前 **152 条未提交变更**（含 6 个已修改源文件：`MainActivity.kt`、`InteractiveButtons.tsx`、`scenes.ts`、`AudioContext.tsx`、`BreathDetailScreen.tsx`、`AudioService.ts`，后者是 SFX 诊断日志埋点 +26 行）。
**动作**：① 先把 6 个源文件改动整理提交（避免和 P0 修复混在一起）；② 补 `.gitignore`（`*.bak`、`dump_*.xml`、`frame_*.png`、`android/.kotlin/`、`*.log`、`Releases/`、`web-build/`）+ `git rm --cached` 清理已跟踪垃圾；③ 评估 `git filter-repo` 瘦身（**需你单独批准，属破坏性操作**）。

---

## 五、待开发业务功能（按"用户价值 × 已有资产复用度"排序）

### F-1 ⭐️ 播放历史 + 聆听时长统计闭环（成本最低，2 天内可上线）
**现状**：`HistoryService.ts`(78) 读写清三段齐全；`HistoryScreen.tsx`(183) 已注册路由；`SettingsScreen:164` 已有"清除历史"。
**缺口**：**全项目没有任何一处调用 `HistoryService.addToHistory()`** → 历史永远为空；ProfileScreen 入口被注释掉（`:605-612`，还挂着 "comingSoon"）。
**开发内容**：
1. 在播放启动唯一收口处写记录（建议 `AudioService.switchSoundscape` / `play` 成功回调内，避免 UI 层多处重复）；同时补"实际聆听时长"（退出播放器时按 start/end 时间差累计，新 key `@listen_stats`）。
2. `HistoryScreen` 升级为分组视图（今天/本周/更早 + 每场景累计分钟数）。
3. ProfileScreen 恢复入口，去掉 comingSoon。
4. 首页新增"最近播放"横滑区（复用 `SceneItem`，数据源 `getHistory().slice(0,8)`）。
**验收**：听任一场景 30s 后退出 → 历史页出现该场景且时长 ≥30s；杀进程重开仍在；清除历史后为空。

### F-2 ⭐️ 自定义混音方案（"我的配方"）——资产已写 80%，只差接线
**现状**：`MixerScreen.tsx`(479，多轨音量+开关+预设保存)、`RemixSchemeManagerScreen.tsx`(359，列表/重命名/删除，含 `MixPreset{sceneId,mainVolume,rainVolume,fireVolume,ambientType}`)、`EditSchemeModal`、`SettingsScreen:168 清除预设`。
**缺口**：两个页面都没注册路由（→ P0-4）；`RemixSchemeManagerScreen` 的 `INITIAL_DATA` 是空数组，没接 AsyncStorage；"方案 → 一键回放"链路完全不存在。
**开发内容**：① `RootStackParamList` 加 `Mixer: {presetId?: string}` / `RemixSchemeManager: undefined` 并注册 Stack.Screen；② 抽 `MixPresetStore`（AsyncStorage，CRUD + 版本字段）；③ 新增 `applyMixPreset(preset)`：进 ImmersivePlayer 后按方案设置主音量/雨声/火焰/环境音开关；④ 首页或"我的"加"我的配方"分区卡片，长按可另存为。
**验收**：保存配方"雨夜读书"→ 杀掉 App → 从首页点该配方 → 自动进入播放器并还原全部轨音量与开关。

### F-3 ⭐️ 闹钟 / 定时唤醒（差异化功能，市场常见刚需）
**现状**：`AlarmPickerSheet.tsx`(363 行) **零引用**；已有 `NotificationService` + 前台服务 `mediaPlayback` + Headless JS 基建。
**开发内容**：① 接 `AlarmPickerSheet` 到 ProfileScreen 菜单（与"睡眠定时"并列）；② Android 侧需要原生 `AlarmManager` + `BroadcastReceiver`（现有原生目录 `android/app/src/main/java/com/anonymous/soundtherapyapp/`，可参考 `DiagLogModule.kt` 写法）；iOS 本地通知需评估 `notifee` / `react-native-push-notification` —— **这会新增依赖，需你批准后再引入**；③ 唤醒逻辑 = 到点用指定场景 + 音量渐起（复用 Crossfade v2.0 的 fadeIn）；④ Android 12+ 需 `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` 权限与用户教育文案。
**风险**：本清单里唯一涉及新原生代码 + 可能新增依赖的项，工时不确定度最高（估 3–5 天）。

### F-4 收藏 / 搜索 / 场景标签（留存向）
全项目零实现。建议最小闭环：`SceneItem` 右上角心形 + `@favorites` key + 首页顶部"收藏"分区；搜索用本地 `SCENES` 标题/描述模糊匹配即可（无需后端）。工时约 1.5 天。

### F-5 i18n 补齐与防回退（09-14 复核后更正了缺键方向）
**实测数据**（递归展开叶子键统计）：zh **435** / en **441** / ja **290**；`fallbackLng: 'en'`（`src/i18n/index.ts:94,128`）。

| 语言 | 相对 zh 缺失 | 说明 |
|---|---|---|
| **en** | **0**（不缺，反而是超集） | 之前"en 缺 6 键"的说法是**方向搞反了**，特此更正 |
| **zh** | **6** | `common.unableToOpen`、`common.confirmExit`、`common.confirmExitMessage`、`common.exit`、`player.landing.waking`、`player.landing.downloading`。其中前 4 个在 `NameEntryScreen.tsx:83-88` 用 `safeT(key, '确认退出')` 有中文兜底所以看不出问题；后 3 个**全项目零调用 = en 里的死键** |
| **ja** | **154** | 因 fallbackLng=en，**日文用户会看到大段英文**；若某处用了 `safeT(key, '中文兜底')`（全项目共 13 处），日文界面会中英日混排 |

**根因级问题**：`safeT(key, defaultValue?)` 把第二参当 defaultValue 用，**不支持 i18next 插值**，已经造成 P0-7 的 `[object Object]` 事故。
**动作**：① zh 补 6 键（顺带清掉 en 里 3 个死键）；② ja 全量补译 **154 键**（约半天，建议你先定术语表：冥想/呼吸法/降噪等专有名词）；③ `safeT` 增加第三参 `options` 透传给 `i18n.t`；④ 加 `scripts/check-i18n.js`（三语键差集 + 死键检测）+ `npm run lint:i18n` 进 CI。

### F-6 专注 / 学习模式（`StudyScreen` 已有 486 行雏形）
番茄钟 + 背景声景 + 专注时长统计。**需你先决策**：做（则与 F-1 时长统计合并设计）还是删掉该文件。

### F-7 合规必做项（Google Play 长期政策，`TODO.md` 已挂账）
- **账号注销**：当前 App 内完全没有注销入口/流程。即便无后端，也必须提供"一键清除全部本地数据 + 明确文案"的注销路径，并在商店 Listing 提供 URL。现有 `handleResetAppData`（`ProfileScreen:282`）可复用为底座。
- **账号体系 / 云同步**：TODO 列为 High Priority。**建议先不做后端**，用"本地导出/导入配置 JSON"过渡，等留存数据支撑后再投入。

### F-8 数据埋点（做决策的前提）
无任何 analytics。建议接 Firebase Analytics（Crashlytics 恢复时顺手一起做），最小事件集：`scene_play{sceneId,category}`、`session_duration`、`download_start/complete/fail{file,size}`、`noiselab_open`、`sleep_timer_set`。没有这层，后续"该做哪个功能"只能靠猜。

### F-9 架构级优化（不做业务时也值得推进）
- **拆 `AudioService.ts`（4468 行 / 46 个方法）**：按域切成 `PlaybackEngine`、`CrossfadeEngine`、`AmbientLayer`、`RoamController`、`EQBridge`；注意保留文件顶部 `@architecture-constraint`（与 DownloaderService 必须事件驱动解耦）的既有约束。
- 启动耗时：`App.tsx` 初始化链路里 `preloadBackgroundAvailability()` + `autoDownloadSceneBackgrounds()` 已异步化，但 `setupPlayer` 重试逻辑仍可能串行拖慢首屏，建议加埋点量化后再优化。
- 内存：8 轨 + 多轨实例在低端机的峰值需回归压测（历史报告 `MEMORY_TEST_REPORT_20260416.md`）。

---

## 六、执行排期（明天起，按"一天一件事，改完等你真机验证"推进）

| Day | 主题 | 具体任务 | 产出/验收 |
|---|---|---|---|
| **D1 上午** | 🔥 止血 P0-1 / P0-3 | 清 `AudioService.ts:2316-2374` 污染 + 补回 5 个监听器方法；修 `volumeStep` | tsc 少 3 条；睡眠定时/呼吸页不崩 |
| **D1 下午** | 🔥 P0-2 + P0-5/7/8 | `SFXPlayer.setVolume/playOneShot`；`ResourceDownloadScreen` 路由名；补 `download.message` + `safeT` 插值；删重复 `updateEqGain` | 老唱片店音效可听；资源缺失弹窗可跳转且文案带真实场景名 |
| **D1 晚** | 出包验证 | 打 **release** 包（项目规范：不装 debug）+ 提交 `fix(P0)` | versionCode 147，Crashlytics 待 D2 |
| **D2** | 📈 崩溃上报 + P0-4 | 恢复 Firebase Crashlytics；注册 `Mixer` / `RemixSchemeManager` 路由 | 制造崩溃可在控制台看到；混音页可进入不报错 |
| **D3** | ⭐️ F-1 播放历史闭环 | `addToHistory` 接入 + 时长统计 + HistoryScreen 分组 + 恢复入口 | 听 30s→历史有时长；冷启动仍在 |
| **D4** | ⭐️ F-2 混音方案（上） | `MixPresetStore` CRUD + Mixer 持久化打通 | 保存/重命名/删除配方跨启动生效 |
| **D5** | ⭐️ F-2 混音方案（下） | `applyMixPreset` + "我的配方"入口卡 | 一键还原配方全链路 |
| **D6** | 🧹 P2 清理 + i18n(zh) | 删死代码 / `.bak`、补 `.gitignore`、zh 补 6 键（含 `download.message`，见 P0-7）、i18n 差集校验脚本 | `tsc` 错误数下降；lint:i18n 进 CI |
| **D7** | 🧪 P1-E 测试 + P1-4/P1-6 | 监听器回归测试、SCENES 快照测试；重试退避+抖动；CDN URL 收敛 | 3 个新测试绿；无硬编码 CDN 残留 |
| **D8+** | F-5 ja 翻译 / F-4 收藏搜索 / P1-C 下载引擎统一 / F-3 闹钟 / iOS 复活 | 按你的优先级挑 | — |

> 排期原则遵循项目规则：**单一目的修改，一次一处，改完等你测**。D1 的两项虽在同一天，但属同一次提交前的连续止血；若你希望更保守，可把 P0-2/P0-5 推到 D2。

---

## 七、验收与自检命令

```bash
# 类型基线（当前 182，目标：只降不升）
npx tsc --noEmit 2>&1 | grep -c 'error TS'

# P0-1 是否彻底修好（这两条必须消失）
npx tsc --noEmit 2>&1 | grep -E "addSleepTimerListener|addSmallScenesListener"

# 源码污染是否清零（必须无输出）
grep -rn 'TODO LIST UPDATE REQUIRED\|Showing lines .* to continue reading\|<system-reminder>' src App.tsx

# 测试 / Lint
npx jest --listTests && npx jest
npm run lint

# release 真机包（项目规范：调试一律 release）
cd android && ./gradlew assembleRelease
```

---

## 八、假设与风险提示

1. **supermemory 未挂载**：本次未能按 `.clinerules` 先检索历史记忆，若某些结论与既有记录冲突，以你的记忆为准并告知我修正。
2. **P0-1 的线上影响面判断基于静态分析**（tsc + 调用点守卫情况）。建议 D1 出包前先在旧 release 包上复现一次"睡眠定时崩溃"，确认后再决定是否走加急发版。
3. **F-3 闹钟可能需要新增原生依赖**（iOS 本地通知 / Android 精确闹钟权限），按规则我不擅自引入新库，等你点头。
4. **`git filter-repo` 仓库瘦身属破坏性操作**，且涉及 `github` + Gitee 双远端强推，必须你单独批准。
5. **本次未改动任何代码**：只新增了本 PRD 文件；`git status` 里那 6 个已修改源文件是你之前的在途改动（含 SFX 诊断日志埋点），建议 D1 前先自行确认保留还是回滚。

