# v1.3.6 (136) 通知栏国际化适配 Spec

## Why
视频验证发现通知栏和灵动岛存在两个国际化死角：
1. App 标题硬编码为中文『心声冥想』，英文系统下应显示英文名
2. 播放状态硬编码为中文『正在深度疗愈中...』，英文系统下应显示对应翻译

## What Changes
- 添加 `android/app/src/main/res/values-en/strings.xml` 英文资源文件
- 修改 `NotificationService.ts` 使用 i18next 动态获取翻译
- 确保通知栏标题和状态文本跟随系统语言自动切换

**BREAKING**: 无

## Impact
- Affected specs: google-play-compliance, i18n-support
- Affected code: `NotificationService.ts`, `android/app/src/main/res/values/strings.xml`
- User experience: 英文系统用户看到的通知栏文本将自动变为英文

## ADDED Requirements

### Requirement: Android 原生层国际化
系统 SHALL 在 `values-en/strings.xml` 中定义英文 App 名称

#### Scenario: 英文系统显示
- **WHEN** 用户系统语言为英文
- **THEN** 通知栏 App 名称显示 "esonare" 或 "Sound Meditation"
- **THEN** 灵动岛标题显示英文

### Requirement: 通知服务多语言支持
系统 SHALL 使用 i18next 动态获取通知栏文本

#### Scenario: 播放状态显示
- **WHEN** 播放状态更新时
- **THEN** 根据当前系统语言动态获取对应文本
- **THEN** 英文系统显示 "Deep Healing in progress..."

## MODIFIED Requirements

### Requirement: NotificationService 文本来源
**Before**: 硬编码中文字符串  
**After**: 使用 `i18next` 的 `t()` 方法动态获取

### Requirement: Android strings.xml
**Before**: 仅有 `values/strings.xml` (中文)  
**After**: 添加 `values-en/strings.xml` (英文)

## REMOVED Requirements

### Requirement: 硬编码中文文本
**Reason**: 不支持多语言，影响国际化体验  
**Migration**: 所有用户可见文本必须使用 i18n 翻译
