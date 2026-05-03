---
name: skill-project
description: skill-project
---

# 项目：心声冥想 (Esonare)
- **核心约束**：RN 版本锁定 0.73，严禁私自升级。
- **包名规则**：唯一包名 `com.anonymous.soundtherapyapp`。严禁在 build.gradle 或脚本中生成 `.google` 或 `.domestic` 后缀。
- **路由逻辑**：
  - 场景 ID 含 `deep_sea` 或 `misty_forest` 必须跳转 `BreathDetailScreen`。
  - 其余场景跳转 `ImmersivePlayerNew`。
- **UI 适配**：
  - 适配 Redmi K80 Pro 挖孔屏：必须使用 `useSafeAreaInsets` 动态处理顶部 Padding，Header 离顶距离 = `insets.top + 10`。
  - 详情页逻辑：进入详情页时，`MiniPlayer` 必须物理隐藏（返回 null）。
- **动画规范**：Android 端开启 `useNativeDriver: true` 时，仅允许操作 `opacity` 和 `transform` 属性，严禁操作 `maxWidth` 等布局属性。
- **状态同步**：页面加载即刻通过 `AudioService.isPlaying()` 同步 UI，严禁异步等待导致状态跳变。