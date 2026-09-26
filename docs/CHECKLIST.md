# CHECKLIST · 需真机验证项（2026-09-25 批次）

> 本会话无设备（`adb devices` 为空、`adb reverse tcp:8081` 报 Address already in use），
> 因此以下条目**不作为交付前提**，是留给大哥连上设备后逐条打的勾。
> 根因与修复证据见 [`docs/reports/2026-09-25-ghost-tabs-and-zero-percent.md`](docs/reports/2026-09-25-ghost-tabs-and-zero-percent.md)。
> 按项目规矩一律装 **release** 包（`npm run release:android:install`）；本项目未配置 `transform-remove-console`，
> 所以 release 包仍会输出 `console.log`，可直接用 logcat 取证，无需退回 debug 包。

## C0 · 前置准备

```bash
adb devices                                   # 期望：至少 1 台 device（不是 offline/unauthorized）
adb reverse --list                            # 若已有 tcp:8081 残留 → adb reverse --remove-all 再重建
npm run release:android:install               # 装 release 包
PKG=com.anonymous.soundtherapyapp
adb logcat -c && adb logcat -s ReactNativeJS:V | tee /tmp/verify.log   # 另开终端持续收日志
```

内置 5 场景 id（验证时用）：`city_rain_urban` / `nature_deep_sea` / `nature_misty_forest` / `healing_zen_bowl` / `interactive_white_noise`

---

## C1 ★主判据 · 清数据 + 真断网冷启，内置卡必须走到 Ready/100%

**这是 A″ 的验收本体：不是"不再卡 0%"，而是卡片最终变 Ready。**

```bash
adb shell svc wifi disable && adb shell svc data disable    # ⚠️ 别只点飞行图标（NetInfo 常不刷新，见 BuiltinAssetBootstrap 头注释）
adb shell pm clear $PKG                                     # 清数据 → 内置文件必然缺失
adb shell am start -n $PKG/.MainActivity
```

期望日志顺序：
```
[Builtin] 🚀 内置场景落盘开始，共 5 个
[Builtin] ✅ city_rain_urban 拷贝完成并已就绪        ← 5 条逐个出现
[Builtin] 🏁 内置场景落盘完成：就绪 5/5              ← 判据①：必须是 5/5，不能是 4/5
```
再手动点一张内置卡（例如深海）：
```
[HomeScreen] ⚡ [prioritizeScene] nature_deep_sea
[HomeScreen] 🧊 [prioritizeScene] 内置未就绪 → 本地重拷闭环(不下载/不error): nature_deep_sea
[HomeScreen] ✅ [内置闭环] nature_deep_sea 已落盘 → ready/100     ← 判据②：必须出现这一行
```
**通过判据**：卡片显示 Ready（✨/可播放），且断网状态下能真的出声。
**失败信号**：卡片停在『正在准备』且日志只有 `第 1/3 轮未落盘 → 30s 后自动重试`；此时抓 `[Builtin] ❌` 那行的 `(err.message)` 上报。

## C2 · 多轮重试链路（把"死局"证成"有界自愈"）

构造拷贝失败（让内置文件残缺 + 目标目录不可写），观察闭环是否**自动重试而不是永久静默**：

```bash
adb shell run-as $PKG ls files/audio_resources            # 找到实际落盘目录
adb shell run-as $PKG sh -c 'echo broken > files/audio_resources/fx/zen_bowl.m4a'   # 制造残缺文件
# 然后在前台点该内置卡（healing_zen_bowl）
```
期望日志：
```
[HomeScreen] ⚠️ [内置闭环] healing_zen_bowl 第 1/3 轮未落盘 → 30s 后自动重试（仍不谎报「需要网络」）
[HomeScreen] ⚠️ [内置闭环] healing_zen_bowl 第 2/3 轮未落盘 → 30s 后自动重试（仍不谎报「需要网络」）
[HomeScreen] ❌ [内置闭环] healing_zen_bowl 连续 3 轮仍未落盘 → 保持『正在准备』，下次冷启/前台恢复再试（内置绝不进 CDN）
```

## C3 · 内置卡绝不显示「需要网络 / 下载失败」（回归防线）

