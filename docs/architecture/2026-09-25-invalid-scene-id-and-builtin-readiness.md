# 根因结论归档 · 无效场景 id 伪造兜底 & 内置场景永久 0%

> 归档原因：本会话 supermemory MCP 不在工具列表中，按项目规则「代码库才是长期记忆」，
> 把已验证的根因结论落到仓库。检索关键词：`resolveBaseScene` / `TrackChanged` / `tickSceneByAsset`
> / `ensureBuiltinReady` / `sceneCardStatus:51` / `永久0%` / `正在准备`。

---

## 结论一：AudioService.TrackChanged 的伪造 Scene 兜底（已修复已验证）

[esonare-soundtherapy-pro] `src/services/AudioService.ts` TrackChanged 分支:
「查不到场景就 `{ id, title, filename:'', category, duration:0 } as Scene` 伪造」是脏状态源头，已改为不伪造、保持上一有效场景。

状态: 已修复已验证（jest + tsc 双闸门；真机行为待 CHECKLIST）

细节:
- 解析决策抽到 `src/services/BaseSceneResolver.ts::resolveBaseScene(rawId)` 纯函数，三条不变式：
  非法/空 id → `ok:false` 且**不返回任何 Scene 实例**；`ok:true` 时 `filename` 必为非空串；不抛异常。
- 唯一合法场景来源是 `src/constants/scenes.ts::findScene()`（基于 `SCENE_INDEX` 全局索引）；
  外部/不可信 id 的查找已全部迁移到它（HistoryService / RecommendationEngine / ImmersivePlayerNew / BreathDetailScreen / HomeScreen 持久化入口）。
- **曾证伪的假设**：最初推断"无效 id 导致下载永久 0%"。实际下载 URL 由 manifest 按字符串 id 反查、
  下载队列路径也只用字符串 id，均不读伪造对象的 `filename` ⇒ 无效 id 主要污染 UI 状态与监听者，**不是** 0% 的成因。

---

## 结论二：内置场景「永久正在准备 0%」= 三方合谋（本批已修 A″）

[esonare-soundtherapy-pro] `HomeScreen.prioritizeScene` 内置分支 + `sceneCardStatus.ts:51`:
UI 层对「内置 + 未就绪」**无条件**返回 `'downloading'`，因此**给超时补 error 出口是无效的**——error 会被那行吃掉，用户连失败都看不见。

状态: 已修复待真机验证（jest 红→绿证据链完整）

细节:
1. `src/utils/sceneCardStatus.ts:51` `if (input.isBuiltin) return 'downloading';`
   —— 产品决策「内置永不 error / 不需网络」的副作用：只要 `audioReady=false`，卡片文案被永久钉死为『正在准备』。
2. 旧 `HomeScreen` 内置分支三处缺陷：① `boot.reensure(sceneId)` 的 `Promise<boolean>` 被整个丢弃（fire-and-forget）；
   ② 拷贝失败后不再重拷，只等磁盘自己变好；③ 轮询到点仅 `clearDownloadTimer()`，本轮会话内再无自愈路径。
3. UI 就绪的唯一真相是 `OfflineService.readyIds`（磁盘 exists + size≥期望95%）。
   ⇒ **唯一致愈路径 = 让 `audioReady` 必然可达**，而不是在状态机上补错误出口。
4. 修法：新增 `src/utils/builtinReadiness.ts::ensureBuiltinReady()`（消费拷贝结果 + 退避重拷 + 磁盘复核，
   落盘才写 `ready/100`；进度封顶 90；**绝不写 error**），HomeScreen 单轮未成功则隔 30s 再来一轮、最多 3 轮。

---

## 结论三：`tickSceneByAsset` 是双重死代码（待删，勿删）

[esonare-soundtherapy-pro] `src/utils/SceneDownloadStore.ts::tickSceneByAsset`: 全仓**零调用点**，且函数体内 `sceneMap` 恒空。

状态: 已确认根因 / 待大哥关标签后删除（本轮按规矩未删，仅加 `// DEAD:` 标记）

细节:
- `grep -rn "ByAsset" src __tests__` 仅命中定义行 ⇒ 属「无人调用」，**不是**「被调用但进度被静默丢弃」。
- 即便被调用也无效：当前 manifest 80 条中 `sceneKey` 出现 **0** 次，`if (!item.sceneKey) continue;` 会跳过全部条目。
- 真实下载进度通道是 `DownloaderService → tickScene(sceneId, state)`（按场景 id 直达），与该函数无关。
- 闸门 `scripts/check-scene-ids.js` 的 E 项会在将来有人补上 `sceneKey` 时校验其指向现存场景。

---

## 元规范（供 codebase-memory 重新索引时随节点检索）

- `@architecture-constraint` @ `src/services/BaseSceneResolver.ts`:
  **禁止返回任何合成/new Scene 对象**；id→场景的唯一合法来源是 `findScene()`。查不到就明确失败，由调用方保持上一有效值。
- `@architecture-constraint` @ `src/utils/builtinReadiness.ts`:
  **内置场景绝不写 `'error'`、绝不回落 CDN**。内置音频随 APK 打包，缺失只是本地拷贝待重试；
  「正在准备」是诚实态，谎报「需要网络」是已发生过的回归（见 `sceneCardStatus.ts:47-51`）。
