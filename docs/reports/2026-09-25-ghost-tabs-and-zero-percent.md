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




---

## ⑨ C2 · 真机自愈验证与「永久失败终态」审计（2026-09-26 追加）

设备 `emulator-5554` / Pixel_9_Pro，release `v1.4.4`（未重编/未重装/未改源码）。
断网三态全程 `airplane=1 / wifi=0 / data=0`，`ping 8.8.8.8` → `Network is unreachable`。

### 9.0 手段偏差（结论解读前提）

| 计划手段 | 可行性 | 替代 |
|---|---|---|
| `run-as` 删沙箱内置副本 | ❌ `run-as: package not debuggable`（release） | 「我的 → 清除缓存」→ `ProfileScreen.handleClearCache` 的 `RNFS.unlink(LOCAL_RESOURCE_PATH)` |
| `adb root` + `chmod` 不可写目录 | ❌ `adbd cannot run as root in production builds`（Play 镜像，无 rootable AVD） | **同分区 ENOSPC**（`/data/user/0` 与 `/storage/emulated` 同为 `dm-5`），使 `copyFileAssets` 恒抛 `ENOSPC`；测后已清理复原 |

清除缓存副作用：整个 `audio_resources/`（含 CDN 音频）被删 + `invalidateAll()` + `clearSceneStoreAll()` +
清 `RESOURCE_READY`；APK assets 未动，用户资料不受影响。

### 9.1 C2a 自愈 —— **通过**

运行时闭环（点击未就绪内置卡）：

```
09:37:15.876 [HomeScreen] 🧊 [prioritizeScene] 内置未就绪 → 本地重拷闭环(不下载/不error): city_rain_urban
09:37:16.047 [Builtin] ✅ city_rain_urban 拷贝完成并已就绪
09:37:16.069 [HomeScreen] ✅ [内置闭环] city_rain_urban 已落盘 → ready/100      ← 194 ms
```

冷启动 bootstrap：`🚀 09:09:19.100 → 🏁 就绪 5/5 @09:09:19.284` = **184 ms**，且五条全部是
「拷贝完成并已就绪」（无一例「已就绪，跳过拷贝」）→ 真实重拷。否定性检查全 0：
`[Builtin] ❌`=0、`第 N 次拷贝失败`=0、内置 id 被拉去 CDN=0；首页四张内置卡 `Ready to Play ✨`。
C2b 之后复跑再次 `🏁 就绪 5/5`（含 zen_bowl 从卡死态恢复）。

### 9.2 C2b 永久失败终态 —— **未根治（换了形态）**

ENOSPC 维持 170 s，目标 `healing_zen_bowl`：

| 时刻 | 事件 |
|---|---|
| 10:16:04.124 | `🧊 内置未就绪 → 本地重拷闭环` |
| 每轮内 ×3 | `[Builtin] ⚠️ 第 1/2/3 次拷贝失败(... ENOSPC ...)` + `[Builtin] ❌ ... 保持「正在准备」等待下次重试(不回落CDN)` |
| 10:16:18.441 / 10:17:02.673 | `⚠️ [内置闭环] 第 1/3、2/3 轮未落盘 → 30s 后自动重试（仍不谎报「需要网络」）` |
| **10:17:46.925** | **`❌ [内置闭环] 连续 3 轮仍未落盘 → 保持『正在准备』，下次冷启/前台恢复再试`** |

耗尽耗时 **102.8 s**、拷贝尝试 **27 次**（3 轮 × 编排 3 × `ensureOneBuiltin` 内 3）全失败。

| 问题 | 实测答案 |
|---|---|
| `SceneDownloadStore` 终态 | **`status='downloading'`, `progress=90`**（`builtinReadiness.ts:113` 最后一次 tick，之后仅 `clearDownloadTimer`） |
| 卡片 UI 文案 | **「资源正在下载」** + `⬇`；**不显示百分比**（HomeScreen.tsx:368-373、:379「无转圈、无 IMG、无百分比」） |
| error / 需要网络？ | **结构上不可能**：`sceneCardStatus.ts:51 if (input.isBuiltin) return 'downloading'` 吞掉一切失败信号（设备实证） |
| store ↔ UI 一致性 | **不一致**：store 写 90，UI 不显示进度 |
| 故障解除后会话内自愈？ | **无**。ENOSPC 10:18:38 解除后再观察 ≥3 min：新增日志 **0 条**，卡片仍「资源正在下载」 |

⇒ **「永久 0%」变成「永久静默的『资源正在下载』」**：旧形态有 0%+spinner，新形态无进展、无失败提示、
无重试入口、会话内不再自愈。A″ 治好的是**可恢复故障**（C2a 已证 194 ms 闭环），**永久失败路径仍无终态出口**。


### 9.3 终态设计提案（**等批，本轮一律未改代码**）

