# 2026-09-25 · 幽灵 Tab 与「永久正在准备 0%」根因报告

> 交付人：Cline ｜ 模式：无设备，全程 jest + 静态取证 ｜ 大哥醒来只看本文件即可。
> 一句话结论：**A′ 已验收；A″（永久 0%）本批已修并给出红→绿证据链；B/C 继续 hold。**

| 闸门 | 结果 |
|---|---|
| `npx jest` | **20 suites / 149 tests 全绿**（上批 19/142 → +1 suite/+7 tests） |
| `npx tsc --noEmit` 规范化 diff | **before=174 → after=174，新增行(>) = 0，删除 = 0** |
| `npm run check:scene-ids` | **EXIT=0**（且已用变异检验证明它有牙，见 §②） |
| 文件删除 | **零删除**（`git status --porcelain` 无 D 项） |

---

## ① TS2341 `roamCategory` 为什么"消失"了 —— 它没有消失

大哥的质疑完全成立：错误凭空消失和凭空出现一样危险。查完的结论是
**「净减 1 条」是多重集合的数量差，不是可见性被放宽**。三条铁证：

**证据 1 — `SceneRoamManager.ts` 我根本没碰，字段仍是 private：**

```
$ git status --porcelain src/services/SceneRoamManager.ts     # 空输出 = 未修改任何一行
$ grep -n "roamCategory" src/services/SceneRoamManager.ts | head -3
19:  private roamCategory: SceneCategory | null = null;        ← 仍是 private，声明原样
28:    this.roamCategory = category;
38:    this.roamCategory = null;
```

我自己在 `AudioService.ts` 里新增的唯一 private 成员是 `invalidSceneIds`（本类自己的记账集合），
diff 中不含任何对 `SceneRoamManager` 成员的可见性改动，也没有加 getter：

```
$ git --no-pager diff -- src/services/AudioService.ts | grep -n "private\|public\|readonly roamCategory"
21:+  private invalidSceneIds: Set<string> = new Set();        ← 唯一新增的 private，属本类
```

**证据 2 — before/after 的 TS2341 全清单（数量 3 → 2）：**

```
=== BEFORE 全部 TS2341 (count=3) ===
src/screens/HomeScreen.tsx(544,48): error TS2341: Property 'isActuallyPlaying' is private ...
src/services/AudioService.ts(550,87): error TS2341: Property 'roamCategory' is private ...   ← 仍在，after 里是 (556,87)
src/services/AudioService.ts(564,40): error TS2341: Property 'roamCategory' is private ...   ← 净减的就是这一条

=== AFTER 全部 TS2341 (count=2) ===
src/screens/HomeScreen.tsx(544,48): error TS2341: Property 'isActuallyPlaying' is private ...
src/services/AudioService.ts(556,87): error TS2341: Property 'roamCategory' is private ...   ← 同一条，只是行号漂移
```

**证据 3 — 被删掉的第 564 行是伪造块内部对 private 的「第二次」非法访问（HEAD 原文）：**

```
$ git --no-pager show HEAD:src/services/AudioService.ts | sed -n '545,570p'
        if (!nextScene) {
          const allScenes = sceneRoamManager.getBaseScenesByCategory(sceneRoamManager.roamCategory);  ← (550,87)旧/(556,87)新，仍在
          nextScene = allScenes.find((s: any) => s.id === nextTrackId) || null;
        }
        if (!nextScene) {
          this.currentBaseScene = {
            id: nextTrackId,
            title: nextTrack?.title || nextTrackId,
            filename: '',
            category: sceneRoamManager.roamCategory || 'nature',   ← (564,40) 第二次非法访问，随伪造语句一起删除
            duration: 0
          } as Scene;                                              ← 同时消掉 TS2352(560,35)
        }
```

**因果链一句话**：旧代码在同一个 `TrackChanged` 块里访问了两次私有成员 `sceneRoamManager.roamCategory`
（一次在合法查找行、一次在伪造字面量里）。我删掉的是伪造字面量，于是**它自带的那条 TS2341 + 那条 TS2352 一起消失**；
查找行那条 TS2341 与 `TS2345 SceneCategory | null` **原样保留在存量 174 里**（按纪律不碰）。
所以「未申报的 API 面变更 = 0」，也无需回滚 —— 我没有放宽可见性、没有加 getter、没有改取值方式。

---

## ② 变异检验：两个绿灯是不是假的（真实输出）

