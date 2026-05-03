# Firebase Crashlytics 集成完整指南

> **版本**: v1.4.0  
> **日期**: 2026-04-16  
> **设备**: 红米 K80 Pro (Android 16, 16KB 页)

---

## 📋 当前状态

### ✅ 已完成

1. **代码配置**
   - ✅ 项目级 `build.gradle` 已添加 Firebase 插件依赖
   - ✅ 应用级 `build.gradle` 已配置 Firebase 依赖（暂时注释）
   - ✅ 包名确认：`com.anonymous.soundtherapyapp`

2. **测试代码**
   - ✅ Crash 测试按钮已添加到 App 首页
   - ✅ 提供 3 个测试选项：
     - 触发 JS 崩溃
     - 触发 Native 崩溃
     - 记录非致命异常

3. **构建配置**
   - ✅ 16KB 页适配完成
   - ✅ ABI 过滤配置（arm64-v8a only）
   - ✅ extractNativeLibs=true

### ⚠️ 待完成（需手动）

1. **Firebase Console 配置**
   - ⏳ 创建 Firebase 项目
   - ⏳ 下载 `google-services.json`
   - ⏳ 放置到 `android/app/google-services.json`

2. **启用 Firebase 插件**
   - ⏳ 取消注释 Firebase 相关配置
   - ⏳ 重新构建 Release AAB

3. **测试验证**
   - ⏳ 真机安装测试
   - ⏳ Crash 测试
   - ⏳ Firebase Console 验证

4. **发布前清理**
   - ⏳ 删除 Crash 测试代码
   - ⏳ 构建最终 Release 版本

---

## 🚀 快速集成步骤

### 步骤 1: Firebase Console 配置（10 分钟）

#### 1.1 创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 点击 "添加项目"
3. 项目名称：**心声冥想** 或 **SoundTherapyPro**
4. 启用 Google Analytics（推荐）
5. 点击 "创建项目"

#### 1.2 添加 Android 应用

1. 点击 "添加应用" > Android 图标
2. **包名**: `com.anonymous.soundtherapyapp`（必须完全一致！）
3. **应用昵称**: 心声冥想
4. **调试签名证书 SHA-1**（可选）:
   ```bash
   cd android
   ./gradlew signingReport
   ```
5. 点击 "注册应用"

#### 1.3 下载配置文件

1. 点击 "下载 google-services.json"
2. 将文件放置到：`android/app/google-services.json`
3. **不要提交到 Git**（包含敏感信息）

#### 1.4 添加 Crashlytics

1. 在 Firebase Console 左侧菜单选择 "Crashlytics"
2. 按照向导完成设置
3. 等待几分钟让 Firebase 识别你的应用

---

### 步骤 2: 启用 Firebase 插件（2 分钟）

#### 2.1 取消注释

**文件**: `android/app/build.gradle`

取消以下代码的注释：

```gradle
// 【Firebase Crashlytics】应用插件（暂时禁用，等待 google-services.json）
// apply plugin: 'com.google.gms.google-services'
// apply plugin: 'com.google.firebase.crashlytics'
```

改为：

```gradle
// 【Firebase Crashlytics】应用插件
apply plugin: 'com.google.gms.google-services'
apply plugin: 'com.google.firebase.crashlytics'
```

#### 2.2 取消依赖注释

```gradle
// 【Firebase Crashlytics】添加 Firebase SDK（暂时禁用，等待 google-services.json）
// implementation platform('com.google.firebase:firebase-bom:33.1.2')
// implementation 'com.google.firebase:firebase-analytics'
// implementation 'com.google.firebase:firebase-crashlytics'
```

改为：

```gradle
// 【Firebase Crashlytics】添加 Firebase SDK
implementation platform('com.google.firebase:firebase-bom:33.1.2')
implementation 'com.google.firebase:firebase-analytics'
implementation 'com.google.firebase:firebase-crashlytics'
```

#### 2.3 确认项目级配置

**文件**: `android/build.gradle`

确保有以下代码（已添加，无需修改）：

```gradle
buildscript {
    dependencies {
        // 【Firebase Crashlytics】添加 Google Services 和 Crashlytics 插件
        classpath 'com.google.gms:google-services:4.4.2'
        classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.2'
    }
}
```

---

### 步骤 3: 构建与测试（15 分钟）

#### 3.1 清理并构建

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

**预期**: BUILD SUCCESSFUL

#### 3.2 安装到真机

```bash
adb install -r app/build/outputs/bundle/release/app-release.aab
```

**预期**: Success

#### 3.3 打开 App

1. 在红米 K80 Pro 上打开 "心声冥想"
2. 应该看到右上角有黑色半透明的 "🔥 Crash Test" 面板

#### 3.4 测试崩溃

**⚠️ 警告**: 以下操作会导致 App 崩溃！

1. **测试 JS 崩溃**:
   - 点击 "触发 JS 崩溃" 按钮
   - App 会在 500ms 后崩溃
   - 重新打开 App

2. **等待上报**:
   - 保持 App 运行 2-3 分钟
   - Crashlytics 会在后台上报崩溃信息

3. **验证 Firebase Console**:
   - 访问 Firebase Console > Crashlytics
   - 等待 5-10 分钟
   - 应该看到崩溃报告
   - **设备信息**: 红米 K80 Pro, Android 16

---

### 步骤 4: 发布前清理（5 分钟）

#### 4.1 删除测试代码

