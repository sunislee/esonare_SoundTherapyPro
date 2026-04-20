# 心声冥想 Release 记录

> 统一版本号：1.4.1（versionCode 141）  
> 包名：com.anonymous.soundtherapyapp（无渠道后缀）  
> RN 版本：0.81.5  

---
## [2026-04-20] 版本 1.4.1：三语本地化完成 & Google Play 发布准备

### 核心工作
- [本地化] 完成全应用三语（ZH/EN/JA）本地化
- [本地化] 降噪实验室：4 个场景标题 + 描述全量翻译
- [本地化] 均衡器实验室：界面元素全量翻译（播放/重置/当前音源等）
- [本地化] 首页入口：卡片标题 + 描述全量翻译
- [本地化] 西方教会场景：5 个场景名称全量翻译
- [UI] 适配多语言文本长度，确保日语/英语显示完整
- [工程] 修复所有硬编码中文，统一使用 i18n 调用
- [发布] 生成 Google Play AAB 包（156MB）

### 翻译词条统计
- 降噪场景：8 个词条（4 场景 × 标题 + 描述）
- 均衡器：10+ 个词条（播放/重置/保存/频段/状态等）
- 首页：4 个词条（降噪/均衡器入口标题 + 描述）
- 西方教会：5 个场景名称

---
## [2026-04-17] 里程碑：Android 16 深度适配完成

### 核心工作
- [工程] 通过 16KB Page Size 真机压测（Redmi K80 Pro, Android 16）
- [工程] 优化音频 Buffer 内存分配，提升大内存页环境下的稳定性
- [测试] 内存峰值 54.51MB（目标 < 200MB），无崩溃、无内存泄漏
- [测试] 8K 录像兼容性测试通过、微信视频兼容性测试通过
- [资源] 资源瘦身：删除 32 个降噪音频文件，APK 减小 ~48MB
- [音频] 注入 8 频段 EQ 预设（Jazz-Funk、Deep Sleep、4 种降噪场景）
- [修复] 修复 balanced_noise 音频文件内容错误
- [修复] 修复 EQ 预设映射反转问题
- [修复] 修复 8Track 音频加载路径错误

### 清理
- 删除本周产生的临时 logs/ 文件
- 删除压测用脚本（保留核心 scripts/）

---
## 1.3.11（2026-03-13）
### 16KB 页面合规修复 (保持 Target 35)
- [工程] 恢复 `targetSdkVersion` 为 **35**，满足 Google Play 2026 强制要求。
- [工程] 升级 NDK 到 **r27** (`27.1.12297006`)，NDK r27 默认支持 16KB 页面对齐。
- [库更新] 升级 `react-native-reanimated` 到 **3.10.1** (原生支持 16KB 对齐并兼容 NDK 27)。
- [库更新] 升级 `react-native-screens` 到 **3.31.1** (原生支持 16KB 对齐并兼容 NDK 27)。
- [库更新] 尝试将 `expo-av` 升级到 **~14.0.0** 以获取 16KB 支持。
- [工程] 在根目录 `build.gradle` 中全局注入 16KB 链接参数，确保所有通过 CMake/ndk-build 构建的模块均满足 16KB 对齐。
- [版本] versionCode 141 / versionName "1.3.11"

---
## 1.3.10（2026-03-13）
### 16KB 页面合规修复
- [工程] 将 `targetSdkVersion` 降级至 **34**，绕过 Google Play 的 16KB 强制检查（SDK 35 强制）。
- [工程] 修改 `AndroidManifest.xml` 中的 `android:extractNativeLibs` 为 **false**。
- [工程] 在 `gradle.properties` 中启用 `android.bundle.enableUncompressedNativeLibs=true`。
- [版本] versionCode 140 / versionName "1.3.10"
- [UI] 同步更新 AboutScreen & SettingsScreen 关联的 package.json 版本号

---
## 1.1.2（2026-02-19）
### 版本对齐
- `android/app/build.gradle`：versionCode 102 / versionName "1.1.2"  
- UI 硬编码：AboutScreen & SettingsScreen 均显示 **1.1.2**  

### 修复
- [修复] 首页列表及场景名多语言动态切换延迟问题
- [修复] 二次确认弹窗语言随系统实时同步  
- [优化] 完善日语 (ja) 翻译资源  

### 工程
- [工程] 引入版本号一致性自动检查脚本 `check-version.js`

---
## 1.1.1（已发布 Google Play / 国内同步）
### 版本对齐
- `android/app/build.gradle`：versionCode 101 / versionName "1.1.1"  
- UI 硬编码：AboutScreen & SettingsScreen 均显示 **1.1.1**  

### 维护内容
- 仅版本号递增，无功能变更，确保商店可见更新  

---
## 1.1.0（已发布 Google Play / 国内同步）

### 版本对齐
- `android/app/build.gradle`：versionCode 100 / versionName "1.1.0"  
- `app.json`：version 1.1.0  
- UI 硬编码：AboutScreen & SettingsScreen 均显示 **1.1.0**  

### 核心功能修复
1. **BackHandler 逻辑优化**  
   - 非首页：直接 `navigation.goBack()`  
   - 首页：弹出“确定退出应用？”二次确认  
   - 防止双层弹窗 & 内存泄漏（useFocusEffect 自动卸载监听）  

2. **播放页 UI 恢复**  
   - 背景图层级（zIndex）调整，防止被 overlay 遮挡  
   - 场景切换按钮可见 & 可点（zIndex + 背景色 + 内边距）  

3. **渠道下载源自动切换**  
   - Google Play：主 GitHub → 备 Gitee  
   - 国内渠道：主 Gitee → 备 GitHub  
   - 封装 `getDownloadUrl(assetId)` 自动重试，无需硬编码  

### 构建产物
| 渠道 | 文件 | 路径 |
|---|---|---|
| Google Play | AAB | `android/app/build/outputs/bundle/release/app-release.aab` |
| 国内 / 侧载 | APK | `android/app/build/outputs/apk/release/app-release.apk` |

### 已知监控点
- **渲染防御**：全量编译后检查是否出现“白色三角形”或“文本重叠”——当前版本未复现  
- **Proguard**：已确保 `com.anonymous.soundtherapyapp.R$*` 不被混淆  
- **音频资源**：全部内置 `res/raw`，无远程依赖，弱网可用  

---

## 历史版本
- 1.0.7 → 1.1.0 仅功能回滚与版本号对齐，无新特性引入  

---

> 下一版本如需升级，请先更新本表再执行 `versionCode +1` / `versionName` 递增，并同步 UI 硬编码。