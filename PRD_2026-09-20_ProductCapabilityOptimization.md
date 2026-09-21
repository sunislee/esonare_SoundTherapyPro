# 心声冥想 / esonare SoundTherapyPro — 产品能力跃迁报告

| 项 | 内容 |
|---|---|
| 文档日期 | 2026-09-20（供 09-21 起决策） |
| 代码基线 | `p1/b-group-behavior` @ `d0987d92`，versionName **1.4.4** / versionCode **147**，已上线 Google Play |
| 与上一份文档的关系 | `PRD_2026-09-15_OptimizationAndDevPlan.md` 解决的是「止血 + 补半成品接线」；**本报告回答另一个问题：在已经能稳定跑的前提下，做什么能让产品力发生质变。** 两份不重复。 |
| 结论一句话 | **当前 App 是一台"做工精良的播放器"，但不是一款"有理由明天再打开的产品"。质变的钥匙不在加新场景，而在把已有的 1300+ 行孤儿功能（混音/历史/闹钟）接活、补上留存闭环与数据埋点，让差异化卖点从代码变成用户可感知的价值。** |

> ⚠️ 按 `.clinerules` 本应先查 supermemory，但当前会话未挂载该 MCP，全部结论来自本次代码与 git 实证（均带 `文件:行号`）。
> ✅ 本报告为**只读分析产物**，未改动任何源码。

---

## 一、执行摘要：三个质变杠杆

经过 5 天 P0/P1 冲刺（v1.4.4 已热修上线），App 的"下限"已经稳住——不再崩、下载可靠、Crashlytics 构建期集成。**但"上限"卡在同一个瓶颈上**：

```
用户旅程现状：打开 → 选场景 → 听 → 关掉 → （没有然后了）
                ↑                              ↓
              没有任何东西把他拉回来 ←───────┘
```

三个杠杆，按「撬动力 / 实施成本」排序：

| # | 杠杆 | 一句话 | 为什么是质变 | 预估投入 |
|---|------|--------|-------------|---------|
| **L1** | **留存闭环激活** | 把历史/收藏/每日推荐/连续打卡做出来 | 白噪音类 App 的生死线是 D7/D30 留存，不是功能数。当前所有留存钩子为 **0**。 | 中（多数有底座） |
| **L2** | **差异化护城河变现** | 混音方案 + 降噪实验室 + 闹钟唤醒接线上线 | 这三块是 Calm/潮汐/小睡眠**没有或很弱**的能力，代码已写 70% 却用户摸不到 = 沉没成本。 | 低-中（补线为主） |
| **L3** | **数据埋点先行** | 接 Firebase Analytics 最小事件集 | 现在"该做哪个功能"全靠猜。**没有这层，L1/L2 做完也无法验证是否有效。** 严格说这是 L1/L2 的前置依赖。 | 低（原生依赖已在） |

> **建议执行顺序：L3 → L2 → L1**。先装仪表盘，再把已有资产接活见效最快，最后系统性补留存。详见第四节排期。

---

## 二、现状诊断：产品能力成熟度矩阵

基于 `src/` 全量 87 个 ts/tsx（约 32,450 行）实证。状态分四档：✅ 已上线可感知 / 🟡 有代码但用户摸不到 / ⚠️ 半成品未接线 / ❌ 完全没有。

### 2.1 能力地图