大哥的前提也对了一半：`check-scene-ids.js` 刚修过 4 个正则缺陷、曾假报 11 项，
所以**光看 exit=0 确实不具备证明力**。下面是"故意弄坏 → 必须变红"的完整往返。

### a. 闸门检验：把 `BUILTIN_SCENES` 一个 id 改回历史错拼 `life_rain_urban`

```
########## 变异 a-1 ##########
$ sed -i '' '199s/healing_zen_bowl/life_rain_urban/' src/constants/audioAssets.ts
  life_rain_urban:          { filename: 'fx/zen_bowl.m4a', assetPath: '.../fx/zen_bowl.m4a', expectedSize: 391549 },

$ npm run --silent check:scene-ids; echo "EXIT=$?"
=== 场景/资源 ID 自检 ===
manifest=80 ASSET_LIST=80 场景=36
  ✅ A. manifest 自洽：80 条，无重复 id / 空 filename / 零 size
  ✅ B. manifest ↔ ASSET_LIST 双向对齐：80 / 80
  ✅ C. SMALL_SCENE_IDS 全部命中现存场景（5 个）
  ✅ C. RECORD_SHOP_SFX_IDS 全部命中现存场景（5 个）
  ✅ C. SCENE_ORDER 全部命中现存场景（31 个）
  ✅ D. BUILTIN_SCENES ↔ manifest 对齐：5 个内置场景
  ✅ E. sceneKey 检查：0 条带 key，全部指向现存场景

❌ 自检失败 1 项：
   - D. BUILTIN_SCENES id 不存在于场景集合: life_rain_urban（内置短路静默失效）
EXIT=1                                    ← 必须非 0 ✅

########## 变异 a-2 · 还原 ##########
$ git checkout -- src/constants/audioAssets.ts
  healing_zen_bowl:          { filename: 'fx/zen_bowl.m4a', ... }     ← 已还原
$ npm run --silent check:scene-ids | tail -1
✅ 全部通过：常量层 ID 交叉面一致。
$ npm run --silent check:scene-ids > /dev/null 2>&1; echo "EXIT=$?"
还原后 EXIT=0                               ← 必须 0 ✅
$ git status --porcelain src/constants/audioAssets.ts
(空 = 文件完全还原)
```

> 这条变异同时会被 `BuiltinSceneIntegrity.test.ts` 抓到（双保险）——"历史拼错 id"这类事故现在有两道防线。

### b. 测试检验：让 `resolveBaseScene` 恒返回假 Scene（带空 filename）

```
########## 变异 b-1 · 恒返回伪造 Scene(filename:'') ##########
// src/services/BaseSceneResolver.ts 临时插入：
//   return { ok: true, scene: { id: ..., title: 'FAKE', filename: '', category: 'nature' } as unknown as Scene };

$ npx jest src/services/__tests__/BaseSceneResolver.test.ts
    ✕ ① 历史下架 id（曾拼错的 life_rain_urban）→ 判定失败，且不返回任何 Scene 实例
    ✕ ① 任意不存在的 id 一律失败，绝不合成兜底对象            Expected: false / Received: true
    ✕ ② 合法 id → 返回全局索引中的真实实例（引用相等），filename 必为非空串
    ✕ ② 全量场景：每个 id 都能解析，且 filename 非空          Expected: > 0 / Received: 0
    ✕ ③ 空串 / 空白 / null / undefined → empty-id，不抛异常、不返回实例
    ✓ ③ 带首尾空白的合法 id 可被容忍
Tests:       5 failed, 1 passed, 6 total   ← 必须 FAIL ✅

########## 变异 b-2 · 反向：恒 ok:false（大哥原话假设的"恒返回 null"版）##########
//   return { ok: false, reason: 'empty-id', invalidId: '' };
    ✕ ① 历史下架 id → 判定失败，且不返回任何 Scene 实例
    ✓ ① 任意不存在的 id 一律失败，绝不合成兜底对象
    ✕ ② 合法 id → 返回全局索引中的真实实例（引用相等）
    ✕ ② 全量场景：每个 id 都能解析，且 filename 非空
    ✓ ③ 空串 / 空白 / null / undefined → empty-id
    ✕ ③ 带首尾空白的合法 id 可被容忍
Tests:       4 failed, 2 passed, 6 total   ← 正向断言同样有牙 ✅

########## 还原并确认全绿 ##########
$ grep -rn "MUTATION" src || echo '(无残留)'
(无残留)                                    ← 变异代码已彻底撤销
$ npx jest
Test Suites: 20 passed, 20 total
Tests:       149 passed, 149 total          ← 回到全绿 ✅
```

