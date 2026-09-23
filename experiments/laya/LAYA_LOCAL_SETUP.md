# Laya 本地推荐服务 · 部署与联调指南

完全离线：App 与 Flask 都在本机，模型走本地缓存，**关网也能用**。

> ⚠️ 评测结论（决定架构）：typed-decisions 在 mood×sleep 声景路由上实测 **Top-1 ≈ 13%（<60%）**，
> confidence 普遍 ~0.01。因此采用**并存架构**：**规则引擎 `RecommendationEngine.ts` 为权威兜底**，
> Laya 仅在后端返回 `confident:true`（confidence≥0.5）时覆盖展示；服务不可用/低置信一律回退规则，绝不白屏。

## 0. 组件一览
- `laya_service.py` —— Flask 后端（项目根目录），加载 Laya 模型做声景推荐推理。
- `src/services/LayaRecommendationService.ts` —— App 侧请求封装（BaseURL / 超时 / 错误分类）。
- `src/screens/HomeScreen.tsx` —— 首页 AI 推荐卡片 + 服务不可用降级提示。

## 1. 环境（venv）
```bash
source ~/laya_env/bin/activate
# 已装：laya 0.3.3 / transformers 5.x / torch 2.x / huggingface_hub / flask 3.x
pip show laya transformers flask   # 确认版本
```

## 2. 模型缓存路径（离线关键）
- 仓库：`convaiinnovations/laya`，**必须用 typed-decisions 子目录**（英文 RL 决策 checkpoint）。
  红线：**禁止用 multilingual 做推荐决策**（官方 benchmark 仅 0.342，低于多数类基线 0.461，几乎等于随机）。
- 本地缓存：`~/.cache/huggingface/hub/models--convaiinnovations--laya/snapshots/<hash>/typed-decisions/`
- 服务启动即设 `HF_HUB_OFFLINE=1 / TRANSFORMERS_OFFLINE=1`，**只读缓存、绝不联网**。
  若该目录不存在（从未下载过），需先在有网时预热一次（之后即可断网）：
  ```bash
  python -c "from huggingface_hub import snapshot_download as s; s('convaiinnovations/laya', allow_patterns=['typed-decisions/*'])"
  ```

## 3. 启动 Flask
```bash
source ~/laya_env/bin/activate
python3 laya_service.py            # 默认监听 0.0.0.0:5000（启动时预加载模型 ~15-30s）
# 换端口（macOS 见第 6 节）：
LAYA_PORT=5057 python3 laya_service.py
```
自检：
```bash
curl localhost:5000/health         # model_loaded:true 且 offline:true 即就绪
curl -X POST localhost:5000/recommend \
  -H 'Content-Type: application/json' \
  -d '{"state":{"mood":"anxious","sleep_quality":"poor"}}'
# → {"success":true,"recommendation":"<scene_id>","confidence":0.xx,"all_scores":{...5项...}}
```

## 4. App 侧地址配置（模拟器 vs 真机，最易翻车）
所有地址集中在 `src/services/LayaRecommendationService.ts`：
- **Android 模拟器** → 自动用 `http://10.0.2.2:<PORT>`（宿主机回环别名），无需改代码。
- **iOS 模拟器** → 自动用 `http://localhost:<PORT>`（模拟器与宿主机共享网络）。
- **真机（Android/iOS）** → 把文件顶部 `LAN_HOST` 改成运行 Flask 的 Mac 局域网 IPv4：
  ```bash
  ipconfig getifaddr en0           # 例如 192.168.1.23
  ```
  并确保手机与 Mac 处于同一 Wi-Fi、Mac 防火墙放行该端口。

端口两边必须一致：默认 `PORT = 5000`；若服务用了 `LAYA_PORT=5057`，把该文件里的 `PORT` 也改成 `5057`。
（也可运行时热改：`LayaRecommendationService.setLayaBaseUrl({ lanHost, port })`。）

## 5. 本地开发流程
1. 终端 A：启动 Flask（第 3 节），等 `/health` 返回 `model_loaded:true`。
2. 终端 B：正常跑 App（Metro / 模拟器 / 真机）。
3. 打开首页：**始终先出规则推荐卡**（读 `AsyncStorage` 的真实 key `LAST_VIEWED_SCENE_ID` 去重）；
   若 Laya 在线且返回 `confident:true`，卡片升级为「✨ AI 推荐 · X%」；否则保持「🌿 本地推荐」。
   Flask 未启动/低置信 → 仍是规则卡（附一句"AI 服务未启动或把握不足"），**不白屏**。点击进 ImmersivePlayer。
   > 注：App 内并无人工 mood/todayListeningDuration 持久化，故喂给 Laya 的 mood/sleep 由当前时段粗估（`moodSleepFromHour`）。

## 6. 故障排查
- **端口占用 / curl 返回 `Server: AirTunes`、HTTP 403**：macOS Monterey+ 的 **AirPlay Receiver** 占用了 5000。
  二选一：①系统设置→通用→隔空投送与接力，关闭「隔空接收器」；②用 `LAYA_PORT=5057` 启动并同步改 App 的 `PORT`。
- **模型加载失败 / 找不到快照**：确认第 2 节缓存目录存在（离线机器需先联网预热一次）。
- **App 连不上本机（Android）**：模拟器必须用 `10.0.2.2` 而非 `localhost/127.0.0.1`；真机必须填 Mac 局域网 IP。
- **CORS**：服务已在响应头加 `Access-Control-Allow-Origin: *` 并处理 OPTIONS 预检，一般无需改动。
- **超时**：请求封装内置 10s 超时（AbortController）。首次推理可能偏慢，必要时重启服务预热后重试。

## 7. 推荐逻辑与输出映射
模型对 5 个逻辑场景做 choice 分类并输出概率，服务端映射到真实可播放 `scene_id`：
| 逻辑场景 | scene_id |
|---|---|
| rain | city_rain_urban |
| white_noise | interactive_white_noise |
| forest | nature_forest |
| ocean | nature_ocean |
| meditation | healing_zen_bowl |

`confidence` 为 Laya 在 typed-decisions 上**温度校准后**的置信度（非 top 概率）。本任务实测普遍 ~0.01，
几乎永远低于阈值 0.5，故后端会返回 `confident:false`、客户端据此回退规则引擎。卡片仅在 `confident:true` 时显示百分比，避免"14%"这类劝退文案。
