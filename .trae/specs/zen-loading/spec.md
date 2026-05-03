# 禅意加载体验 Spec

## Why
当前老用户打开 App 时，由于资源已存在，会直接跳过 DownloadScreen 进入 NameEntry，导致"小人加载页"消失，用户体验突兀。需要增加人为缓冲，找回"禅意"体验。

## What Changes
- 修改 ResourceDownloadScreen.tsx 的 checkAndStart 逻辑
- 即使资源已存在，也强制展示 DownloadScreen 至少 1200ms
- 显示治愈小人动画（🧘‍♂️ emoji）
- 显示"正在准备冥想空间..."或"心声正在唤醒..."等禅意文案
- 1.2 秒后通过淡出动画平滑切换到主页面

## Impact
- **Affected specs**: 无
- **Affected code**: ResourceDownloadScreen.tsx
- **用户体验**: 老用户也能看到治愈的小人加载页，增加禅意体验

## Requirements

### Requirement: 人为缓冲
系统 SHALL 在资源已存在时，强制展示 DownloadScreen 至少 1200ms。

#### Scenario: 资源已存在
- **WHEN** 用户打开 App 且资源已下载完成
- **THEN** DownloadScreen 展示至少 1200ms，显示小人动画和禅意文案
- **THEN** 1200ms 后通过淡出动画切换到主页面

### Requirement: 禅意文案
系统 SHALL 显示以下文案之一：
- "正在准备冥想空间..."
- "心声正在唤醒..."
- "正在进入心灵空间..."

### Requirement: 小人动画
系统 SHALL 保留并展示：
- 🧘‍♂️ emoji 小人
- 呼吸动画（scale + opacity）

### Requirement: 平滑过渡
系统 SHALL 使用淡出动画切换到主页面：
- 淡出持续时间：300-500ms
- easing: Easing.out(Easing.quad)
