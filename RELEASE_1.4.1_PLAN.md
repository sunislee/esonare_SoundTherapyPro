# 1.4.1 发布冲刺计划

> **目标日期**: 2026-04-18
> **当前版本**: v1.4.1 (code 141)
> **分支**: main

---

## 1. 视觉大重构：实装"科技冥想"入口

### 目标
把当前的 `NoiseLabIcon` 彻底重写，实现 Glassmorphism（毛玻璃）风格，让降噪实验室入口看起来像来自未来。

### 设计参考
- 流光玻璃效果
- 微小浮动动画
- 科技蓝渐变色调

### 执行步骤
1. 重写 `NoiseLabIcon.tsx` 组件
2. 使用 `react-native-linear-gradient` 或 SVG 渐变实现玻璃质感
3. 添加 `Animated` 浮动效果（上下微动，循环）
4. 调整主页悬浮按钮样式以适配新图标

### 风险点
- 确保动画性能不影响主页滚动流畅度
- 小尺寸下图标细节仍需清晰可辨

---

## 2. 音频体验微调：降噪平滑过渡

### 目标
将当前降噪场景与主场景的"硬切"互斥改为带 Fade-out 的平滑过渡。

### 当前实现
[NoiseCancellationRoom.tsx](file:///Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/src/screens/NoiseCancellationRoom.tsx) 中直接调用 `audioService.stop()` 停止主音频。

### 执行步骤
1. 在 `AudioService.ts` 中新增 `stopWithFade(duration: number)` 方法
2. 实现 0.5s 音量线性衰减逻辑
3. 修改 `NoiseCancellationRoom` 进入逻辑，调用淡出停止
4. 测试淡出效果是否自然、无卡顿

### 风险点
- TrackPlayer 的音量控制 API 需确认支持平滑过渡
- 淡出期间不能影响降噪场景音频的正常播放

---

## 3. 全机种稳健性检查

### 目标
确保 1.4.1 在 Android 15/16 环境下无任何 native 层问题。

### 检查清单
- [ ] Android 16 (API 35) 真机/模拟器测试
- [ ] Android 15 (API 34) 真机/模拟器测试
- [ ] 16KB Page Size 环境验证（已通过压测）
- [ ] 检查所有 native 模块的 deprecation warning
- [ ] 确认 `extractNativeLibs=true` 在 Android 16 下正常工作
- [ ] 音频播放、暂停、切换场景无崩溃
- [ ] 降噪场景互斥逻辑稳定

### 已知 Warning（可忽略）
- `ReactNativeHost` deprecated（RN 0.81 新架构过渡期）
- `android:extractNativeLibs` 警告（通过 AndroidManifest.xml 设置，符合规范）
- `react-native-track-player` 内部 deprecation（第三方库，不影响功能）

---

## 发布前最终检查

- [ ] 版本号确认：package.json = 1.4.1, build.gradle = 141
- [ ] 设置页"关于"显示 v1.4.1
- [ ] CHANGELOG.md 更新 1.4.1 发布说明
- [ ] Git 提交并推送到双端（Gitee + GitHub）
- [ ] 打 tag: v1.4.1
- [ ] 生成 release APK 存档

---

## 备注

- 开发环境：Mac Studio M1 Max (64G)
- 测试设备：REDMI K80 Pro (Android 16)
- 包名：`com.anonymous.soundtherapyapp`（全渠道统一）
