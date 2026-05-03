# Firebase Crashlytics 配置核对清单

> **版本**: v1.4.0 (准发布版)  
> **构建时间**: 2026-04-16  
> **设备**: 红米 K80 Pro (Android 16, 16KB 页)

---

## ✅ 已完成配置

### 1. 项目级 build.gradle

**文件**: `android/build.gradle`

```gradle
buildscript {
    dependencies {
        // ✅ 已添加
        classpath 'com.google.gms:google-services:4.4.2'
        classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.2'
    }
}
```

### 2. 应用级 build.gradle

**文件**: `android/app/build.gradle`

```gradle
// ✅ 已应用插件
apply plugin: 'com.google.gms.google-services'
apply plugin: 'com.google.firebase.crashlytics'

// ✅ 已添加依赖
dependencies {
    implementation platform('com.google.firebase:firebase-bom:33.1.2')
    implementation 'com.google.firebase:firebase-analytics'
    implementation 'com.google.firebase:firebase-crashlytics'
}
```

### 3. 包名确认

**包名**: `com.anonymous.soundtherapyapp`

**位置**: `android/app/build.gradle` line 79

---

## ⚠️ 待完成配置（需手动）

### 1. Firebase Console 配置

**步骤**:

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 创建新项目或选择现有项目
3. 添加 Android 应用
4. **包名填写**: `com.anonymous.soundtherapyapp`
5. **下载**: `google-services.json`
6. **放置位置**: `android/app/google-services.json`

### 2. 签名证书 SHA-1（可选但推荐）

**获取调试证书 SHA-1**:
```bash
cd android
./gradlew signingReport
```

**获取发布证书 SHA-1**:
```bash
keytool -list -v -keystore my-release-key.keystore -alias my-key-alias
```

**密码**: `esonare123`（当前配置）

将 SHA-1 添加到 Firebase Console。

---

## 🔍 验证步骤

### 1. 构建验证

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

**预期结果**:
- ✅ BUILD SUCCESSFUL
- ✅ 生成 `app/build/outputs/bundle/release/app-release.aab`

### 2. 安装验证

```bash
adb install -r app/build/outputs/bundle/release/app-release.aab
```

**预期结果**:
- ✅ 安装成功
- ✅ App 启动正常

### 3. Crash 测试

**测试按钮位置**: App 首页右上角（黑色半透明面板）

**测试步骤**:
1. 打开 App
2. 点击 "触发 JS 崩溃" 按钮
3. 等待 500ms
4. App 应该崩溃

**Firebase Console 验证**:
1. 等待 5-10 分钟
2. 访问 Firebase Console > Crashlytics
3. 应该看到崩溃报告
4. **设备信息**: 红米 K80 Pro, Android 16

---

## 📊 崩溃测试代码

**位置**: `App.tsx` line 147-191

**功能**:
- ✅ 触发 JS 崩溃（Error 异常）
- ✅ 触发 Native 崩溃（NullPointer）
- ✅ 记录非致命异常（模拟）

**注意**: 发布前**必须删除**测试代码！

---

## 🚀 发布前检查

### 必须完成

- [ ] Firebase Console 项目创建
- [ ] `google-services.json` 下载并放置
- [ ] 构建成功无错误
- [ ] 真机安装成功
- [ ] Crash 测试通过（Firebase Console 能看到报告）

### 发布前清理

- [ ] **删除 Crash 测试按钮**（`App.tsx` line 147-191）
- [ ] **删除测试代码**（`App.tsx` line 13 `enableCrashTest`）
- [ ] 重新构建 Release AAB
- [ ] 验证包体积（目标：~129 MB）

---

## 📝 灰度发布计划

### 第一阶段：5% 用户

**目标**: 验证稳定性

**监控指标**:
- 崩溃率 < 1%
- ANR 率 < 0.5%
- Android 15+ 用户反馈

**时间**: 3-5 天

### 第二阶段：20% 用户

**条件**: 第一阶段指标正常

**时间**: 5-7 天

### 第三阶段：100% 发布

**条件**: 第二阶段指标正常

---

## ⚠️ 注意事项

1. **隐私政策**: 确保用户协议包含崩溃数据收集说明
2. **国内合规**: 国内版本可能需要使用腾讯 Bugly 替代 Firebase
3. **测试代码**: 发布前务必删除 Crash 测试按钮
4. **版本控制**: 不要将 `google-services.json` 提交到 Git（包含敏感信息）

---

## 🎯 下一步行动

1. **立即**: 完成 Firebase Console 配置
2. **测试**: 验证 Crash 上报
3. **清理**: 删除测试代码
4. **发布**: 灰度发布 v1.4.0

---

**最后更新**: 2026-04-16 07:50