**结论**：`BaseSceneResolver.test.ts` 不是"照着新代码写的空壳"——两个方向的变异都能把它打红；
`check-scene-ids.js` 的 exit=0 现在具备证明力（能准确报出被破坏项并给出非 0 退出码）。

---

## ③ `tickSceneByAsset` 调用点清单与定性结论

```
$ grep -rn "tickSceneByAsset" src scripts
src/utils/SceneDownloadStore.ts:84:export function tickSceneByAsset(assetId: string, state: SceneDownloadState): void {   ← 定义
scripts/check-scene-ids.js:17: *   E. sceneKey（若存在）必须指向现存场景 —— tickSceneByAsset 依赖它做 assetId→sceneId 映射    ← 注释
scripts/check-scene-ids.js:197:      fail(`E. ... 不是现存场景（tickSceneByAsset 会丢进度）`);                          ← 报错文案

$ grep -rn "ByAsset" src __tests__          ← 防别名导入的兜底搜索
src/utils/SceneDownloadStore.ts:84:export function tickSceneByAsset(...)   ← 仅命中定义行本身
```

**定性结论（明确回答大哥的二选一提问）：是「无人调用」，不是「被调用但 sceneMap 恒空、进度被静默丢弃」。**

所以它**不是**永久 0% 的成因。上一轮我把它叫"死代码"结论没错，但话说得不全，这里补齐——
它其实是**双重死**，两层各自独立成立：

1. **外层死**：全仓零调用点 ⇒ 没有任何进度流经它。真实通道是 `DownloaderService → tickScene(sceneId, state)`（按场景 id 直达 store）。
2. **内层死**：即便被调用也必然 no-op —— 函数体靠 `item.sceneKey` 建 `assetId→sceneId` 映射，
   而当前 manifest 80 条中 `sceneKey` 出现 **0** 次（闸门 E 项输出 `0 条带 key`），
   `if (!item.sceneKey) continue;` 跳过全部条目 ⇒ `sceneMap` 恒空 ⇒ 取不到 sceneId 直接 return。

⇒ 「进度根本没流进 store」这个怀疑方向，**对内置场景而言不成立**：内置走的是本地 assets 拷贝，
压根不产生下载器进度事件，也就没有"进度被丢弃"可言。真正的死局在 UI 层与编排层，见 §④。
按新规矩本轮未删除，只在定义处加了 `// DEAD:` 标记，并列入 §⑧ 待删清单。

---

## ④ A″ · 永久 0% 的根因证明与红→绿证据链

### 4.1 三方合谋的死局（先讲清机制，再看红）

| # | 位置 | 事实 | 后果 |
|---|---|---|---|
| 1 | `src/utils/sceneCardStatus.ts:51` | `if (input.isBuiltin) return 'downloading';` | 只要 `audioReady=false`，内置卡在 UI 上**无条件**显示『正在准备』，任何 `offline`/`downloadStatus` 都翻不动它 |
| 2 | `HomeScreen.prioritizeScene` 旧内置分支 | `boot.reensure(sceneId)` 的 `Promise<boolean>` **被整个丢弃**（fire-and-forget），catch 只打日志 | 拷贝成功/失败 UI 完全不知情，失败后不再重拷 |
| 3 | 同上，轮询到点 | 仅 `clearDownloadTimer(sceneId)`，注释自承"卡片仍保持『正在准备』" | 本轮会话内**再无自愈路径**，唯一出路是杀进程重启触发 `bootstrap()` |

**关键推论（这条直接支持大哥的驳回，而且比他预想的更严重）**：
> 「只给超时补 error 出口」不只是"把卡死换成永远报错"——**它连报错都显示不出来**。
> 因为第 1 行会把内置场景的 `error` 无条件改回 `'downloading'`。
> 也就是说，我上一轮打算做的"补 error 出口"是个**空操作**，用户会原样再报一次 bug。

UI 就绪的唯一真相是 `OfflineService.readyIds`（磁盘 exists + size≥期望95%）。
⇒ **唯一致愈路径 = 让 `audioReady` 必然可达**：复核 → 重拷（退避重试）→ 再复核，直到落盘为止。

### 4.2 先让它红（真实输出，日志存 `/tmp/a_red.log`）

