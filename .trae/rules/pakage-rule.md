# 项目核心规则 (SoundTherapyPro)

## 1. 包名唯一性原则 (CRITICAL)
- 项目唯一合法 ApplicationID/PackageName 为: `com.anonymous.soundtherapyapp`
- 禁止使用旧包名 `com.esonare.soundtherapypro`。
- **全渠道统一**：禁止在任何 flavor (google/domestic) 中添加 `applicationIdSuffix`。
- 无论海外版还是国内版，包名必须严格一致，不得做任何后缀区分。

## 2. 技术栈约束
- **React Native 版本**：当前版本目标为 0.81.x 或更高版本，以彻底解决 16k context 处理及性能瓶颈。
- **新架构适配**：RN 0.81+ 已默认启用新架构，确保心声冥想项目的稳定性。
- **图标引用**：安卓端必须使用 `@mipmap/ic_launcher` 和 `@mipmap/ic_launcher_round`。

## 3. 业务逻辑规范
- **深海呼吸场景**：进入 ID 包含 `breath` 的场景时，必须自动激活 `interactive_breath` 交互层。
- **UI 状态绑定**：`ImmersivePlayerNew.tsx` 的按钮状态必须实时读取 `AudioContext`，禁止使用组件内部脏状态。
- **播放器 Bug 修复**：在本次升级重构中，必须解决播放器小封面图在播放开始时翻转一次的 Bug。

## 4. 环境要求
- 开发环境为 Mac Studio M1 Max (64G)。
- 运行 Android 编译前必须执行 `./gradlew clean` 以清除旧包名缓存。
