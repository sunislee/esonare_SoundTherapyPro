# RN 0.81 升级最终兼容性固化与体验优化计划

## 任务概述
完成 React Native 0.73 → 0.81 升级后的最后优化工作，确保应用稳定性和用户体验。

---

## 1. 逻辑健壮性优化（音频报错处理）

### 1.1 AudioService.ts - 错误处理与 UI 引导
**目标**：当音频播放因"找不到文件"报错时，触发 UI 层的下载引导提示

**当前问题**：
- 错误仅在控制台打印警告
- 用户不知道需要下载资源

**修改方案**：
```typescript
// AudioService.ts loadAudio 方法
private async loadAudio(scene: Scene, shouldPlay: boolean = false): Promise<void> {
  try {
    const uri = AUDIO_MAP[scene.filename];
    
    if (!uri) {
      console.error('[AudioService] ❌ 音频资源未找到:', scene.filename);
      // 【新增】触发 UI 层下载引导
      this.onResourceNotFound?.(scene);
      return;
    }
    
    // 检查文件是否存在
    const exists = await RNFS.exists(uri);
    if (!exists) {
      console.error('[AudioService] ❌ 音频文件不存在:', uri);
      // 【新增】触发 UI 层下载引导
      this.onResourceNotFound?.(scene);
      return;
    }
    
    // 继续播放逻辑...
  } catch (error) {
    console.error('[AudioService] ❌ loadAudio 失败:', error);
    // 【新增】错误类型判断
    if (error.message?.includes('file not found') || 
        error.message?.includes('ENOENT')) {
      this.onResourceNotFound?.(scene);
    }
  }
}

// 添加回调接口
public onResourceNotFound?: (scene: Scene) => void;
```

**UI 层对接**：
```typescript
// AudioContext.tsx
useEffect(() => {
  const audioService = AudioService.getInstance();
  
  // 设置资源缺失回调
  audioService.onResourceNotFound = (scene) => {
    // 显示下载引导弹窗
    Alert.alert(
      '资源未下载',
      `场景"${scene.title}"的音频文件尚未下载，是否立即前往下载？`,
      [
        { text: '取消', style: 'cancel' },
        { text: '去下载', onPress: () => navigation.navigate('ResourceDownload') }
      ]
    );
  };
}, []);
```

### 1.2 audioAssets.ts - 非空保护
**目标**：为所有 `.forEach` 调用添加非空保护

**修改方案**：
```typescript
// audioAssets.ts

// 【修复前】
AUDIO_MANIFEST.forEach(item => {
  AUDIO_MAP[item.filename] = getLocalPath(item.filename);
});

// 【修复后】
if (Array.isArray(AUDIO_MANIFEST)) {
  AUDIO_MANIFEST.forEach(item => {
    if (item && item.filename) {
      AUDIO_MAP[item.filename] = getLocalPath(item.filename);
    }
  });
} else {
  console.error('[audioAssets] ❌ AUDIO_MANIFEST is not an array!');
}

// 同样为 ASSET_LIST 添加保护
if (Array.isArray(ASSET_LIST)) {
  ASSET_LIST.forEach(asset => {
    // ... 处理逻辑
  });
}
```

---

## 2. 全局 API 兼容性清理（removeEventListener）

### 2.1 全项目扫描
**搜索模式**：
- `removeEventListener`
- `BackHandler.addEventListener`
- `Dimensions.addEventListener`
- `AppState.addEventListener`

**目标文件**：
- `src/screens/*.tsx`
- `src/components/*.tsx`
- `src/hooks/*.ts`
- `src/services/*.ts`

### 2.2 修复语法
**RN 0.81 新语法**：
```typescript
// ❌ 旧语法（已废弃）
const sub = BackHandler.addEventListener('hardwareBackPress', handler);
return () => BackHandler.removeEventListener('hardwareBackPress', handler);

// ✅ 新语法
const sub = BackHandler.addEventListener('hardwareBackPress', handler);
return () => sub.remove();
```

**修复清单**：
- [ ] NameEntryScreen.tsx（已修复）
- [ ] ImmersivePlayerNew.tsx（已确认正确）
- [ ] HomeScreen.tsx
- [ ] ResourceDownloadScreen.tsx
- [ ] StudyScreen.tsx
- [ ] 其他所有使用事件监听的组件

---

## 3. Patch 补丁固化

### 3.1 确认补丁存在
**检查文件**：
- `patches/react-native-fs+2.20.0.patch`

**补丁内容验证**：
```diff
--- a/node_modules/react-native-fs/android/src/main/java/com/rnfs/RNFSManager.java
+++ b/node_modules/react-native-fs/android/src/main/java/com/rnfs/RNFSManager.java
@@ -974,8 +974,10 @@ public class RNFSManager extends ReactContextBaseJavaModule {
     if (ex instanceof IORejectionException) {
       IORejectionException ioRejectionException = (IORejectionException) ex;
-      promise.reject(ioRejectionException.getCode(), ioRejectionException.getMessage());
+      String code = ioRejectionException.getCode();
+      promise.reject((code != null) ? code : "ERROR", ioRejectionException.getMessage());
       return;
     }
 
-    promise.reject(null, ex.getMessage());
+    String errorCode = (ex.getMessage() != null && ex.getMessage().startsWith("ENOENT")) ? "ENOENT" : "ERROR";
+    promise.reject(errorCode, ex.getMessage());
   }
```

