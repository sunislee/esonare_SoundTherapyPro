# experiments/laya —— 本地 Laya 推荐实验（已停用 / 归档）

## 这是什么
一次「用本地大模型做声景推荐」的技术验证，包含三部分：
- `laya_service.py` —— Flask 后端，加载 HuggingFace `convaiinnovations/laya` 的 **typed-decisions** checkpoint，对 5 个逻辑场景（rain / white_noise / forest / ocean / meditation）做 choice 分类。
- `LayaRecommendationService.ts` —— App 侧请求封装（BaseURL / 超时 / 错误分类）。
- `LAYA_LOCAL_SETUP.md` —— 当时的部署与联调指南。

## 为什么停用（评测数据，勿再尝试"调参救活"）
- **Top-1 命中率 ≈ 3/23 = 13%**，低于 5 类随机基线（20%）。
- **confidence ≈ 0.01**（温度校准后），概率近乎均匀分布，模型对 mood×sleep→声景路由几乎无判别力。
- 客户端置信阈值 0.5 vs 实际 ~0.015 → AI 卡片触发率≈0%，实为死代码。
- **根因在输入端**：App 内没有真实情绪信号（mood 由时段粗估），模型侧任何 criteria / temperature / 阈值调优都没有增量信息。

因此产品决策 = 规则引擎 `src/services/RecommendationEngine.ts` 作为唯一推荐源，本目录整体移出 release。

## 如何恢复启用（若将来接入真实情绪输入再评估）
1. 把三个文件移回原位：`laya_service.py`→仓库根、`LayaRecommendationService.ts`→`src/services/`、指南→根或 `docs/`。
2. 联网预热一次模型缓存（之后可离线）：
   ```bash
   source ~/laya_env/bin/activate
   python -c "from huggingface_hub import snapshot_download as s; s('convaiinnovations/laya', allow_patterns=['typed-decisions/*'])"
   ```
3. 启动：`LAYA_PORT=5057 python experiments/laya/laya_service.py`（macOS 隔空接收器占用 5000）。
4. App 侧把 `LayaRecommendationService.ts` 的 `PORT` 与服务端口对齐；首页重新接回健康探测 + 高置信覆盖逻辑。
5. **前置条件**：先有可写入的真实 mood 信号，否则命中率仍会卡在随机水平，不要上线。

## 规则引擎运行期实际生效维度（mood='unknown' 修复后现状）
唯一推荐源 `src/services/RecommendationEngine.ts` 支持 4 个输入，当前接线：
- **hour**（设备时钟）= **LIVE**，驱动时段加分（夜间禅钵/雨声、午间白噪音…）。
- **recentScenes** = **LIVE**：`RECENT_VIEWED_SCENE_IDS`（环形最近4个，写入方 `ImmersivePlayerNew` 进入播放页时 `pushRecentScenes`），驱动 `mood='unknown'` 下的 graded recency 去重惩罚 `[0.5,0.4,0.3,0.2]`。
- **mood** = **INERT**：App 无情绪输入源，HomeScreen 传 `'unknown'` → 不注入任何 mood 加分。
  - ⚠️ 历史 bug（已修）：曾误传固定 `'calm'`，其 +0.4 > 时段 +0.3 恒定压过时段信号，使首页永不可达 meditation/rain/white_noise。改 `'unknown'` 后，配合 recent 去重，**首页现已覆盖全部 5 个场景**。
- **listeningDuration** = **INERT**：无持久化写入方，HomeScreen 传固定 `0`，过度沉浸保护(>60min)永不触发。等待「今日聆听时长」统计源接入后激活。

> 结论：**线上实际生效维度 = hour + lastScene/recent 去重（主导）**；mood / listeningDuration 仍 inert。
> `mood='unknown'` 分支引入 graded recency 去重后，首页可达集合 = 全部 5 个场景，且不存在长度≤2的推荐循环——
> 由回归测试 `src/services/__tests__/RecommendationEngine.test.ts`（可达性 + 反循环 + 真实 mood 反证）锁定。
> **禁止**用时段伪造 mood 来"让维度看起来生效"；接入真实情绪输入源时改回传真实 Mood 并更新本说明与引擎头注释。