| 能力域 | 状态 | 实证依据 | 对留存/商业化的贡献 |
|---|---|---|---|
| 场景播放（26 主场景 + 6 分类） | ✅ | `HomeScreen.tsx`(1504行) + `ImmersivePlayerNew.tsx`(1120行) | 核心价值，已达标 |
| 无缝切换 / Sine-Crossfade v2.0 | ✅ | CHANGELOG 1.4.2 系列，FadeOut 2000ms/FadeIn 1500ms | 体验护城河，已达标 |
| 降噪实验室（8轨空间音频 + EQ） | ✅ | `NoiseCancellationRoom.tsx`(960行) + `8TrackAudioService.ts`(926行) | **差异化卖点 A**，已上线 |
| 呼吸法训练 | ✅ | `BreathDetailScreen.tsx`(896行)，P0-1 修复后可用 | 差异化卖点 B，已上线 |
| 睡眠定时 | ✅ | `SleepTimerSheet.tsx`，v1.4.4 修复崩溃 | 留存钩子（弱），已上线 |
| 资源下载体系（断点续传/CDN故障转移） | ✅ | `DownloaderService.ts`(802行) + P1-6 收敛中 | 基础设施，接近达标 |
| **播放历史** | ⚠️ **死代码** | `HistoryScreen.tsx`+`HistoryService.ts` 齐全；但 `addToHistory()` **全项目零调用**；入口在 `ProfileScreen.tsx:605` 被注释 | 留存钩子（强）——**接活即得** |
| **自定义混音方案** | ⚠️ **孤儿页** | `MixerScreen.tsx`(479行)+`RemixSchemeManagerScreen.tsx`(359行)+`EditSchemeModal`(246行)，`grep Mixer src/navigation/ App.tsx` = 0 命中，未注册任何路由 | 差异化卖点 C + 用户粘性——**接活即得** |
| **闹钟 / 定时唤醒** | ⚠️ **零引用** | `AlarmPickerSheet.tsx`(363行) 无任何 import | 晨间场景留存钩子（强） |
| **专注 / 学习模式** | 🟡 雏形 | `StudyScreen.tsx`(486行)，未挂路由 | 需先决策做/删（见 F-2） |
| 收藏 / 搜索 / 最近播放 | ❌ | 全项目 grep `favorite` = 0（除本 PRD 引用） | 留存钩子（强），需新建 |
| **数据埋点** | ❌ | JS 层无任何 `@react-native-firebase/*`；原生 `build.gradle:149-151` 有 firebase-analytics 但无 JS 桥 | **一切决策的前提** |
| 崩溃上报（真·可用） | 🟡 假通 | Crashlytics 构建期已恢复，但 `CrashReportModule.logException` 走 Bugly 反射且项目无 Bugly → JS 侧错误只落 `console.warn`（见 CHANGELOG:33） | 质量保障，需补原生桥 |
| **账号注销** | ❌ | 仅有「重置数据」（`ProfileScreen.tsx:282,620`），Google Play 要求的"账号删除"路径缺失 | **合规硬门槛**（政策风险） |
| 商业化（订阅/内购） | ❌ | `package.json` 无 billing 依赖 | 收入天花板 |
| iOS | ❌ 不可用 | Info.plist 无 `UIBackgroundModes`，后台播放即挂；双工程并存 | **半壁市场为 0** |

### 2.2 一句话诊断

> **"能听的"已做到 ~95 分，"想再听"和"离不开"是 0 分。**
> 场景数量、音质、切换流畅度继续打磨的边际收益已经很低；真正的洼地是：① 用户没有第二天回来的理由（留存钩子全缺）；② 三大差异化卖点里两个半躺在仓库里没接线（混音/闹钟），投入产出比极高；③ 没有埋点，所有产品决策裸奔。

---

## 三、机会点详述（按杠杆分组，每条带「现状证据 → 动作 → 验收」）

### 🔑 L3 · 数据埋点先行（建议最先做，1-2 天）

**F-3.1 接入 Firebase Analytics JS 桥**
- **现状证据**：原生侧 `android/app/build.gradle:149-151` 已引入 `firebase-analytics`；但 `package.json` 无 `@react-native-firebase/analytics`，JS 全项目零 `logEvent`。等于装了仪表盘没接传感器。
- **动作**：
  1. 引入 `@react-native-firebase/app` + `/analytics`（与现有 firebase-bom 33.1.2 对齐版本）；
  2. 建 `src/services/AnalyticsService.ts` 封装 `logEvent(name, params)`，开发环境 no-op；
  3. **最小事件集**（覆盖漏斗全链路）：

     | 事件 | 触发点 | 关键字段 |
     |---|---|---|
     | `app_open` / `session_end` | App.tsx AppState | duration_sec, is_cold_start |
     | `scene_play` | AudioService.switchSoundscape | scene_id, category, is_downloaded |
     | `scene_complete` | 自然播完 vs 手动切走 | scene_id, listened_sec, exit_type |
     | `download_start/complete/fail` | DownloaderService | file, size_mb, retry_count |
     | `noiselab_open` / `breath_start` | 两大卖点入口 | — |
     | `sleep_timer_set` | SleepTimerSheet | minutes |
