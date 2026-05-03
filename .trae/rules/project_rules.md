# Android 兼容性与稳定性规范

## 1. 禁用高版本 Java 集合方法 (预防 NoSuchMethodError)
- **风险**：某些低版本 Android 系统不支持 Java 21+ 的新集合方法（如 `removeLast()`），会导致 60% 以上的机型闪退。
- **规则**：严禁在原生层及 RN 桥接层使用高版本特有 API。
- **替代方案**：统一使用通用的集合操作方法（如 `list.remove(list.size() - 1)`）。

## 2. 静态资源管理规范
- **原则**：App 采用全内置资源架构以确保弱网环境下的稳定性。
- **规则**：所有新增音频资源必须放置在 `android/app/src/main/res/raw` 目录下。
- **调用逻辑**：禁止硬编码 R.raw ID，必须保持 `audioAssets.ts` 与原生目录同步。

## 3. 混淆保护 (Proguard)
- **规则**：发布包必须确保 `com.anonymous.soundtherapyapp.R$*` 不被混淆，防止资源 ID 错位。

## 4. 音频资源下载双向保护策略 (Dual-Source Fallback)

- **原则**：根据应用分发渠道，动态调整主/备下载源，确保全球范围内的下载成功率。
- **策略逻辑**：
  - **Google Play 渠道**：
    - **主源 (Primary)**：GitHub
    - **备源 (Secondary)**：Gitee
  - **国内渠道 (Gitee/应用宝等)**：
    - **主源 (Primary)**：Gitee
    - **备源 (Secondary)**：GitHub
- **技术实现要求**：
  - 封装 `getDownloadUrl(assetId)` 方法，根据当前 `packageName` 或 `flavor` 返回对应的 URL 列表。
  - 必须实现 **自动重试机制**：主源请求失败（超时、404、连接错误）后，立即静默切换到备源进行重试。
  - 严禁硬编码单一下载源，所有远程资源必须具备这两个镜像地址。

  1. Minimum API Compatibility

Baseline: The application must maintain full compatibility with Android 11 (API level 30).

Prohibited APIs: Strictly avoid using Java/Kotlin APIs introduced in later versions (e.g., API 33/35) without proper SDK version checks.

❌ DO NOT use List.removeLast() or List.removeFirst() (Requires API 35).

✅ DO use List.removeAt(list.size - 1) or List.remove(list.size - 1).

2. Dependency & Patch Management

Native Audit: Before adding any React Native library, verify its minimum supported Android version.

Patch-Package Scrutiny: When applying patches to node_modules (e.g., react-native-screens), manually scan all modified .java or .kt files for incompatible syntax to prevent runtime crashes on older devices.

3. Asset & Versioning Integrity

Asset Enforcement: The App Logo must always reference the actual image file at src/assets/logo.png. Never attempt to recreate the logo using primitive UI components (Views/Text).

Single Source of Truth (SSOT): Displayed version numbers must be dynamically pulled from package.json. Hardcoding version strings in UI components is strictly forbidden.

4. Pre-release Verification

Mandatory Testing: Prior to any release or merge into main, a smoke test must be conducted on an Android 11 (API 30) emulator or physical device.

远程资源与代码仓库分发策略
- **原则**：根据目标市场实施双仓库镜像管理，确保访问速度与稳定性。
- **国内市场 (Mainland China)**：
  - **托管平台**：使用 **Gitee** 作为主远程仓库。
  - **用途**：国内 App 备案、国内应用市场资源下载、以及国内开发环境的快速同步。
- **国际市场 (Google Play)**：
  - **托管平台**：使用 **GitHub** 作为主远程仓库。
  - **用途**：提交 Google Play 审核、国际版本分发、以及与 GitHub Actions 等国际 CI/CD 工具集成。
- **同步要求**：AI 在执行 `git push` 或更新远程配置时，应明确当前操作的渠道背景，必要时需确保两个远端仓库的同步一致性。

