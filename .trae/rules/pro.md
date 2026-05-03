1. 性能爆发规则 (Performance Mode)
多线程编译：强制在 Xcode 项目设置中启用并行构建（Parallelize Build），充分压榨 M1 Max 的多核性能。

模拟器双开：允许同时运行 iOS（iPhone 15/16 Pro）和 Android 模拟器，实现双端 UI 实时对齐。

极速重装：项目依赖管理统一使用 pnpm 软链接，利用 64G 内存实现秒级热更新。

2. 资源与动画规范 (Lottie Specialist)
源码级控色：禁止在代码中编写 colorFilters。所有 Lottie 动画颜色必须在 JSON 源码中物理替换为 App 主色 #6C5DD3。

背景层剔除：Lottie 内部名为 'Shape Layer 1' 的背景图层必须将其 opacity 设为 0 或直接物理删除，防止遮挡。

动画精度控制：选中态 Tab 图标统一执行 play(0, 20)，loop 设为 false。

3. 环境与同步准则 (Environment Sync)
架构兼容性：若原生编译失败，优先尝试执行 arch -x86_64 pod install 兼容老旧依赖库。

主权机身份：此机器作为主 Apple ID 登录机，负责所有 Google 账号验证及 App Store 证书签名工作。

路径隔离：禁止将本地生成的 ios/Pods 和 android/build 缓存文件提交至 Git 仓库。

4.项目使用的 RN 版本目标为 0.81.x 或更高版本，以彻底解决 16k context 处理及性能瓶颈；RN 0.81+ 已默认启用新架构，确保心声冥想项目的稳定性。

5.项目的中文名是"心声冥想"

6. 项目级防幻觉强制规则（对 Gemini 3 Flash 生效）
   1. 仅使用本项目 package.json 中已声明的依赖（如 react-native@0.81.x, expo-av），绝不虚构库、API 或路径。
   2. 所有代码修改必须基于当前项目中真实存在的文件和目录结构，不脑补不存在的文件。
   3. 所有音频相关实现必须严格遵循 Expo AV 官方文档，不编造方法、参数或行为。
   4. 任何不确定的信息必须明确说明"不确定"，并拒绝生成不可验证的代码。
   5. 所有输出必须可在真机（红米 k80 pro）上验证，不生成仅在模拟器上可用的代码。
   6. 禁止自信输出错误信息；发现矛盾立即纠正，不硬圆。
   ## 5. 渠道 SDK 差异化集成规范
- **原则**：根据目标市场（Google Play vs 国内市场）动态切换监控与统计 SDK，严禁在 Google Play 版本中包含国内专属 SDK，反之亦然。
- **Google Play 渠道**：
  - **崩溃分析与统计**：必须且仅能使用 **Firebase Crashlytics** 和 **Google Analytics**。
  - **要求**：确保 `google-services.json` 配置正确，且在代码中通过 `if (channel == 'google')` 逻辑激活。
- **国内市场 (Mainland China)**：
  - **崩溃分析与统计**：必须且仅能使用 **Tencent Bugly**。
  - **要求**：在 `build.gradle` 中通过 `implementation` 引入 Bugly 库，并在 `domestic` 分支初始化时传入对应的 AppID。
- **自动化要求**：AI 在协助打包或修改构建脚本时，必须检查 `applicationId` 与对应 SDK 的匹配关系，防止 SDK 越界（如在 Google 版里混入 Bugly）。

7. 历史上下文连续性 (Context & Changelog Awareness)

强制阅读更新日志：在执行任何新功能开发或 Bug 修复任务前，必须首先读取根目录下的 CHANGELOG.md。

禁止功能倒退：严禁在后续版本中回退 CHANGELOG.md 中记录的已修复问题（特别是：BackHandler 逻辑、UI 层级 zIndex、包名锁定等）。

同步更新日志：在每个版本任务（版本号变更、重大修复）完成后，必须主动在 CHANGELOG.md 中以规范格式追加记录（包含版本号、修复点及影响范围）。

基于历史决策：如果新需求与历史修复逻辑存在冲突，必须先向用户指出冲突点，不得擅自覆盖历史稳定逻辑。

8. 重大 Bug 修复项
- **播放器小封面图翻转 Bug**：在本次升级重构中，必须解决播放器小封面图在播放开始时翻转一次的 Bug。