- **验收**：Firebase DebugView 实时看到事件流；产出首份「漏斗报告」（打开→选场景→播放>30s→次日回访）。
- **为什么先做**：L1/L2 任何改动上线后，没有埋点就无法回答"有没有用"。

### 🚀 L2 · 差异化护城河变现（投入产出比最高）

**F-2.1 混音方案接线上线**（沉没成本 → 卖点）
- **现状证据**：`MixerScreen.tsx`(479行) + `RemixSchemeManagerScreen.tsx`(359行) + `EditSchemeModal.tsx`(246行) + `AmbientPickerSheet.tsx:296` 已有 `savedMixes` UI，**合计约 1,084 行已完成但未挂路由**。
- **动作**：① `MainNavigator.tsx` 注册 `Mixer` / `RemixSchemeManager`；② 补 `MixPresetStore`（AsyncStorage CRUD，模式同 HistoryService）持久化配方；③ ImmersivePlayerNew 增加「保存当前混音」入口 + ProfileScreen 增加「我的配方」列表。
- **验收**：调三轨音量 → 存为"助眠特调" → 杀进程重启 → 一键还原全部轨位与音量。
- **价值**：白噪音品类里的**强差异化**（Calm/潮汐无此深度混音）。用户自己调出的配方 = 迁移成本 = 留存。

**F-2.2 闹钟 / 定时唤醒接入**
- **现状证据**：`AlarmPickerSheet.tsx`(363行) 完整 UI，零引用。
- **动作**：① 与睡眠定时合并为「作息」入口（睡 → SleepTimer，醒 → Alarm）；② Android 用 `react-native-background-actions`（已在 deps）或轻量本地通知库；iOS 需本地通知。**新原生依赖按规则需你点头再引入。**
- **验收**：设 7:00 闹钟 → 息屏待机 → 到点用指定场景渐强唤醒。
- **价值**："用它入睡 + 用它起床" = 一天两次打开理由，留存杠杆最强之一。

**F-2.3 降噪实验室产品化包装**
- **现状证据**：能力已上线（8轨+EQ+麦克风环境识别），但入口藏在首页 Modal，用户认知弱。
- **动作**：① "实测你的环境噪音 → 推荐降噪方案"做成首次进入引导；② 结果可分享（截图卡片）→ 自然拉新。**纯前端工作量，不碰核心音频链路。**

### 📈 L1 · 留存闭环激活

**F-1.1 播放历史复活**（半天工作量）
- **现状证据**：`HistoryService.addToHistory()` 全项目零调用；`MainNavigator.tsx:129` 已注册 `History` 路由，但入口 `ProfileScreen.tsx:605` 整段注释。
- **动作**：① AudioService 确认播放（非预加载）后调 `addToHistory(sceneId)`；② 恢复 ProfileScreen 历史入口；③ HistoryScreen 增加「按日期分组 + 累计收听时长」。
- **验收**：听 30s → 冷启动进历史页看到记录与时长。

**F-1.2 收藏 / 喜欢（需新建）**
- **动作**：`FavoriteStore`（AsyncStorage）+ SceneItem 长按/心形按钮 + 首页「我的收藏」分类卡置顶。
- **价值**：建立"我的歌单"心智，配合 F-2.1 配方形成个人资产。

**F-1.3 每日推荐 / 今日声景**
- **动作**：首页顶部「今日推荐」大卡，本地规则引擎：时段（晨/午/晚/夜）× 历史偏好 × 轻度随机。**无需后端、无需 ML**。
- **价值**：给用户"打开看看今天推什么"的理由，冥想类 App（Calm/Headspace）验证过的日活钩子。

**F-1.4 连续收听打卡 + 成就体系**
- **动作**：基于 F-1.1 收听时长，本地计算「连续 N 天 / 累计小时」里程碑 + Reanimated 轻量庆祝动画。
- **价值**：习惯养成 = 长期留存；纯本地零成本。

### 🛡️ L4 · 合规与商业化（时间敏感）

**F-4.1 账号注销入口（Google Play 政策硬门槛）**
- **现状证据**：仅 `ProfileScreen.tsx:282 handleResetAppData` + `:620` 「重置数据」菜单项，非"账号删除"语义与文案。
- **动作**：复用 resetAppData 底座，增加「注销账号」→ 二次确认 → 清除全部本地数据 + 落地页 URL。**合规风险项，建议尽快。**