### 3.2 检查 package.json postinstall 脚本
**目标**：确保 `postinstall` 包含 `patch-package`

**检查位置**：`package.json` → `scripts`

**预期内容**：
```json
{
  "scripts": {
    "postinstall": "patch-package",
    // ... 其他脚本
  }
}
```

**如不存在，添加**：
```json
"postinstall": "patch-package"
```

---

## 4. 性能与合规性检查（16KB Page Size 适配）

### 4.1 检查 build.gradle 配置
**文件**：`android/app/build.gradle`

**检查项**：

#### extractNativeLibs 配置
```gradle
android {
  packagingOptions {
    // 【RN 0.81 推荐】减少 APK 体积
    jniLibs {
      useLegacyPackaging = false
    }
  }
  
  defaultConfig {
    // 【可选】在 AndroidManifest.xml 中设置
    // android:extractNativeLibs="false"
  }
}
```

#### useLegacyPackaging 配置
```gradle
android {
  packagingOptions {
    jniLibs {
      // ✅ RN 0.81 适配 16KB Page Size
      useLegacyPackaging = false
    }
  }
}
```

#### NDK 版本检查
```gradle
android {
  ndkVersion "27.0.12077973" // 或更高版本，支持 16KB page size
}
```

### 4.2 检查 AndroidManifest.xml
**文件**：`android/app/src/main/AndroidManifest.xml`

**检查项**：
```xml
<application
  android:extractNativeLibs="false" <!-- 【可选】进一步减小 APK 体积 -->
  ... >
</application>
```

---

## 5. 生成升级变更日志

### 5.1 变更日志结构
**文件**：`RN081_UPGRADE_CHANGELOG.md`

**内容大纲**：
```markdown
# React Native 0.73 → 0.81 升级变更日志

## 升级日期
2026-03-17

## 核心变更

### 1. 崩溃修复
- ✅ RNFS 空指针问题（Promise.reject code 为 null）
- ✅ BackHandler.removeEventListener 未定义
- ✅ GestureHandlerRootView 缺失
- ✅ AudioService.addLoadingListener 未定义

### 2. 兼容性修复
- ✅ 所有事件监听器改用 subscription.remove() 语法
- ✅ AUDIO_MAP 初始化顺序修复（循环依赖）
- ✅ i18n 初始化时机优化

### 3. Patch 补丁
- ✅ react-native-fs+2.20.0.patch（RNFSManager.java NPE 修复）

### 4. 性能优化
- ✅ 16KB Page Size 适配（useLegacyPackaging = false）
- ✅ 原生模块加载优化

### 5. 用户体验优化
- ✅ 音频资源缺失时显示下载引导
- ✅ 错误处理健壮性提升

## 技术细节

### 关键文件修改
1. `src/services/AudioService.ts` - 添加监听器方法、错误处理
2. `src/constants/audioAssets.ts` - 修复循环依赖
3. `src/screens/NameEntryScreen.tsx` - BackHandler 语法修复
4. `App.tsx` - GestureHandlerRootView 包裹
5. `patches/react-native-fs+2.20.0.patch` - NPE 修复补丁

### 依赖更新
- react-native: 0.73.x → 0.81.x
- react-native-gesture-handler: 适配新架构
- react-native-reanimated: 适配新架构

## 测试验证
- ✅ App 启动正常
- ✅ 场景列表显示正常
- ✅ 场景详情页正常
- ✅ 交互式按钮正常
- ✅ 无崩溃、无 FATAL EXCEPTION

## 已知问题
- ⚠️ 音频资源需要下载后才能播放（预期行为）
- ⚠️ 部分场景音播放时会提示"底层音频播放错误"（资源未下载）

## 下一步
- 资源下载功能测试
- 音频播放完整流程测试
- Release 包编译与发布
```

---

## 执行顺序

1. **逻辑健壮性**（优先级：高）
   - 修改 AudioService.ts 错误处理
   - 修改 audioAssets.ts 非空保护
   - 修改 AudioContext.tsx 添加回调

2. **全局 API 清理**（优先级：中）
   - 全项目搜索 removeEventListener
   - 逐个修复组件

3. **Patch 固化**（优先级：高）
   - 确认补丁文件
   - 检查 postinstall 脚本

4. **性能检查**（优先级：中）
   - 检查 build.gradle
   - 检查 AndroidManifest.xml

5. **生成日志**（优先级：低）
   - 编写 RN081_UPGRADE_CHANGELOG.md

---

## 验收标准

- [ ] 所有音频错误都能触发 UI 下载引导
- [ ] 项目中不存在 removeEventListener 调用
- [ ] patch-package 补丁正确应用
- [ ] postinstall 脚本包含 patch-package
- [ ] build.gradle 配置符合 16KB 要求
- [ ] 生成完整的升级变更日志
- [ ] App 无任何崩溃或 FATAL EXCEPTION

---

## 风险评估

- **风险**：修改错误处理可能影响现有播放逻辑
- **缓解**：添加防御性检查，确保回调为可选
- **风险**：全局 API 清理可能遗漏某些文件
- **缓解**：使用 Grep 全项目扫描，确保覆盖

---

**计划制定完成，等待用户确认后开始执行。**
