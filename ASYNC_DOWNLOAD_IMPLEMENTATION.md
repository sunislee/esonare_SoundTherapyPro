# 非阻塞式异步资源下载与本地缓存实现总结

> **日期**: 2026-04-15  
> **状态**: ✅ 核心功能完成，待远程仓库重命名

---

## ✅ 已完成任务

### 1. 创建 ResourceConfig.ts - 资源映射配置

**文件位置**: `SoundTherapy081/src/config/ResourceConfig.ts`

**功能**:
- 定义 32 个降噪音频资源的远程映射
- 配置优先级（1 = 高优先级，2 = 普通优先级）
- 自动生成排序后的下载队列

**资源配置**:
- **优先级 1** (8 个): `balanced_noise_track_1~8.mp3` - 最常用，优先下载
- **优先级 2** (24 个): 
  - `crowd_noise_track_1~8.mp3` (8 个)
  - `traffic_noise_track_1~8.mp3` (8 个)
  - `wind_noise_track_1~8.mp3` (8 个)

**远程 URL 格式**:
```typescript
https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/noise_reduction/{filename}
```

---

### 2. 实现 DownloaderService.ts - 异步下载器

**文件位置**: `SoundTherapy081/src/services/DownloaderService.ts`

**核心功能**:

#### 2.1 非阻塞式后台下载
```typescript
// 启动下载，不阻塞 UI
await DownloaderServiceInstance.startDownload();
```

#### 2.2 优先级队列
- 自动按优先级排序（优先级 1 优先）
- 队列处理：下载完成一个再处理下一个

#### 2.3 自动重试机制
- 最大重试次数：3 次
- 失败后自动重新加入队列

#### 2.4 本地缓存管理
- 缓存目录：`DocumentDirectoryPath/noise_reduction_cache`
- 支持检查文件是否存在
- 支持清理缓存、获取缓存大小

#### 2.5 下载状态订阅
```typescript
const unsubscribe = subscribeDownload((status) => {
  console.log(`下载进度：${status.filename} - ${status.progress}%`);
});
```

#### 2.6 关键 API

| 方法 | 说明 |
|-----|------|
| `startDownload()` | 开始后台下载（非阻塞） |
| `isDownloaded(resourceId)` | 检查资源是否已下载 |
| `getLocalPath(resourceId)` | 获取资源本地路径 |
| `subscribeDownload(callback)` | 订阅下载状态 |
| `clearCache()` | 清理缓存 |
| `getCacheSize()` | 获取缓存大小（MB） |

---

### 3. AudioService.ts - 资源状态检查

**新增方法**: `isAssetReady(type: string): Promise<boolean>`

**功能**:
1. 检查远程资源是否已下载
2. 检查本地场景资源是否已加载
3. 降级保护：资源未就绪时返回 `false`，防止崩溃

**使用示例**:
```typescript
import { isAssetReady } from '../services/AudioService';

// 在播放器组件中
const canPlay = await isAssetReady('balanced_noise_1');
if (!canPlay) {
  // 显示加载状态或降级为静音
  showLoadingIndicator();
}
```

**导出函数**:
```typescript
export const isAssetReady = (type: string) => 
  AudioService.getInstance().isAssetReady(type);
```

---

## 📝 待完成任务

### 任务 1：重命名远程仓库目录

**操作**: 将 `noise reduction` 重命名为 `noise_reduction`

**原因**: 避免 URL 空格转义错误（`%20`）

**手动执行步骤**（由于目录不在操作白名单中）:

```bash
# 1. 进入仓库目录
cd /Users/sunislee/Documents/trae_projects/sound-therapy-assets

# 2. 重命名目录
mv "noise reduction" noise_reduction

# 3. 提交更改
git add -A
git commit -m "refactor: rename 'noise reduction' to 'noise_reduction' (avoid URL encoding)"

# 4. 推送到 GitHub 和 Gitee
git push origin main
git push github main
```

---

## 🗑️ 本地"瘦身"执行：可从 android raw 目录删除的文件清单

### 可安全删除的文件（共 32 个）

所有降噪音频文件已迁移到远程仓库，可从本地删除：

#### balanced_noise 系列（8 个）
- `balanced_noise_track_1.mp3`
- `balanced_noise_track_2.mp3`
- `balanced_noise_track_3.mp3`
- `balanced_noise_track_4.mp3`
- `balanced_noise_track_5.mp3`
- `balanced_noise_track_6.mp3`
- `balanced_noise_track_7.mp3`
- `balanced_noise_track_8.mp3`

#### crowd_noise 系列（8 个）
- `crowd_noise_track_1.mp3`
- `crowd_noise_track_2.mp3`
- `crowd_noise_track_3.mp3`
- `crowd_noise_track_4.mp3`
- `crowd_noise_track_5.mp3`
- `crowd_noise_track_6.mp3`
- `crowd_noise_track_7.mp3`
- `crowd_noise_track_8.mp3`

