# 下载界面暴力修复 Spec

## Why
下载界面"嗖一下就过去"，用户无法看到真实的下载过程，导致资源未完整下载就进入应用，引发功能异常。

## What Changes
- **物理清空标记**：在 MainNavigator.tsx 的 useEffect 最开始，强制移除 `RESOURCES_READY_KEY`，不管本地有没有，先当成没有处理
- **异步等待空窗期**：在判断 resourcesReady 之前，强制加一个 500ms 的 Loading 状态，确保状态加载完成
- **核心校验降级**：在 OfflineService 的 Core 资源检查中，强制打印文件大小日志，让用户亲眼看到在数字节

## Impact
- Affected specs: 下载流程、资源检查逻辑
- Affected code: MainNavigator.tsx, OfflineService.ts

## ADDED Requirements
### Requirement: 物理清空标记
The system SHALL 在每次启动检查时，强制移除 `RESOURCES_READY_KEY` 标记

#### Scenario: 启动检查
- **WHEN** 应用启动
- **THEN** 执行 `await AsyncStorage.removeItem('RESOURCES_READY_KEY')`

### Requirement: 异步等待空窗期
The system SHALL 在检查资源前强制等待 500ms

#### Scenario: 启动检查
- **WHEN** 清空标记后
- **THEN** 执行 `await new Promise(resolve => setTimeout(resolve, 500))`

### Requirement: 核心校验日志
The system SHALL 在 Core 资源检查时打印文件大小

#### Scenario: 校验文件
- **WHEN** 检查 Core 资源文件
- **THEN** 打印 `console.log('正在校验文件:', fileName, '大小:', fileSize)`

## MODIFIED Requirements
### Requirement: Core 资源检查逻辑
在 OfflineService 的 isResourceReady 方法中，Core 资源检查时强制读取并打印文件大小

**修改内容**：
```typescript
// 【暴力修复 3】核心校验降级：强制打印文件大小
let fileSize = 0;
if (exists) {
  try {
    const stat = await RNFS.stat(localPath);
    fileSize = Number(stat.size);
    console.log(`[OfflineService] 正在校验文件：${coreId}, 路径：${localPath}, 大小：${fileSize} bytes (${(fileSize/1024).toFixed(2)} KB)`);
  } catch (e) {
    console.error(`[OfflineService] 无法读取文件大小：${coreId}, ${e}`);
    coreAssetsReady = false;
    continue;
  }
} else {
  console.log(`[OfflineService] 正在校验文件：${coreId}, 路径：${localPath}, 大小：0 bytes (文件不存在)`);
}
```

## REMOVED Requirements
无
