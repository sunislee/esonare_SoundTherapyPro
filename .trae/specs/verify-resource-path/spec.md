# 资源路径一致性验证 Spec

## Why
用户反馈弹窗显示"资源未下载"，但实际文件可能已经下载。需要验证 AudioService 检查的路径与 DownloadService 保存的路径是否一致，确保路径逻辑统一，避免虚假报警。

## What Changes
- 在 AudioService 检查资源时添加详细的路径日志
- 在 DownloadService 保存文件时添加路径日志
- 对比两个路径，确保指向同一个 `/audio` 文件夹

## Impact
- 受影响的服务：AudioService, DownloadService
- 影响范围：资源检查和下载流程
- 用户可见：无（仅调试日志）

## ADDED Requirements

### Requirement: 路径一致性验证
系统必须在以下位置添加详细的路径日志：

#### Scenario 1: AudioService 检查资源
- **WHEN** AudioService 调用 `playScene` 检查资源
- **THEN** 必须打印：
  - `AUDIO_MAP[scene.filename]` 的值
  - `getLocalPath()` 返回的路径
  - `RNFS.exists()` 检查的路径

#### Scenario 2: DownloadService 保存文件
- **WHEN** DownloadService 下载文件
- **THEN** 必须打印：
  - `localPath` 的完整路径
  - 文件保存后的实际路径

### Requirement: 路径对比验证
- **WHEN** 用户点击"去下载"后
- **THEN** 通过 Logcat 监控：
  - AudioService 检查的路径
  - DownloadService 保存的路径
  - 两个路径必须完全一致

## MODIFIED Requirements

### Requirement: AudioService.playScene 路径检查
在 `AudioService.playScene` 方法中，添加详细的路径诊断日志：

```typescript
// 检查资源是否存在
const uri = AUDIO_MAP[scene.filename];
console.log('[AudioService] AUDIO_MAP key:', scene.filename);
console.log('[AudioService] AUDIO_MAP value (uri):', uri);
console.log('[AudioService] getLocalPath 返回值:', getLocalPath(scene.category, scene.filename));

// 检查文件是否存在
const exists = await RNFS.exists(uri);
console.log('[AudioService] RNFS.exists 检查路径:', uri);
console.log('[AudioService] RNFS.exists 结果:', exists);
```

## REMOVED Requirements
无

## 验收标准

### 检查清单
- [ ] AudioService 打印 AUDIO_MAP 路径
- [ ] AudioService 打印 RNFS.exists 检查路径
- [ ] DownloadService 打印文件保存路径
- [ ] 两个路径完全一致
- [ ] 路径格式为 `/data/user/0/com.anonymous.soundtherapyapp/files/audio_resources/xxx.m4a`

## 调试步骤

1. **触发下载**：点击"去下载"按钮
2. **监控 Logcat**：
   ```bash
   adb logcat | grep -E "\[AudioService\]|\[DownloadService\]|AUDIO_MAP|localPath"
   ```
3. **对比路径**：
   - AudioService 检查的路径
   - DownloadService 保存的路径
   - 两个路径必须完全相同

## 可能的问题

### 问题 1: path 前缀不一致
- AudioService 使用 `file:///` 前缀
- DownloadService 不使用前缀
- **解决**：统一使用 `getLocalPath()` 返回值

### 问题 2: 路径中包含多余斜杠
- **解决**：检查 `getLocalPath()` 实现

### 问题 3: iOS/Android 路径格式不同
- **解决**：确保 `getLocalPath()` 正确处理平台差异
