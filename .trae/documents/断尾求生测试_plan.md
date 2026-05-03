# 断尾求生测试 - 极限调试计划（更新版）

## [ ] 任务 0：查杀'内鬼' - 优化下载完成后逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 DownloadService.ts 中检查下载完成后的 resolve 之前在做什么
  - 注释掉任何耗时的解压、校验或 AsyncStorage 操作
  - 特别是 finally 块里的 await this.markAsReady()
- **Success Criteria**:
  - 下载完成后立即触发进度回调，无额外等待
- **Test Requirements**:
  - `programmatic` TR-0.1: 验证 markAsReady() 被注释
  - `human-judgement` TR-0.2: 下载完成后立即跳转

## [ ] 任务 1：UI 降频 - 限制 setState 频率
- **Priority**: P0
- **Depends On**: 任务 0
- **Description**: 
  - 将 DownloadService.ts 中的 progressInterval 从 200ms 改为 500ms
  - 减少 UI 更新频率，把 CPU 还给下载线程
- **Success Criteria**:
  - progressInterval 改为 500ms
  - UI 每 500ms 更新一次
- **Test Requirements**:
  - `programmatic` TR-1.1: 验证 progressInterval 确实是 500ms
  - `human-judgement` TR-1.2: 进度条更新更流畅，不卡顿

## [ ] 任务 2：手动强制回调（0.99 → 1.0）
- **Priority**: P0
- **Depends On**: 任务 1
- **Description**: 
  - 在 DownloadService.ts 的 progressInterval 中，当 rawProgress >= 0.99 时，立即触发 progress: 1 的回调
  - 不要等所有文件下载完才触发 1.0
- **Success Criteria**:
  - 进度到 0.99 时立即发送 progress: 1 的回调
  - 跳过正常的下载完成逻辑
- **Test Requirements**:
  - `programmatic` TR-2.1: 验证 rawProgress >= 0.99 时立即触发 1.0 回调
  - `human-judgement` TR-2.2: 进度条到 99% 时立即跳转

## [ ] 任务 3：日志全开（时间戳）- 跳转前、中、后
- **Priority**: P0
- **Depends On**: 任务 2
- **Description**: 
  - 在 ResourceDownloadScreen.tsx 中添加完整的时间戳日志
  - 记录进入 enterMainApp 的时间
  - 记录执行 navigation.replace 前的时间
  - 记录执行 navigation.replace 后的时间
  - **只跳 NameEntry，不跳 MainTabs**
- **Success Criteria**:
  - 控制台输出完整的时间戳日志
  - 可以清晰看到代码执行流程
- **Test Requirements**:
  - `programmatic` TR-3.1: 验证 console.log 确实输出了毫秒级时间戳
  - `human-judgement` TR-3.2: 可以在控制台追踪跳转延迟
  - `programmatic` TR-3.3: 验证只跳 NameEntry，不跳 MainTabs

## [ ] 任务 4：直接编译（不 Clean）
- **Priority**: P0
- **Depends On**: 任务 3
- **Description**: 
  - 修改完代码后直接执行 assembleGoogleRelease
  - 不执行任何 clean 操作
- **Success Criteria**:
  - 编译成功
  - APK 生成并安装成功
- **Test Requirements**:
  - `programmatic` TR-4.1: 验证编译成功，没有 clean
  - `human-judgement` TR-4.2: APK 安装成功，可以测试

---

## 执行顺序
1. 先改 DownloadService.ts（任务 0+1+2）
2. 再改 ResourceDownloadScreen.tsx（任务 3）
3. 最后编译安装（任务 4）

## 风险提示
- 这是极限调试方案，可能导致资源标记不完整
- 仅用于性能测试，不能用于生产环境
- 只跳 NameEntry，不跳 MainTabs