改问题时，先确定问题，等我审核通过后再进行更改，该问题的是验证的时候只要安装debug 包就ok 这样快点 


# 项目规则：强制严谨，拒绝自信幻觉
1. 本项目 AI 必须**严格遵循现有代码架构/规范**，禁止无规划重构、擅自修改核心逻辑。
2. 所有修改必须**先做小范围验证**，通过后再推广，禁止一次性大规模变更。
3. 涉及业务逻辑/数据处理的代码，必须**附带单元测试**，测试通过才算完成。
4. AI 生成的方案/代码，必须经过**人工 Review + 测试**，确认无误后才可合并。
5. 禁止 AI 假设"用户意图"，所有需求必须**明确、可验证**，模糊点必须澄清。
6. 出现矛盾/不确定时，**立即暂停并上报**，禁止强行继续、掩盖问题。

# 项目核心规则 (SoundTherapyPro)

## 1. 包名唯一性原则 (CRITICAL)
- 项目唯一合法 ApplicationID/PackageName 为: `com.anonymous.soundtherapyapp`
- 禁止使用旧包名 `com.esonare.soundtherapypro`。
- **全渠道统一**：禁止在任何 flavor (google/domestic) 中添加 `applicationIdSuffix`。
- 无论海外版还是国内版，包名必须严格一致，不得做任何后缀区分。

## 2. 技术栈约束
- **React Native 版本**：当前版本目标为 0.77.x 或更高版本，以彻底解决 16k context 处理及性能瓶颈。
- **新架构适配**：升级过程中必须优先适配 New Architecture (新架构)，确保心声冥想项目的稳定性。
- **图标引用**：安卓端必须使用 `@mipmap/ic_launcher` 和 `@mipmap/ic_launcher_round`。

## 3. 业务逻辑规范
- **深海呼吸场景**：进入 ID 包含 `breath` 的场景时，必须自动激活 `interactive_breath` 交互层。
- **UI 状态绑定**：`ImmersivePlayerNew.tsx` 的按钮状态必须实时读取 `AudioContext`，禁止使用组件内部脏状态。
- **播放器 Bug 修复**：在本次升级重构中，必须解决播放器小封面图在播放开始时翻转一次的 Bug。

## 4. 环境要求
- 开发环境为 Mac Studio M1 Max (64G)。
- 运行 Android 编译前必须执行 `./gradlew clean` 以清除旧包名缓存。
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

4.项目使用的 RN 版本目标为 0.77.x 或更高版本，以彻底解决 16k context 处理及性能瓶颈；升级过程中必须优先适配 New Architecture (新架构)，确保心声冥想项目的稳定性。

5.项目的中文名是"心声冥想"

6. 项目级防幻觉强制规则（对 Gemini 3 Flash 生效）
   1. 仅使用本项目 package.json 中已声明的依赖（如 react-native@0.77.x, expo-av），绝不虚构库、API 或路径。
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

1. 版本同步强制性 (Version Sync Enforcement)

原生与 UI 对齐：严禁仅修改 android/app/build.gradle。任何时候修改 versionName，必须同步全局搜索并修改 UI 界面中对应的硬编码版本号（如：src/screens/ 目录下的 About 或 Settings 页面）。

版本一致性自检：在完成版本号修改任务前，必须列出已修改的文件路径，并对比新旧版本号。

2. 关键页面路径映射 (Key Component Mapping)

About 页面：路径通常为 src/screens/AboutScreen.tsx，需确保 UI 显示的版本文字与 versionName 严格一致。

Settings 页面：路径通常为 src/screens/SettingsScreen.tsx，需核对底部版本号标识。

3. 开发环境与包名红线 (Environment & Package ID)

RN 版本目标：当前版本目标为 0.77.x 或更高版本，以彻底解决 16k context 处理及性能瓶颈；升级过程中必须优先适配 New Architecture (新架构)，确保心声冥想项目的稳定性。

