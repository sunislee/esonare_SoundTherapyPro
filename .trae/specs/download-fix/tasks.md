# SoundTherapyPro 下载逻辑修复 - 实现计划

## [x] Task 1: 分析现有下载逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 分析现有的下载逻辑，找出导致"嗖一下就过去"的根本原因
  - 检查 Core 资源检查逻辑
  - 分析下载进度显示逻辑
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-1.1: 确认现有下载逻辑的执行流程
  - `human-judgement` TR-1.2: 分析日志输出，找出问题所在
- **Notes**: 重点关注 DownloadService.ts 和 OfflineService.ts 的逻辑

## [x] Task 2: 修复下载界面"嗖一下就过去"的问题
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 修复导致下载界面快速闪过的逻辑
  - 确保下载过程真实执行
  - 增加必要的延迟和状态检查
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-2.1: 下载界面应显示至少 5 秒
  - `human-judgement` TR-2.2: 下载界面不应快速闪过
- **Notes**: 可能需要调整下载流程的执行顺序

## [x] Task 3: 优化 Core 资源检查逻辑
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 优化 Core 资源的检查逻辑
  - 确保 Core 资源优先下载
  - 调整 Core 资源的定义和检查方式
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-3.1: Core 资源应优先下载
  - `programmatic` TR-3.2: Core 资源下载完成后应能正常进入应用
- **Notes**: Core 资源包括启动音效、主界面基础素材等

## [x] Task 4: 改进下载进度显示
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 改进下载进度的计算和显示
  - 确保进度条真实反映实际下载状态
  - 提供更清晰的下载状态反馈
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-4.1: 进度条应平滑增长
  - `human-judgement` TR-4.2: 进度显示应与实际下载状态一致
- **Notes**: 可能需要调整进度计算的逻辑

## [x] Task 5: 增加失败处理机制
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 增加下载失败的处理机制
  - 实现超时处理
  - 提供错误提示和重试机制
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-5.1: 下载失败时应能正常处理，不会卡死
  - `human-judgement` TR-5.2: 下载失败时应显示明确的错误提示
- **Notes**: 考虑网络不稳定的情况

## [x] Task 6: 测试和验证
- **Priority**: P0
- **Depends On**: Task 2, Task 3, Task 4, Task 5
- **Description**:
  - 测试修复后的下载逻辑
  - 验证 Core 资源的下载和检查
  - 测试下载进度显示
  - 测试失败处理机制
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有功能应正常工作
  - `human-judgement` TR-6.2: 用户体验应良好
- **Notes**: 测试时应模拟不同网络条件