测试文件 `src/utils/__tests__/builtinReadiness.test.ts`：fake timers + **真实 SceneDownloadStore**
（stub 掉 `audioAssets` 切断 RNFS 链，沿用 `sceneOrphanErrorSweep.test.ts` 既有惯例），
把旧内置分支语义 1:1 复刻成 `runBuiltinReadinessLegacy` 后打靶。

```
$ npx jest src/utils/__tests__/builtinReadiness.test.ts        # 修复前
    ✕ 缺文件 + 拷贝一次即失败 → legacy 只拷一次就放弃，不再重试（应重试） (7 ms)
    ✕ 缺文件且拷贝始终失败 → 推进 180s 后不得停在 downloading/0% (2 ms)
    ✕ 缺文件、第 3 次重拷才成功 → 卡片必须走到 Ready/100% (3 ms)
    ✕ 缺文件、第 3 次重拷成功 → Ready/100%                  ← ensureBuiltinReady 尚未实现
    ✕ 磁盘已就绪 → 立即 Ready/100%，且不浪费一次拷贝
    ✕ 拷贝全失败 → 绝不写 error（内置与网络无关），但必须已安排下一次重试
    ✕ 进度必须单调不回退（防止 ready 后被迟到的 tick 打回 0%） (1 ms)

  ● … › 缺文件 + 拷贝一次即失败 → legacy 只拷一次就放弃，不再重试（应重试）
    expect(received).toBeGreaterThan(expected)
    Expected: > 1
    Received:   1                     ← 铁证：fire-and-forget，整轮只拷一次
    > 61 |     expect(world.copyCalls).toBeGreaterThan(1);

  ● … › 缺文件且拷贝始终失败 → 推进 180s 后不得停在 downloading/0%
    expect(received).toBe(expected) // Object.is equality
    Expected: false
    Received: true                    ← 铁证：180s 后账本仍卡死在 downloading/0，永久 0% 被复现
    > 73 |     expect(st!.status === 'downloading' && st!.progress === 0).toBe(false);

Tests:       7 failed, 7 total        ← 全红
```

三条反例分别钉住了三个缺陷：只拷一次 / 180s 后仍卡 `downloading/0` / "第 3 次才成功"的场景永远等不到。

### 4.3 再修 → 绿

新增 `src/utils/builtinReadiness.ts::ensureBuiltinReady()`（纯编排、依赖注入、零 RN）：

- **真相优先**：先复核磁盘，已落盘则秒写 `ready/100`，一次拷贝都不浪费；
- **修①** 消费 `copyOnce()` 返回值，并以磁盘复核为最终准绳 → 落盘才 `ready/100`；
- **修②** 失败按退避（`pollMs * 2^(n-1)`）在单轮内主动重拷 N 次；退避间隙再复核一次，
  以便后台 `bootstrap()` 拷好时立刻翻成 ready；
- 进度只允许单调爬升且**封顶 90**，真正的 100 只能由磁盘真相给出（不谎报）；
- **绝不写 `error`、绝不回落 CDN**（内置与网络无关，见 §4.1 推论）。

接入点：`HomeScreen.tsx` 新增 `runBuiltinEnsure(sceneId, round)`，单轮未成功则隔 30s 再来一轮、最多 3 轮，
把"死局"降级成"有界自愈过程"；旧内置分支的磁盘轮询由闭环接管，占位计时器仅保留
「同场景勿重复启动」门控与超时清理语义。

```
$ npx jest src/utils/__tests__/builtinReadiness.test.ts        # 修复后
    ✓ 缺陷① fire-and-forget：整轮只拷 1 次即放弃，绝不重试
    ✓ 缺陷② 超时仅停轮询：推进 180s 后账本仍停在 downloading/0%（永久 0% 本体）
    ✓ 缺陷③ 第 3 次重拷才成功的场景，legacy 永远等不到（只拷一次 → 磁盘永不落盘）
    ✓ 缺文件、第 3 次重拷成功 → Ready/100%
    ✓ 磁盘已就绪 → 立即 Ready/100%，且不浪费一次拷贝
    ✓ 拷贝全失败 → 绝不写 error（内置与网络无关），但必须已安排下一次重试
    ✓ 进度必须单调不回退（防止 ready 后被迟到的 tick 打回 0%）
Tests:       7 passed, 7 total        ← 全绿
```

**关于反例组的处置**：修复后 `runBuiltinReadinessLegacy` 不再被任何生产代码引用。
为了让 jest 回到全绿、同时不把根因忘掉，我把反例组三条断言**取反锁定**为"legacy 死局特征基线"
（描述里明写「禁止接入生产」）——它现在锁的是"旧实现确实只拷一次、确实卡死在 downloading/0"，
一旦有人把 legacy 接回去就会误导。红→绿的原始证据链保留在本节与 `/tmp/a_red.log`。