**F-4.2 Crashlytics 真正打通**
- **现状证据**：CHANGELOG:33 已诚实记录——JS 边界错误实际只 `console.warn`。
- **动作**：vc148 改原生模块走 FirebaseCrashlytics + 注册 Package + apply google-services。

**F-4.3 iOS 复活（战略级，需单独决策）**
- **现状证据**：双工程并存，Info.plist 缺 `UIBackgroundModes` → 后台播放即崩。
- **动作**：收敛单工程、补 Background Modes、TrackPlayer 验证。**打开付费能力最强市场的一步**，但工作量 1-2 周，建议 L1/L2 数据跑出来后再投。

**F-4.4 订阅制（终局变现）**
- **动作**：等 F-3.1 跑出留存曲线后，把「高级混音位 / 独占声景 / 闹钟多组」设为 Pro 权益，接 `react-native-iap`。**当前不建议做**——先有留存再谈付费。

---

## 四、优先级矩阵与排期建议

### 4.1 价值 × 成本四象限

```
        高价值
          │
  F-3.1 埋点 ★    F-2.1 混音接线 ★★   F-1.1 历史复活 ★★
  (低成本已列)     (中成本·差异化)       (极低成本·立得)
          │
  ────────┼──────────────────── 高成本 →
          │
  F-4.1 注销 ★    F-2.2 闹钟(需决策依赖)  F-4.3 iOS 复活
  (合规必做)      F-1.2 收藏              F-4.4 订阅制(暂缓)
                F-1.3 每日推荐           F-4.5 专注模式(先决策)
          │
        低价值
```

### 4.2 建议节奏（延续"一天一件事，改完真机验证 release 包"的项目规则）

| 周 | 主题 | 内容 | 成功指标 |
|---|------|------|---------|
| **W1** | 📊 装仪表盘 + 捡现成 | F-3.1 埋点 → F-1.1 历史复活 → F-4.1 注销入口（合规） | DebugView 事件流；历史闭环；商店审核无忧 |
| **W2** | 🚀 接活差异化卖点 A | F-2.1 混音方案全链路（路由+持久化+入口） | 配方保存/还原跨启动生效；埋点看使用率 |
| **W3** | 📈 留存钩子铺设 | F-1.2 收藏 → F-1.3 每日推荐 | 「今日声景」点击率 >20% DAU |
| **W4** | ⏰ 作息闭环 + 包装 | F-2.2 闹钟（依赖你确认原生库）→ F-2.3 降噪引导+分享 | 早晚双打开场景成立 |
| **W5+** | 🍎 iOS 复活 / 订阅制 | 依据 W1-W4 数据决策投入顺序 | — |

> 排期原则遵循 `.clinerules`：单一目的修改，一次一处，改完等真机 release 验证再下一步。

---

## 五、假设与风险

1. **supermemory 未挂载**：未能按规则先检索历史记忆，若个别结论与你既有记录冲突，以你为准并告知修正。
2. **F-2.2 闹钟 / F-4.3 iOS 需要新增原生依赖或改原生工程**：按规则我不擅自引入，需你点头后启动。
3. **F-4.5 专注模式（`StudyScreen.tsx` 486行）**：做则与收听时长统计合并设计，不做建议删除以免继续腐烂——**需要你决策**，本报告不替你拍板。
4. **埋点引入 Firebase JS 桥可能与现有原生 firebase-bom 版本冲突**：W1 第一步先在分支验证 `pod install` / gradle sync，不通则退回"自建极简事件日志 + 定期上传"方案。
5. **所有"留存钩子"的效果判断依赖 F-3.1 先上线**：若跳过埋点直接做 L1/L2，等于蒙眼开车——这是本报告坚持 L3 优先的唯一强主张。

---

## 六、一句话给大哥的决策建议

> 如果只能挑一件事明天开工：**接混音方案（F-2.1）**——它是差异化卖点、代码已写七成、成本可控、用户可感知，三要素同时满足的只此一项；
> 如果可以挑一周：按第四节 W1-W4 走完，产品从"播放器"变成"有留存钩子的声景平台"。
