# 资源下载双轨制实现文档

## 概述

实现了"双轨制"资源下载策略，平衡"秒开体验"和"资源完整性"。

## 双轨制架构

### 1. 强制阻塞轨 (18 个核心资源)

**目标**：确保用户进入主页前，18 个核心场景资源必须就位。

**实现位置**：`ResourceDownloadScreen.tsx`

**逻辑流程**：
1. 检查 18 个核心资源是否存在
2. 如果不存在，**阻塞**下载直到完成
3. 下载完成后，进行物理完整性校验
4. 校验通过后，才允许用户输入用户名
5. 用户输入用户名后，跳转到 `MainTabs`

**关键代码**：
```typescript
// ResourceDownloadScreen.tsx
await DownloadService.checkAndDownload((info) => { 
  setDownloadInfo(info);
  // 更新 UI 进度条
}); 

// 下载完成后校验
const integrity = await OfflineService.checkResourceIntegrity();
if (integrity.isComplete) {
  await OfflineService.markAsReady();
  // 后台触发降噪音频下载
  downloadNoiseReductionResources().catch(err => {
    console.error('后台下载失败:', err);
  });
}
```

### 2. 静默背景轨 (32 个降噪音频)

**目标**：在后台静默下载 32 个降噪音频，不影响用户体验。

**实现位置**：`ResourceDownloadScreen.tsx` + `MainTabs` (待添加)

**触发时机**：
1. **新用户**：18 个核心资源下载完成后，立即后台触发
2. **老用户**：进入 `MainTabs` 后，后台触发

**关键特性**：
- ✅ 不阻塞 UI
- ✅ 不阻塞用户名输入
- ✅ 不阻塞跳转到主页
- ✅ 失败不影响主流程

**关键代码**：
```typescript
// 后台静默触发（不 await）
downloadNoiseReductionResources().catch(err => {
  console.error('后台下载降噪音频失败:', err);
});
```

## 代码修改清单

### App.tsx

**修改前**：
- 包含下载逻辑
- 包含下载状态管理
- 包含 Crash 测试代码

**修改后**：
```typescript
// 只负责初始化
useEffect(() => {
  const initApp = async () => {
    // 1. 初始化语言
    await initLanguage();
    
    // 2. 初始化 AudioService
    const audioService = AudioService.getInstance();
    await audioService.setupPlayer();
    
    // 完成
    setIsAudioReady(true);
  };
  initApp();
}, []);
```

### ResourceDownloadScreen.tsx

**新增功能**：
1. `downloadNoiseReductionResources()` 函数
2. 双轨制下载逻辑
3. 后台静默触发机制

**下载流程**：
```
1. 检查资源完整性
   ↓
2. 如果不完整，阻塞下载 18 个核心资源
   ↓
3. 下载完成后校验
   ↓
4. 校验通过 → 后台触发 32 个降噪音频下载
   ↓
5. 显示用户名输入框
   ↓
6. 用户输入后跳转到 MainTabs
```

**老用户逻辑**：
```
1. 检查资源完整性 → 完整
   ↓
2. 检查用户名 → 有值
   ↓
3. 后台触发 32 个降噪音频下载
   ↓
4. 直接跳转到 MainTabs
```

## 用户体验

### 新用户（首次安装）

1. 打开 App → 显示禅意下载页面
2. 下载 18 个核心资源（显示进度条）
3. 下载完成 → 显示用户名输入框
4. 输入用户名 → 跳转到 MainTabs
5. **后台**：32 个降噪音频正在下载

### 老用户（已有资源）

1. 打开 App → 秒进 MainTabs
2. **后台**：静默检查并下载 32 个降噪音频
3. 用户正常使用，无感知

## 待完成功能

### MainTabs 微型进度条

**位置**：MainTabs 底部（或侧边栏）

**样式**：淡紫色微型进度条

**功能**：
- 显示 32 个降噪音频的下载进度
- 下载完成后自动隐藏
- 不影响用户正常使用

**实现思路**：
1. 在 `MainTabs.tsx` 中添加状态监听
2. 订阅 `downloadNoiseReductionResources` 的进度
3. 显示/隐藏进度条

## 技术细节

### 错误处理

```typescript
// 所有后台下载都使用 .catch() 捕获错误
downloadNoiseReductionResources().catch(err => {
  console.error('后台下载失败:', err);
  // 不抛出异常，不影响主流程
});
```

### 并发控制

```typescript
// 32 个降噪音频并发下载
const downloadPromises = NOISE_REDUCTION_RESOURCES.map(async (resource) => {
  try {
    // 下载逻辑
  } catch (error) {
    console.error(`下载失败：${resource.id}`, error);
    // 单个文件失败不影响其他文件
  }
});

await Promise.all(downloadPromises);
```

### 文件去重

```typescript
// 检查文件是否已存在
if (await RNFS.exists(localPath)) {
  console.log(`✅ ${resource.id} 已存在，跳过`);
  return; // 跳过已存在的文件
}
```

## 测试验证

### 新用户测试

```bash
# 清除数据
adb shell pm clear com.anonymous.soundtherapyapp

# 启动 App
adb shell am start -n com.anonymous.soundtherapyapp/.MainActivity

# 查看日志
adb logcat | grep -E "ResourceDownloadScreen.*下载|降噪|18/18"
```

**预期结果**：
1. 显示下载进度条（18/18）
2. 下载完成后显示用户名输入框
3. 输入用户名后跳转到 MainTabs
4. 后台继续下载 32 个降噪音频

### 老用户测试

```bash
# 直接启动 App（不清除数据）
adb shell am start -n com.anonymous.soundtherapyapp/.MainActivity

# 查看日志
adb logcat | grep -E "后台触发|降噪"
```

**预期结果**：
1. 秒进 MainTabs
2. 后台静默下载 32 个降噪音频

## 优势总结

1. **秒开体验**：老用户打开 App 直接进入主页
2. **资源完整**：最终所有 50 个资源都会下载完成
3. **优雅降级**：即使降噪音频下载失败，也不影响核心功能
4. **用户无感**：后台下载不打扰用户正常使用

## 下一步

1. ✅ 实现双轨制下载逻辑
2. ✅ 清理 App.tsx 下载代码
3. ⏳ 在 MainTabs 添加微型进度条
4. ⏳ 添加下载速度监控（可选）
5. ⏳ 添加下载失败重试机制（可选）
