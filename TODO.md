# HeartSound Meditation - Development Roadmap

## v1.4.0+ Next Week Plan (2026.04.20 - 2026.04.24)

### Monday First Feature
- [ ] **[Feature] Jazz-Funk 场景 UI 实装**
  - 在 `src/constants/scenes.ts` 中定义 Jazz-Funk 场景
  - 在首页场景列表中添加入口
  - 关联 `EQManager.ts` 中已注入的 `jazzFunk` EQ 预设
  - 配置对应音频文件（需确认音频资源）
  - 测试 EQ 预设切换效果

---

## v1.3.0+ Optimization Focus

### High Priority

1. **Backend Account System**
   - Introduce formal backend account system
   - Implement user registration and authentication
   - Ensure secure data storage and retrieval

2. **Account Deletion API**
   - Integrate with actual Account Deletion API
   - Comply with Google's long-term policies
   - Implement proper data deletion流程

3. **Dynamic Island Deep Optimization**
   - Fix cover image flip/disappearance issue during playback
   - Ensure consistent display and animation
   - Optimize for different device models

4. **Offline Mode**
   - Complete offline audio playback and management
   - Ensure all downloaded resources are accessible without network connection
   - Implement proper caching and storage management

5. **Remove Offline Mode Switch**
   - Remove unnecessary offline logic to prevent crashes
   - Simplify user experience by automatically handling offline/online states
   - Ensure stable operation across all network conditions

### Secondary Tasks

- Improve audio quality and latency
- Optimize app startup time
- Enhance battery usage during playback
- Add more personalized meditation recommendations

## Current Status

- [x] Basic offline playback functionality
- [ ] Backend account system
- [ ] Account deletion API integration
- [ ] Dynamic Island optimization
- [ ] Offline mode switch removal
- [ ] Complete offline mode implementation

---

## P1 优化冲刺剩余任务（2026-08-17 提取）

> 来源说明：~/.omo/ 与项目根目录均未找到独立的"P1 分析文档"。下表依据现存唯一的 P1 分析——会话 `ses_ff2d9d4afffeg9TUaEX3V2qUdi`（01:25）《P1 CDN 下载链路健康检查 — 诊断报告》的 8 个风险点，扣除 P1-1 已完成项（CDN 统一源 + 故障转移、超时看门狗、bytesToBase64、真实进度、arrayBuffer 全量写入）后重建。

| # | 任务名 | 影响范围 | 预期改动行数 | 优先级 |
|---|--------|----------|--------------|--------|
| P1-2 | **下载后完整性校验**：路径 B 完成后按 `stat.size >= expectedSize × 0.8` 校验，损坏文件删除并重回重试队列（诊断风险 #4） | src/services/DownloaderService.ts（downloadResource / pollUntilReady），复用 audioAssets.ts ASSET_LIST.expectedSize | ~40-60 行 | P0（高：损坏文件会进入播放链路） |
| P1-3 | **路径 A 引擎统一 / Release 死锁验证**：DownloadService.ts 仍用 RNFS.downloadFile（Release 包死锁隐患），迁移到统一 fetch 引擎或先真机验证；其 URL 列表同步改用 getAssetUrls()（诊断风险 #5 + #7） | src/services/DownloadService.ts（765 行）+ 调用方 ResourceStatusManager / useResourceDownloader / ProfileScreen | ~150-400 行（迁移方案）或 ~30-50 行（先统一后验证方案） | P0-P1（高：Release 崩溃风险） |
| P1-4 | **重试策略优化**：固定直接入队改为指数退避 + 抖动；清理死代码与未使用导入（NOISE_REDUCTION_RESOURCES / IS_GOOGLE_PLAY_VERSION / isDownloading，即 LSP 3 个 hint）（诊断风险 #8） | src/services/DownloaderService.ts（downloadResource catch 块、头部 import 区） | ~25-40 行 | P1（中） |
| P1-5 | **断点续传 Range 支持**：7MB 级文件弱网下用 `Range: bytes=N-` + appendFile 偏移续传，替代从 0 重下（诊断风险 #6，报告明确列为后续增强项） | src/services/DownloaderService.ts（streamDownloadTo） | ~80-150 行 | P2（中低） |
| P1-6 | **残留硬编码 CDN URL 清理**：ResourceConfig.ts 32 个降噪音频 remoteUrl + DownloaderService.addSceneAudioTask L604 GITHUB_BASE，全部收敛到 getAssetUrls() 单一事实源（诊断风险 #7 残留） | src/config/ResourceConfig.ts、src/services/DownloaderService.ts（L604 附近） | ~30-60 行 | P1（中：完成单一事实源目标） |
