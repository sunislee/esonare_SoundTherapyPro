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