历史事故：深海/迷雾森林在**联网态**被误标「需要网络·点按重试」。两种网络态各验一次。

```bash
# 联网态
adb shell svc wifi enable && adb shell svc data enable
# 断网态
adb shell svc wifi disable && adb shell svc data disable
```
**通过判据（两态都要满足）**：5 张内置卡在未就绪时只显示『正在准备』，
**任何时刻都不出现**「需要网络」「下载失败」「Loading Images…」字样；已就绪的直接是 Ready。
对应纯函数不变式已被 `sceneCardStatus.test.ts` 锁死（`isBuiltin` 不得把结论翻成 error/need_network）。

## C4 · A′ 无效场景 id：不跳错标题 / 日志必须报出非法 id 本身

往持久化里塞一个历史下架 id（`life_rain_urban`），模拟"老用户升级后带着脏数据"：

```bash
adb shell am force-stop $PKG
adb shell run-as $PKG ls files | grep -i storage          # 定位 AsyncStorage 落盘文件(.json 或 .xml)
# 编辑该文件，把 LAST_VIEWED_SCENE_ID 的值改成 life_rain_urban（保持 JSON 合法），然后：
adb shell am start -n $PKG/.MainActivity
```
期望日志（两条都要有）：
```
[AudioService] ⚠️ [TrackChanged] 无效场景 id: life_rain_urban …     ← 判据①：非法 id 被点名
[AudioService] ✅ [TrackChanged] 当前播放: (无有效场景 · 保持上一场景 · 非法 id=life_rain_urban · 已记账不伪造)
                                                                  ← 判据②：null 时仍打印非法 id，不是哑巴
```
**通过判据**：① 首页/播放页标题与背景**不跳成无关场景**（旧行为会伪造出一个空 filename 的假场景并广播污染 UI）；
② 崩溃不发生；③ 脏 key 被清除（重启第二次不再出现该警告）。

## C5 · 非内置下载路径未被本轮改动带崩（回归面）

本轮只改了内置分支，但 `prioritizeScene` 是同一函数，需确认非内置链路完好：

```bash
adb shell svc wifi enable && adb shell svc data enable
# 联网态点一张【非内置】未下载场景
```
期望日志：
```
[HomeScreen] 🚀 [prioritizeScene] 启动真实下载: <id> (就绪预算=…s, 封顶=180s)
[HomeScreen] ✅ [就绪计时器] <id> 已落盘 → ready                  ← 判据①：进度通道未被破坏
```
**通过判据**：① 进度条从 0 真实爬升（不是恒 0）；② 落盘后卡片 Ready 且能播；
③ 中途断网时该卡显示「需要网络·点按重试」（非内置**允许** error，与内置策略相反）；
④ 联网后孤儿清算把它恢复（日志见 `recoverFailedOnNetworkRestore` / sweep 相关输出）。

## C6 · 需大哥手动处理的收尾项（我不碰 UI 与删除）

- [ ] 重启 VS Code TS Server：本批新增/改动 5 个文件，编辑器可能仍显示旧诊断。
- [ ] `tickSceneByAsset` 与 `runBuiltinReadinessLegacy` 两个待删对象 —— **等您关掉相关标签后**再删（本轮按新规矩未删）。
- [ ] Step B（`ResourceStatusManager` 未知 id 缓存污染）/ Step C（历史·推荐陈旧 id 清理）**仍 hold**，等您点头。
- [ ] 若 C1/C2 任一条不通过，把 `/tmp/verify.log` 里 `[Builtin] ❌` 与 `[内置闭环]` 全部行贴回来即可，我据此继续定位（不需要重跑整套取证）。

---

### 本轮已由静态闸门覆盖、**无需真机重复验证**的部分
- `resolveBaseScene` 不伪造场景、空 filename 不放行 → jest + 双向变异检验（报告 §②b）。
- 常量层 id 交叉一致（含"历史错拼 id"这类事故）→ `npm run check:scene-ids` + 变异检验（报告 §②a）。
- 内置闭环的状态机正确性（落盘才 ready / 进度单调 / 绝不写 error）→ `builtinReadiness.test.ts` 7 例。
- 类型面零污染 → tsc 规范化 diff 新增行 = 0（报告 §⑤）。