- **方案 A（推荐 · 最小面）**：新增只读终态 `builtin_stalled`（或 store 增 `attemptsExhausted: true`）；
  `resolveSceneCardStatus` 在 `isBuiltin && !audioReady && attemptsExhausted` 返回该态，文案「本地准备受阻 ·
  点按重试」，点击复用现有 `runBuiltinEnsure`。不引入 CDN，不触碰「内置永不 error / 绝不谎报需要网络」不变式。
- **方案 B（风险高）**：复用 `error` + 在 `sceneCardStatus.ts:51` 对 isBuiltin 放行 —— ⚠️ 会重新引入
  `f877c429` 修过的「内置被误标需要网络/下载失败」回归；若走此路必须配套内置专用文案，禁止复用
  `need_network`/`error` 文案。
- **方案 C（与 A 正交）**：`30s × 3 轮` 改为低频长周期（指数退避封顶）+ 前台恢复/磁盘可写信号触发，
  让"迟到恢复的临时故障"也能在会话内自愈。
- **一致性修正**：卡片要么显示真实 `progress`（现在写 90 却不显示），要么统一不写 progress。

### 9.4 NoiseLab 离线死锁（ticket）+ ResourceStatusManager failed 记录取证

**Ticket**：内置白噪音已在盘却进不去 —— NoiseLab 入口以 32 个 CDN 文件为门禁，离线永久不可达。

```
[HomeScreen] 🎯 [悬浮球点击] 开始检查降噪实验室资源...
[HomeScreen] ⚠️ [悬浮球点击] 资源未全部就绪，触发后台静默预下载   （Toast: 资源准备中，稍后再试）
[ResourceDownloadScreen] 🎯 targetFiles 模式 START：并发=3，开始下载 32 个指定文件
[ResourceDownloadScreen] ❌ [1/32] 下载异常: Unable to resolve host "ghproxy.net": No address ...  （×32）
[HomeScreen] ✅ [silentPreDownload] 完成：成功=0, 失败=32
```

根因：门禁 `checkAllNoiseResourcesReady()`（HomeScreen.tsx:831）只查 4 组 ×8 = **32 个 CDN 轨道**，与内置
`interactive_white_noise` 无关；离线恒 false → 每次点击重跑整轮，无退避、无失败态、无进度。

**是否向 ResourceStatusManager 写 failed？——否，零持久化**：

1. 该模块缓存只有 `audioStatusCache`/`imageStatusCache`（存在性布尔），`clearCache()`(:260-268) 仅清这两个
   Map，**无 failed 记录结构**。
2. `checkSceneResourceStatus()`(:144-181) 的 `'error'` 是**实时派生**自 `DownloaderService.getAllStatus()`
   的 `'failed'`（:161-167）→ 失败账本在 DownloaderService 内存态，不在本模块。
3. NoiseLab 走 `downloadTargetFilesAsync`（`ResourceDownloadScreen.tsx:33`），失败仅 `errors.push()` 进**局部
   数组**（:41/:66/:112），`silentPreDownloadAll`(:860-862) 打印计数后丢弃 → 三方都不落。
   设备佐证：noise 相关 `ResourceStatus`/`tickScene` error 写入 **0 条**。

**B 批输入**：CDN 失败目前无任何落点；若要"离线诚实告知 + 有界重试 + 失败可视化"，需先建带原因分类
（offline/enospc/http_xxx/manifest_missing）的失败账本，且必须与内置「绝不 error」不变式分区。

### 9.5 顺带发现的存量缺陷（记账不修）

1. 清除缓存后必报 `❌ [清除缓存] 下载触发失败: [TypeError: undefined is not a function]`，3/3 复现；
   附近有"临时注释 progress 回调以规避同类报错"的痕迹（`ResourceDownloadScreen.tsx:92-95`）。
2. 「为你推荐」hero 卡未接 `onBoostPriority`：未就绪时点击无反应、无日志。
3. `RecommendationEngine.test.ts:159` 用 `hour: new Date().getHours()` → **挂钟依赖 flake**（今日 08:56 红、
   10:2x 绿）。已在 HEAD 干净 worktree 同钟点复现同样失败，证明是存量问题、非 A″ 引入。

### 9.6 C2 门禁口径

| 项 | 结果 |
|---|---|
| 检查点提交 | `e6bfe56a`（18 files, +1300/−41；`buildInfo.ts` 属 `.gitignore:129` 生成物未提交；`CHECKLIST.md` → `docs/`） |
| tsc | before=174 / after=174，规范化 diff **新增行(>)=0、删除行(<)=0** |
| jest | **20 suites / 149 tests 全通过** |
| `check:scene-ids` | exit 0 |

完整取证细节见 `/tmp/c2/C2-result.md`（日志：`c2a_coldstart.log`、`c2b_after.log`、`noise_forensics.log`）。

