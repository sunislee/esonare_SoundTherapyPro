# Firebase Crashlytics 集成指南

> **状态**: ⚠️ 待集成  
> **优先级**: 高（灰度发布必需）

---

## 📋 当前状态

**检查结果**: ❌ Firebase Crashlytics 尚未集成

**影响**: 灰度发布期间无法实时监控崩溃日志

---

## 🚀 快速集成步骤

### 步骤 1：创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 创建新项目或选择现有项目
3. 添加 Android 应用
   - **包名**: `com.anonymous.soundtherapyapp`
   - **应用昵称**: 心声冥想
   - **调试签名证书 SHA-1**: （可选，用于测试）
   - **发布签名证书 SHA-1**: （必需，用于发布）

4. 下载 `google-services.json`
5. 放置到：`android/app/google-services.json`

---

### 步骤 2：配置项目级 build.gradle

**文件**: `android/build.gradle`

```gradle
buildscript {
    ext {
        buildToolsVersion = "36.0.0"
        minSdkVersion = 24
        compileSdkVersion = 36
        targetSdkVersion = 36
        ndkVersion = "27.1.12297006"
        kotlinVersion = "1.9.24"
        
        // 【新增】Firebase 版本
        firebaseVersion = "33.1.2"
        crashlyticsVersion = "3.0.2"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
        
        // 【新增】Firebase Crashlytics 插件
        classpath 'com.google.gms:google-services:4.4.2'
        classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.2'
    }
}
```

---

### 步骤 3：配置应用级 build.gradle

**文件**: `android/app/build.gradle`

#### 3.1 顶部添加插件

```gradle
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

// 【新增】Firebase 插件
apply plugin: 'com.google.gms.google-services'
apply plugin: 'com.google.firebase.crashlytics'
```

#### 3.2 dependencies 中添加

```gradle
dependencies {
    // The version of react-native is set by the React Native Gradle Plugin
    implementation("com.facebook.react:react-android")

    // 【新增】Firebase Crashlytics
    implementation platform('com.google.firebase:firebase-bom:33.1.2')
    implementation 'com.google.firebase:firebase-analytics'
    implementation 'com.google.firebase:firebase-crashlytics'

    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    } else {
        implementation jscFlavor
    }
}
```

---

### 步骤 4：初始化 Crashlytics（可选）

**文件**: `android/app/src/main/java/com/anonymous/soundtherapyapp/MainApplication.kt`

```kotlin
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics

class MainApplication : Application(), ReactApplication {

  override fun onCreate() {
    super.onCreate()
    
    // 【新增】初始化 Firebase
    FirebaseApp.initializeApp(this)
    
    // 【可选】启用崩溃收集（默认已启用）
    FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(true)
    
    // 【可选】记录非致命异常
    // FirebaseCrashlytics.getInstance().recordException(exception)
  }
}
```

---

### 步骤 5：测试集成

#### 5.1 构建并运行

```bash
cd android
./gradlew clean
./gradlew assembleRelease
```

#### 5.2 触发测试崩溃

在 React Native 代码中添加测试按钮：

```typescript
import crashlytics from '@react-native-firebase/crashlytics';

// 测试按钮
<Button
  title="Test Crash"
  onPress={async () => {
    await crashlytics().crash();
  }}
/>
```

#### 5.3 验证 Firebase Console

1. 等待 5-10 分钟
2. 访问 Firebase Console > Crashlytics
3. 查看是否显示测试崩溃

---

## 📊 灰度发布监控配置

### 关键指标

在 Firebase Console 中配置以下告警：

1. **崩溃率阈值**
   - 告警条件：崩溃率 > 1%
   - 通知渠道：邮件 + Slack

2. **ANR 率阈值**
   - 告警条件：ANR 率 > 0.5%
   - 通知渠道：邮件

3. **新版本稳定性**
   - 监控：新版本 vs 旧版本崩溃率对比
   - 告警条件：新版本崩溃率高出 50%

### 重点关注

**Android 15 用户**：
- 筛选条件：Android 版本 >= 15
- 特别关注：16KB 页相关崩溃（SIGBUS, mmap 错误）

---

## 🔧 可选：React Native 集成

如果需要 RN 层面的崩溃报告，安装：

```bash
pnpm add @react-native-firebase/crashlytics
pnpm add @react-native-firebase/app
cd ios && pod install
```

**注意**：当前项目以原生层监控为主，此步骤为可选。

---

## 📝 发布前检查清单

- [ ] `google-services.json` 已放置
- [ ] 项目级 build.gradle 已添加插件
- [ ] 应用级 build.gradle 已添加依赖
- [ ] 构建成功无错误
- [ ] 测试崩溃可在 Firebase Console 中看到
- [ ] 告警规则已配置

---

## ⚠️ 注意事项

1. **隐私政策**：确保用户协议中包含崩溃数据收集说明
2. **数据合规**：国内用户可能需要单独的配置（考虑使用腾讯 Bugly）
3. **性能影响**：Crashlytics 对性能影响极小（< 1%）

---

**建议**：立即集成 Firebase Crashlytics，确保灰度发布期间可实时监控稳定性。
