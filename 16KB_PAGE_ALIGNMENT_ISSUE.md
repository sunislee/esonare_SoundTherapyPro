# 16 KB 页面对齐问题记录

**日期**: 2026-03-12  
**版本**: v1.3.4 (134)  
**状态**: 待解决

---

## 📋 问题描述

Google Play 要求 Android 15 (SDK 35) 应用必须支持 16 KB 页面对齐，但项目中使用的第三方原生库（.so 文件）仍然是 4 KB 对齐，导致上传失败。

### ❌ 验证结果

使用 `llvm-readelf -l` 检查 AAB 文件中的 .so 文件：

```bash
unzip HeartSound_v1.3.4_vc134_20260312.aab base/lib/arm64-v8a/libexpo-av.so
llvm-readelf -l base/lib/arm64-v8a/libexpo-av.so | grep -A2 "LOAD"
```

**结果**：
```
LOAD  0x000000  ...  0x014de0  0x014de0  R E  0x1000  ← 4KB (4096)
```

**期望**：`0x4000` (16384)  
**实际**：`0x1000` (4096) ❌

### 受影响的库

1. `libexpo-av.so` - 4KB ❌
2. `libreanimated.so` - 4KB ❌
3. `libexpo-modules-core.so` - 4KB ❌
4. `libfbjni.so` - 4KB ❌

---

## 🔧 已尝试的解决方案

### ✅ 已完成的配置

1. **NDK 版本升级**
   ```gradle
   // android/build.gradle
   ndkVersion = "26.1.10909125"  // 使用 NDK r26
   ```

2. **CMake 编译参数**
   ```gradle
   // android/app/build.gradle
   externalNativeBuild {
       cmake {
           cppFlags "-O2", "-frtti", "-fexceptions", "-Wl,-z,common-page-size=16384", "-Wl,-z,max-page-size=16384"
           arguments "-DANDROID_STL=c++_shared", "-DANDROID_PLATFORM=android-35", "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
       }
   }
   ```

3. **打包配置**
   ```gradle
   // android/app/build.gradle
   packagingOptions {
       jniLibs {
           useLegacyPackaging true
       }
   }
   ```

4. **AndroidManifest.xml**
   ```xml
   <application 
       android:extractNativeLibs="true"
       ...>
   ```

5. **SDK 版本**
   ```gradle
   compileSdkVersion = 35
   targetSdkVersion = 35
   ```

### ❌ 失败的尝试

1. **NDK r27** - 编译失败（react-native-reanimated 不兼容）
2. **zipalign -P 16** - 不支持 AAB 文件，只能处理 APK
3. **CMake linker flags** - 只对本地编译代码有效，对预编译库无效

---

## 💡 待尝试的解决方案

### 方案 A：降级 targetSdkVersion（临时方案）

```gradle
// android/build.gradle
targetSdkVersion = 34  // 降级到 Android 14
```

**优点**：可以立即上传 Google Play  
**缺点**：无法享受 Android 15 新特性，Google 可能要求升级

### 方案 B：等待官方支持

- 联系 expo 团队：https://github.com/expo/expo/issues
- 联系 react-native-reanimated：https://github.com/software-mansion/react-native-reanimated/issues
- 询问 16KB 页面对齐的官方支持时间表

### 方案 C：手动修改 .so 文件（高风险）

使用 `elf-edit` 工具修改二进制文件头：

```bash
npm install -g elf-edit
# 提取 .so 文件
unzip HeartSound_v1.3.4_vc134_20260312.aab base/lib/arm64-v8a/*.so
# 修改对齐值（需要深入研究 ELF 格式）
elf-edit --modify-alignment=16384 base/lib/arm64-v8a/*.so
# 重新打包 AAB
```

**风险**：可能导致库文件损坏，需要深入 ELF 格式知识

### 方案 D：使用 bundletool 处理

```bash
# 下载 bundletool
# 使用 bundletool 的 optimize 命令可能支持 16KB 对齐
bundletool build-apks --bundle=app.aab --output=app.apks
```

需要验证 bundletool 是否支持 16KB 对齐优化

---

## 📦 当前版本状态

**文件位置**: `/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/Releases/GooglePlay/HeartSound_v1.3.4_vc134_20260312.aab`

**版本信息**:
- Version: 1.3.4
- Version Code: 134
- 大小：33 MB
- 状态：❌ 4KB 对齐，无法上传 Google Play

**可以做什么**:
- ✅ 上传到内部测试轨道测试功能
- ✅ 在真机上安装测试
- ❌ 不能上传到生产轨道

---

## 📝 明日行动计划

### 优先级 1：评估方案 A（降级 SDK）
- [ ] 修改 `targetSdkVersion = 34`
- [ ] 重新编译 AAB
- [ ] 验证是否可以上传 Google Play
- [ ] 评估影响（是否影响现有功能）

### 优先级 2：调研官方支持
- [ ] 查看 expo 最新文档是否支持 16KB
- [ ] 查看 react-native-reanimated 是否有更新
- [ ] 在 GitHub 上搜索相关问题

### 优先级 3：如果必须 Android 15
- [ ] 研究 elf-edit 工具使用方法
- [ ] 备份原始 .so 文件
- [ ] 尝试修改对齐值
- [ ] 验证修改后的库是否正常工作

---

## 🔗 相关资源

- Google Play 16KB 页面要求：https://developer.android.com/guide/practices/page-sizes
- NDK 下载：https://developer.android.com/ndk/downloads
- ELF 文件格式：https://en.wikipedia.org/wiki/Executable_and_Linkable_Format
- expo GitHub: https://github.com/expo/expo
- react-native-reanimated GitHub: https://github.com/software-mansion/react-native-reanimated

---

**最后更新**: 2026-03-12 22:30  
**下一步**: 明天早上优先评估方案 A（降级 targetSdkVersion 到 34）