**文件**: `App.tsx`

**删除以下内容**:

1. **Line 13**: `const enableCrashTest = true;`
2. **Line 147-191**: 整个 Crash Test UI 组件

或者简单地将 `enableCrashTest` 改为 `false`:

```typescript
const enableCrashTest = false; // 改为 false
```

#### 4.2 重新构建

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

#### 4.3 验证包体积

```bash
cd android
./analyze_apk_size.sh
```

**预期**: ~129 MB

---

## 📊 灰度发布计划

### 第一阶段：内部测试（1-2 天）

**目标**: 验证 Firebase 集成

**操作**:
1. 安装到红米 K80 Pro
2. 正常使用 1 小时
3. 检查 Firebase Console 是否有崩溃报告

**通过标准**:
- ✅ Firebase 正常上报
- ✅ 无意外崩溃
- ✅ 内存表现正常（< 200 MB）

### 第二阶段：5% 灰度（3-5 天）

**目标**: 小范围验证稳定性

**操作**:
1. 在 Google Play Console 创建灰度发布
2. 设置 5% 用户
3. 重点监控 Android 15+ 用户

**监控指标**:
- 崩溃率 < 1%
- ANR 率 < 0.5%
- Firebase Crashlytics 实时上报

**通过标准**:
- ✅ 崩溃率低于阈值
- ✅ 无 16KB 相关崩溃
- ✅ 用户反馈正常

### 第三阶段：20% 灰度（5-7 天）

**目标**: 中等规模验证

**操作**:
1. 提升灰度比例到 20%
2. 继续监控指标
3. 收集用户反馈

**通过标准**:
- ✅ 指标持续稳定
- ✅ 无严重 Bug 报告

### 第四阶段：100% 发布

**目标**: 全量发布

**操作**:
1. 提升到 100%
2. 持续监控 1 周
3. 标记为稳定版本

---

## 🔍 监控与告警

### Firebase Console 配置

#### 崩溃率告警

1. 访问 Firebase Console > Crashlytics
2. 设置告警：
   - **崩溃率 > 1%**: 邮件通知
   - **新版本崩溃率异常**: 立即通知

#### 重点关注

**Android 15+ 用户**:
- 筛选条件：Android 版本 >= 15
- 关注：16KB 相关崩溃（SIGBUS, mmap 错误）

**关键词搜索**:
- `SIGBUS`
- `mmap`
- `16kb`
- `alignment`
- `ELF`

---

## ⚠️ 注意事项

### 1. 隐私与合规

**隐私政策**:
- 确保用户协议包含崩溃数据收集说明
- 国内版本可能需要单独配置（使用腾讯 Bugly）

**数据合规**:
- Firebase 数据存储在境外
- 国内用户可能需要本地化方案

### 2. 版本控制

**不要提交**:
- `google-services.json`（包含敏感信息）
- `.keystore` 文件（签名证书）

**.gitignore 示例**:
```gitignore
# Firebase
**/google-services.json

# Keystore
**/*.keystore
**/*.jks

# Build
**/build/
**/*.aab
**/*.apk
```

### 3. 测试代码清理

**发布前必须**:
- ✅ 删除 Crash 测试按钮
- ✅ 删除调试代码
- ✅ 关闭调试日志

**检查清单**:
- [ ] `App.tsx` 无测试按钮
- [ ] `console.log` 已清理
- [ ] 无调试 UI 组件

---

## 📝 常见问题

### Q1: google-services.json 放哪里？

**A**: `android/app/google-services.json`

### Q2: 构建失败 "File google-services.json is missing"

**A**: 
1. 确认文件已下载
2. 确认文件路径正确
3. 如果暂时不需要 Firebase，可以注释掉插件

### Q3: Crashlytics 多久能看到崩溃？

**A**: 
- 通常 5-10 分钟
- 首次可能需要更长时间
- 保持 App 运行有助于上报

### Q4: 如何测试崩溃？

**A**: 
1. 使用 Crash 测试按钮
2. 或者在代码中抛出异常
3. 重新打开 App 触发上报

### Q5: 国内版本怎么办？

**A**: 
- 使用腾讯 Bugly 替代 Firebase
- 配置逻辑相同，只是 SDK 不同
- 参考 `FIREBASE_CRASHLYTICS_SETUP.md`

---

## 🎯 下一步行动

### 立即执行

1. **Firebase Console 配置**（10 分钟）
   - 创建项目
   - 下载 google-services.json
   - 启用 Crashlytics

2. **启用插件并测试**（15 分钟）
   - 取消注释
   - 构建安装
   - Crash 测试

3. **清理并发布**（10 分钟）
   - 删除测试代码
   - 构建最终版本
   - 准备灰度发布

### 本周完成

- [ ] Firebase 集成完成
- [ ] Crash 测试通过
- [ ] 灰度发布 5%
- [ ] 监控指标正常

---

## 📞 支持

**文档**:
- `FIREBASE_CONFIG_CHECKLIST.md` - 配置核对清单
- `FIREBASE_CRASHLYTICS_SETUP.md` - 详细集成指南
- `MEMORY_TEST_REPORT_20260416.md` - 内存压测报告

**Firebase Console**: https://console.firebase.google.com/

**Firebase 文档**: https://firebase.google.com/docs/crashlytics

---

**最后更新**: 2026-04-16 08:00  
**状态**: ⏳ 等待 Firebase Console 配置
