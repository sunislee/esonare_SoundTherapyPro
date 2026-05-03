---
alwaysApply: false
description: 
---
# 核心下载规则与渠道差异化配置 [cite: 2026-02-25]

## 1. 渠道识别规则
- 项目包名统一为 `com.anonymous.soundtherapyapp` [cite: 2026-02-10]。
- 必须通过 `BuildConfig` 或 `getBundleId()` 识别 GooglePlay 渠道与 Domestic 渠道 [cite: 2026-02-25]。

## 2. 并发与超时常量 (严禁擅自修改) [cite: 2026-02-26]

### Google Play 渠道 (.google)
- **稳定定义**: Google 渠道的稳定定义 = **镜像加速下的 8 线程并发**
- **MAX_CONCURRENT**: 8 [cite: 2026-02-26]
- **CONNECT_TIMEOUT**: 60000ms (60s) [cite: 2026-02-26]
- **READ_TIMEOUT**: 120000ms (120s) [cite: 2026-02-26]
- **强制双加速源**: 
  - 主源: `https://ghproxy.net/`
  - 备源: `https://mirror.ghproxy.com/`
  - 保底: GitHub 官方源

### 国内渠道 (.domestic)
- **MAX_CONCURRENT**: 5 [cite: 2026-02-25]
- **CONNECT_TIMEOUT**: 30000ms (30s) [cite: 2026-02-26]
- **READ_TIMEOUT**: 60000ms (60s) [cite: 2026-02-26]

## 3. 执行要求
- 任何涉及 `DownloadService.ts` 的修改，必须先验证上述常量是否被正确引用 [cite: 2026-02-25]。
- 资源下载完成后，必须立即唤醒 `MediaSession` 以显示状态栏控制条 [cite: 2026-02-14, 2026-02-25]。
- **镜像切换逻辑**: 镜像 A 失效优先切换镜像 B，并维持 8 线程；全镜像失效后方可降级到 3 线程。
