# v1.3.6 (136) 硬核语言检测修复 Spec

## Why
i18next 在 NotificationService 中不可靠，导致中文系统下灵动岛错误显示英文。必须引入原生语言检测机制，彻底解决国际化问题。

## What Changes
- 引入 `ReactNative.I18nManager` 和 `Platform.constants.locale` 原生语言检测
- 重写 `getSafeTranslation` 函数，优先使用系统 Locale 判断
- 硬编码中英文字符串，不依赖 i18next
- 强制同步 MediaSession 元数据

**BREAKING**: 不再依赖 i18next，改用原生语言检测

## Impact
- Affected specs: v136-notification-i18n, v136-fix-media-control
- Affected code: `NotificationService.ts`
- User experience: 中文系统必须显示中文，英文系统必须显示英文

## ADDED Requirements

### Requirement: 原生语言检测
系统 SHALL 使用 ReactNative.I18nManager 获取系统语言

#### Scenario: 语言检测
- **WHEN** NotificationService 初始化或更新
- **THEN** 通过 I18nManager.localeIdentifier 获取系统语言
- **THEN** 解析语言代码（zh/en/ja）

### Requirement: 硬核字符串映射
系统 SHALL 根据系统语言返回硬编码字符串

#### Scenario: 中文系统
- **WHEN** systemLocale.startsWith('zh')
- **THEN** 返回中文字符串

#### Scenario: 英文系统
- **WHEN** systemLocale.startsWith('en') 或其他
- **THEN** 返回英文字符串

## MODIFIED Requirements

### Requirement: getSafeTranslation 函数
**Before**: 依赖 i18next.isInitialized 和 i18next.t()  
**After**: 直接检测系统语言，返回硬编码字符串

### Requirement: MediaMetadata 文本来源
**Before**: 使用 i18next 翻译  
**After**: 使用原生语言检测 + 硬编码字符串

## REMOVED Requirements

### Requirement: i18next 依赖
**Reason**: 在 NotificationService 中不可靠  
**Migration**: 使用原生语言检测替代
