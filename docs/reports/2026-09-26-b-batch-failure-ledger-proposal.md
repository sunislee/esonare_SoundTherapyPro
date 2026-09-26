# B 批提案 · CDN 失败账本与诚实告知（草案，2026-09-26）

> 状态：**待大哥批准，未动工**。来源：C2b 取证（`/tmp/c2/C2-result.md` §3.2、
> `docs/reports/2026-09-25-ghost-tabs-and-zero-percent.md` §9.4/§10）。
> 本批 A/C 已把**内置域**闭环做死；B 批处理的是 **CDN 域**——两者必须分区，互不污染。

## 1. 问题陈述（取证已证）

1. CDN 失败目前**没有任何落点**：`ResourceStatusManager` 无 failed 记录结构（缓存仅存在性布尔）；
   `'error'` 状态实时派生自 `DownloaderService.getAllStatus()` 的内存 `'failed'`，进程重启即失忆。
2. NoiseLab 32 文件走 `downloadTargetFilesAsync`，失败只进局部数组即丢弃
   （`ResourceDownloadScreen.tsx:41/66/112`、`HomeScreen.silentPreDownloadAll:860-862`）。
3. 后果：离线打开未下载完的 CDN 场景 → UI 只能笼统「需要网络」，无法区分"没网"与"下过但坏了/被清了"。

## 2. 目标与非目标

**目标**
- G1 失败账本：`FailureLedger`（内存 + MMKV 可选持久化），记录 `{sceneId, reason, count, lastAt}`；
  reason 分类：`offline | enospc | http_<code> | checksum | manifest_missing | unknown`。
- G2 诚实告知：CDN 卡在 `need_network` 之外可显示「上次下载失败 · 点按重试」类文案（具体 i18n 另定）；
  有界自动重试（如前台时 3 次），超限后只手动。
- G3 修 TypeError：`ProfileScreen.tsx:214` 调用的 `DownloaderServiceInstance.startBackgroundDownload()`
  不存在（历史修复 `f83758ab` 未合入 HEAD 祖先链）——补方法或改调用点，以考古 f83758ab 原方案为准。

**非目标（铁律分区）**
- ❌ 绝不触碰内置域不变式：`isBuiltin` 短路优先于一切 error/ledger 派生；内置永不 `need_network`/`error`/ledger 记账
  （已由 `sceneCardStatus.test.ts` 【A · 不变式②】组锁定，B 批改动必须保持该组常绿）。
- ❌ 不改 RecommendationEngine（h∈{6,7,8} 去重盲区是否调权另立小项，避免与本批耦合）。

## 3. 设计草图

```
DownloaderService ──onFailed(reason)──► FailureLedger ──subscribe──► UI(sceneCardStatus v2)
ResourceDownloadScreen ──errors[]────► FailureLedger（补上现在被丢弃的落点）
                                        │
                    ResourceStatusManager.checkSceneResourceStatus 读 ledger 派生 'download_failed'
```

- reason 分类在**采集端**做（能拿到 errno/HTTP code 的地方），ledger 只存事实不做策略。
- `sceneCardStatus` 新卡态 `download_failed` 仅在 `!isBuiltin && !audioReady && ledger.has(id)` 时可达——
  与 stalled 专属域对称，各加一组不变式测试。
- 持久化用 MMKV（项目已在用）；提供「清除缓存」联动清账策略（待批：清缓存后失败记录是否保留）。

## 4. 验收口径草案

- jest：ledger 单测 + sceneCardStatus v2 全组合不变式（含 stalled/need_network/download_failed 三态互斥域）；
- tsc 规范化 diff 新增行 = 0；`check:scene-ids` exit 0；
- 真机（release 包）：飞行模式点 CDN 卡 → 「需要网络」；恢复网络自动/手动重试成功 → ready；
  清缓存触发路径不再出现 TypeError（G3 直接验收点）。

## 5. 风险与依赖

- DownloaderService 是 ~4000 行大文件，reason 采集点分散——建议先只做 G3 + ledger 骨架（内存版），
  G2 UI 文案第二批再上，控制单次爆炸半径。
- 若本地模型跑该文件跨文件综合分析出现失控，按协作规则转 Claude。