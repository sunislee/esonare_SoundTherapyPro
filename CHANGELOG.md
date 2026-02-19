# 心声冥想 Release 记录

> 统一版本号：1.1.0（versionCode 100）  
> 包名：com.anonymous.soundtherapyapp（无渠道后缀）  
> RN 版本：0.73（已锁死）  

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