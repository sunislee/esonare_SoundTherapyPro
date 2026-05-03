# 灵动岛/播控中心稳定性优化 TODO

## 问题复现路径
1. 在 App 中播放音频
2. 进入「我的」页面
3. 返回「正在播放」页面
4. 系统状态栏和灵动岛大概率消失

## 已尝试的修复方案
1. **页面焦点唤醒逻辑**：在 ImmersivePlayerNew.tsx 中添加 useFocusEffect，当页面获得焦点时检查播放状态并强制刷新通知
2. **动态导入处理**：使用 import('../services/NotificationService').then(...) 避免循环依赖导致的崩溃
3. **状态同步**：确保音频播放状态与系统播控状态保持同步

## 明天深度排查计划
1. **前台服务优先级**：检查 Android 前台服务的优先级设置，确保系统不会在页面切换时杀死服务
2. **通知通道配置**：验证通知通道的重要性级别，确保通知不会被系统忽略
3. **生命周期管理**：检查 AudioService 和 NotificationService 的生命周期管理，确保服务在页面切换时保持活跃
4. **系统兼容性**：测试不同 Android 版本的表现，特别是 Android 14+ 的通知行为变化
5. **性能优化**：分析通知更新的频率和开销，避免过度更新导致系统限制

## 相关文件
- src/screens/ImmersivePlayerNew.tsx - 播放页面，包含焦点唤醒逻辑
- src/services/NotificationService.ts - 通知服务，负责系统播控状态管理
- src/services/AudioService.ts - 音频服务，负责音频播放逻辑