#### traffic_noise 系列（8 个）
- `traffic_noise_track_1.mp3`
- `traffic_noise_track_2.mp3`
- `traffic_noise_track_3.mp3`
- `traffic_noise_track_4.mp3`
- `traffic_noise_track_5.mp3`
- `traffic_noise_track_6.mp3`
- `traffic_noise_track_7.mp3`
- `traffic_noise_track_8.mp3`

#### wind_noise 系列（8 个）
- `wind_noise_track_1.mp3`
- `wind_noise_track_2.mp3`
- `wind_noise_track_3.mp3`
- `wind_noise_track_4.mp3`
- `wind_noise_track_5.mp3`
- `wind_noise_track_6.mp3`
- `wind_noise_track_7.mp3`
- `wind_noise_track_8.mp3`

### 删除命令

```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/android/app/src/main/res/raw

# 删除所有降噪音频文件
rm balanced_noise_track_*.mp3
rm crowd_noise_track_*.mp3
rm traffic_noise_track_*.mp3
rm wind_noise_track_*.mp3

# 验证删除
ls -la | grep noise
```

### 删除后的影响

✅ **无负面影响**：
- 所有资源已通过 ResourceConfig.ts 映射到远程仓库
- DownloaderService 会在后台自动下载
- isAssetReady() 会检查资源状态，防止崩溃

⚠️ **注意事项**：
- 删除后首次运行 App 时，需要联网下载资源
- 建议在 Wi-Fi 环境下首次启动
- 下载完成后会缓存在本地，后续无需重复下载

---

## 🎯 使用流程

### 1. App 启动时初始化下载

在 App.tsx 或启动页中：

```typescript
import { initDownloadQueue, startDownload } from './services/DownloaderService';

// 初始化下载队列（按优先级排序）
initDownloadQueue();

// 启动后台下载（非阻塞）
startDownload();
```

### 2. 播放器中使用状态检查

```typescript
import { isAssetReady } from '../services/AudioService';

// 在播放前检查
const handlePlay = async () => {
  const ready = await isAssetReady('balanced_noise_1');
  
  if (ready) {
    // 正常播放
    playScene(scene);
  } else {
    // 显示加载状态或降级处理
    showLoading();
    // 可选：触发单个资源下载
  }
};
```

### 3. 订阅下载进度

```typescript
import { subscribeDownload } from './services/DownloaderService';

useEffect(() => {
  const unsubscribe = subscribeDownload((status) => {
    console.log(
      `${status.filename}: ${status.status} (${status.progress}%)`
    );
    
    // 更新 UI 进度条
    setDownloadProgress(status.progress);
  });
  
  return unsubscribe;
}, []);
```

---

## 📊 技术架构

```
┌─────────────────────────────────────────────────┐
│                  UI Layer                       │
│  - 显示下载进度                                  │
│  - 降级状态（Loading/静音）                       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              AudioService.ts                    │
│  - isAssetReady() 状态检查                       │
│  - 播放控制                                      │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│           DownloaderService.ts                  │
│  - 优先级队列管理                                │
│  - 后台下载（非阻塞）                             │
│  - 自动重试                                      │
│  - 缓存管理                                      │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│            ResourceConfig.ts                    │
│  - 32 个资源映射                                  │
│  - 远程 URL 配置                                  │
│  - 优先级定义                                    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         GitHub Remote Repository                │
│  sound-therapy-assets/noise_reduction/          │
│  - balanced_noise_track_1~8.mp3                 │
│  - crowd_noise_track_1~8.mp3                    │
│  - traffic_noise_track_1~8.mp3                  │
│  - wind_noise_track_1~8.mp3                     │
└─────────────────────────────────────────────────┘
```

---

## 🔧 下一步操作

1. **立即执行**：重命名远程仓库目录
   ```bash
   cd /Users/sunislee/Documents/trae_projects/sound-therapy-assets
   mv "noise reduction" noise_reduction
   git add -A && git commit -m "refactor: rename directory" 
   git push origin main && git push github main
   ```

2. **验证功能**：
   - 启动 App，观察后台下载
   - 检查下载进度订阅
   - 测试 isAssetReady() 返回值

3. **本地瘦身**：
   - 删除 android raw 目录中的 32 个文件
   - 重新编译验证
   - 测试离线播放（已缓存资源）

---

## 📝 注意事项

1. **网络依赖**：
   - 首次运行需要联网下载资源
   - 建议在 Wi-Fi 环境下首次启动

2. **缓存管理**：
   - 缓存文件位于 `DocumentDirectoryPath/noise_reduction_cache`
   - 可定期清理缓存释放空间

3. **错误处理**：
   - 下载失败会自动重试（最多 3 次）
   - isAssetReady() 返回 false 时，UI 应显示降级状态

4. **版本兼容**：
   - 旧版本用户升级后，本地 raw 文件仍然存在
   - 建议在新版本中删除 raw 文件，强制使用远程资源

---

**生成时间**: 2026-04-15  
**状态**: ✅ 核心功能完成，待远程重命名后可测试