包名一致性：核心包名必须锁定为 com.anonymous.soundtherapyapp。严禁引入 .google 或 .domestic 等渠道后缀。

架构约束：针对 Mac Studio M1 Max 优化编译，修改配置后必须执行 gradlew clean 和 metro --reset-cache。

4. 修复与防御 (Bug Prevention)

渲染防御：在修改版本号引发全量编译时，需重点监控是否复现"白色三角形"或"UI 文本重叠"问题。

重大 Bug 修复：在本次升级重构中，必须解决播放器小封面图在播放开始时翻转一次的 Bug。

资源下载通用规则 (The 3-Thread Doctrine)
1. 并发控制 (Concurrency)
硬性上限：任何资源下载任务，MAX_CONCURRENT 严禁超过 3。

理由：国内 CDN 节点对 3 以上的并发极度敏感，容易触发单 IP 限速或连接重置。

2. 防限流抖动 (Jitter & Anti-Throttling)
随机延迟：启动下载前，必须根据 workerId 引入 100-600ms 的随机启动延迟。

退避机制：连续请求之间必须存在 50-250ms 的随机间歇。

理由：模拟真人行为，平滑流量峰值，防止被服务器识别为恶意爬虫。

3. 原子性写入 (Atomic Write Strategy)
临时中转：文件必须先下载到 .tmp 后缀的临时路径。

校验后转正：只有在 onComplete 校验通过后，才允许执行 moveFile 将其转为正式资源。

理由：防止因断网、断电导致的资源文件损坏（Corrupted Files），确保本地资源 100% 可用。

4. UI 与性能平衡 (UI & Performance)
进度节流：进度回调（Progress Callback）频率不得高于 200ms/次。

理由：防止超高频刷新导致的 React Native UI 线程阻塞和掉帧。

# Trae 协作准则：防止业务逻辑崩溃

Trae，为了提高协作效率并防止业务逻辑再次大面积崩溃，你必须严格遵守以下开发准则：

## 1. 核心红线：禁止"越界重构"
- **原则**：当任务是"增加数据"或"修改文案"时，禁止改动 UI 组件的逻辑架构（如 filter 逻辑、数据传递方式、Hooks 依赖项）。
- **操作**：只能修改 `constants/` 或 `i18n/` 下的配置文件。如果认为必须改动 UI 逻辑，必须先征得用户同意，并说明理由。

## 2. 数据驱动原则：配置优先
- **禁止**在 UI 层使用动态字符串拼接来生成 i18n Key（例如：禁止使用 `t('scenes.' + id)`）。
- **必须**在数据源（如 `scenes.ts`）中显式定义完整的 `title` 和 `category` 属性。如果发现某个属性缺失，去补全配置文件，而不是写复杂的逻辑去"猜"。

## 3. "三步走"调试规范
如果修改后出现 UI 异常，按以下顺序自检，不准瞎猜：
- **Step 1 (数据层)**：在渲染前 `console.log` 关键数组的 `length` 和 ID 列表，确认数据源没被误杀。
- **Step 2 (布局层)**：检查是否是 `padding`、`zIndex` 或 `height` 导致的遮挡。
- **Step 3 (缓存层)**：如果代码逻辑正确但现象诡异，主动要求执行 `gradlew clean` 并重新编译。

## 4. 强制"断点"确认
- **禁止**连续执行超过 3 次"补丁式"重构。如果前两次修复无效，停止思考，将受影响的文件回滚到上一个稳定版本，重新分析。
- **禁止**在 Thought 环节进行超过 30 秒的过度推演。如果不确定，直接问用户确认业务逻辑。

## 5. 环境一致性
- **必须**牢记当前项目环境：React Native 0.81.5。
- 涉及 Android 16KB Page Size 适配时，保持 `build.gradle` 配置的稳定性。