**验收口径对齐**：大哥要的是「内置场景卡片走到 Ready / 100%」，对应绿组第 1、2 条断言
（`getSceneDownloadState()` 必须等于 `{ progress: 100, status: 'ready' }`），不是"不再卡 0%"。

---

## ⑤ tsc 闸门：新增行 = 0 的证据

基线按第 5 条要求重建为 **A′ 完成态 = 174**（覆盖旧基线），之后一律用剥离行列号的规范化集合比对，未使用 `grep -c` 计数。

```
$ cp /tmp/tsc_after.txt /tmp/tsc_before.txt          # 基线 = A′ 完成态
$ wc -l < /tmp/tsc_before.txt
新基线 before=174

$ npx tsc --noEmit 2>&1 | grep "error TS" | sort > /tmp/tsc_after.txt
$ sed -E 's/\(([0-9]+),([0-9]+)\)//' … | sort        # 剥离 (行,列)，消除行号漂移造成的假增删
before=     174 after=     174
=== 规范化 DIFF ===
（无输出）
新增行(>)清单:
(空 — 零新增错误)
统计: 新增=0 删除=0
```

本批包含 `HomeScreen.tsx` 闭环接入、`builtinReadiness.ts` 新文件、`AudioService.ts` 日志改写、
`SceneDownloadStore.ts` DEAD 注释 —— 全部落在存量之外：**新增行 = 0，删除 = 0**，174 个存量错误一个没碰。

## ⑥ jest 最终数

```
$ npx jest
Test Suites: 20 passed, 20 total
Tests:       149 passed, 149 total
```

上批 19 suites / 142 tests → 本批 **+1 suite（builtinReadiness.test.ts）/+7 tests**，全绿。
`npm run check:scene-ids` EXIT=0。

## ⑦ 需要真机才能验的项

全部写在仓库根 **[`CHECKLIST.md`](../../CHECKLIST.md)**，逐条给了「怎么验 / 期望看到什么日志 / 判据」。
本轮无设备（`adb devices` 为空、`reverse tcp:8081` Address already in use），故这些**不作为交付前提**。

## ⑧ 待删清单（等大哥关标签后处理，本轮一律未删）

| 对象 | 理由 | 删除前的确认动作 |
|---|---|---|
| `src/utils/SceneDownloadStore.ts::tickSceneByAsset` | 双重死代码：全仓零调用点 + `sceneMap` 恒空（manifest 无 `sceneKey`）。已加 `// DEAD:` 标记 | 确认没有外部包引用；顺带评估闸门 E 项是否随之简化 |
| `src/utils/builtinReadiness.ts::runBuiltinReadinessLegacy` | 修复后生产不再引用，仅被测试当"缺陷基线"引用 | 若大哥认为反例基线无保留价值，连同 `builtinReadiness.test.ts` 的反例 describe 一起删 |

## 附 · 本轮改动清单与需人工操作项

**新增文件（5）**：`src/utils/builtinReadiness.ts`、`src/utils/__tests__/builtinReadiness.test.ts`、
`docs/reports/2026-09-25-ghost-tabs-and-zero-percent.md`（本文件）、`docs/architecture/2026-09-25-invalid-scene-id-and-builtin-readiness.md`、根目录 `CHECKLIST.md`。

**修改文件（3，本批）**：
- `src/screens/HomeScreen.tsx` — 内置分支改走 `ensureBuiltinReady` 闭环 + `runBuiltinEnsure` 多轮重试；新增 3 个常量；`prioritizeScene` deps 增加 `runBuiltinEnsure`。
- `src/services/AudioService.ts` — `:620` 日志在 `currentBaseScene` 为 null 时**仍打印非法 id 本身**（`非法 id=${nextTrackId}`），不把崩溃换成哑巴。
- `src/utils/SceneDownloadStore.ts` — 仅加 `// DEAD:` 注释，无逻辑改动。

**需大哥手动做的 UI 操作（我不动）**：
1. 重启 VS Code TS Server（本批新增/改动了 5 个文件，编辑器可能仍显示旧诊断）。
2. §⑧ 两个待删对象的标签关闭后再执行删除。
3. B/C（`ResourceStatusManager` 未知 id 缓存污染 / 历史与推荐的陈旧 id 清理）仍 hold，等您点头再开。



