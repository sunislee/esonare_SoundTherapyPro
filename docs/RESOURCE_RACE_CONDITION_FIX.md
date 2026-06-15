# 🔒 资源竞态问题修复方案（2026-06-13）

## 📌 问题描述

App 启动时，后台下载资源的同时，播放器（PlaybackService）可能抢先读取尚未下载完成的音频文件，导致底层音频播放错误。

## ✅ 解决方案

### 方案一：切断抢占（互斥锁机制）

**修改文件：`src/services/NoiseAudioService.ts`**

在 `play` 方法入口处添加互斥检查，防止正在下载的资源被播放：

```typescript
// play 方法入口添加
if (DownloaderServiceInstance.isDownloading(trackId)) {
  console.warn(`[NoiseAudioService] ⚠️ ${trackId} 正在下载中，禁止播放`);
  return;
}
```

**工作原理：**
1. `DownloaderService` 内部维护一个 `downloadingResources: Map<string, boolean>` 字典
2. 下载开始时添加资源 ID，下载完成/失败后删除
3. 播放器入口检查该字典，如果资源正在下载则直接返回

### 方案二：UI 同步（实时进度推送）

**修改文件：`src/screens/ResourceDownloadScreen.tsx`**

添加独立的 useEffect 监听 DownloadService 推送的进度：

```typescript
useEffect(() => {
  console.log('[ResourceDownloadScreen] 📡 启动 DownloadService 进度监听...');
  
  const cleanup = DownloadService.checkAndDownload((progress: DownloadProgress) => {
    console.log(`[ResourceDownloadScreen] 📊 收到进度回调: progress=${progress.progress.toFixed(2)}, received=${progress.receivedBytes}, total=${progress.totalBytes}`);
    
    setDownloadInfo({
      progress: progress.progress,
      receivedBytes: progress.receivedBytes,
      totalBytes: progress.totalBytes
    });
  }).catch((err: any) => {
    console.error('[ResourceDownloadScreen] ❌ DownloadService 错误:', err);
    // 出错时也允许进入应用，不阻塞流程
  });
  
  return () => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
  };
}, []);
```

**工作原理：**
1. 组件挂载时调用 `DownloadService.checkAndDownload()`，传入进度回调
2. DownloadService 内部在每个文件下载完成后调用回调函数推送进度
3. ResourceDownloadScreen 的 useEffect 接收到进度后更新 state
4. 动画模块根据 `downloadInfo.progress` 实时渲染进度条

## 🔧 核心逻辑对比

### Before（存在问题）：
```
启动 App → 下载资源 (0%)
            ↓
         播放器尝试读取文件 (文件不存在) → 报错 ❌
```

### After（已修复）：
```
启动 App → 下载资源 (0%) → 10%
              ↓          ↗
         播放器检查 isDownloading() = true → 直接返回 ✅
              ↓
         进度实时推送 → UI 更新进度条
              ↓
         下载完成 (100%) → 允许播放 ✅
```

## 📝 关键技术点

1. **互斥锁实现**：使用 `Map<string, boolean>` 记录正在下载的资源
2. **状态清理**：下载成功/失败后必须从 Map 中删除对应的资源 ID
3. **进度推送**：DownloadService 的 `downloadFile` 回调中推送 `progress`、`receivedBytes`、`totalBytes`
4. **UI 响应**：使用 React useEffect 监听 state 变化，驱动动画更新

## 🛡️ 边界效应与避坑提示

1. **16K Page Size**：所有原生代码必须遵守 Page Size 16K 内存对齐要求
2. **RN 版本兼容性**：严格使用 React Native 0.81.5，禁止升级依赖
3. **Lottie 动画禁令**：严禁使用 Lottie，使用原生动效或其他替代方案
4. **状态清理**：`downloadingResources.delete(trackId)` 必须在 `finally` 块中执行

## 📄 修改文件清单

| 文件 | 修改位置 | 修改内容 |
|------|----------|----------|
| `src/services/DownloaderService.ts` | 第 19 行 | 添加 `isDownloading()` 方法 |
| `src/services/NoiseAudioService.ts` | 第 259-264 行 | play 方法入口添加互斥检查 |
| `src/screens/ResourceDownloadScreen.tsx` | 第 153-171 行 | 新增 DownloadService 进度监听 useEffect |

---
**生成时间：** 2026-06-13  
**维护版本：** v1.4.1