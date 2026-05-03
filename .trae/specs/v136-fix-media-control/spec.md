# v1.3.6 (136) 灵动岛 Media Control 修复 Spec

## Why
国际化修改后，灵动岛（Media Control）不显示。原因可能是：
1. i18next 在 NotificationService 初始化时可能未完全初始化，导致返回 null
2. MediaMetadata 的 title/artist 字段为 null 或 undefined
3. 缺少必要的媒体会话激活调用

## What Changes
- 修复 NotificationService 中的 i18next 调用，确保有默认值
- 添加 i18n 初始化检查
- 确保 MediaMetadata 字段永不为 null
- 强制刷新 MediaSession 状态

**BREAKING**: 无

## Impact
- Affected specs: v136-notification-i18n
- Affected code: `NotificationService.ts`
- User experience: 灵动岛/通知栏媒体控制必须正常显示

## ADDED Requirements

### Requirement: 安全的多语言调用
系统 SHALL 在 i18next 未初始化时提供默认英文文本

#### Scenario: i18next 未就绪
- **WHEN** i18next.isInitialized 为 false
- **THEN** 返回硬编码的英文默认值
- **THEN** 避免返回 null 或 undefined

### Requirement: MediaMetadata 非空保护
系统 SHALL 确保 title 和 artist 字段永不为空

#### Scenario: 元数据更新
- **WHEN** 调用 updateMetadataForTrack
- **THEN** title 和 artist 必须有有效字符串值
- **THEN** 如果翻译失败，使用英文默认值

## MODIFIED Requirements

### Requirement: NotificationService 文本获取
**Before**: 直接使用 `i18next.t()`  
**After**: 使用安全包装函数，提供默认值

### Requirement: MediaSession 激活
**Before**: 未明确调用 setActive  
**After**: 在 updateNotification 后调用 setMetadata 并激活

## REMOVED Requirements

### Requirement: 无保护的 i18next 调用
**Reason**: 可能导致 null 值，使灵动岛不显示  
**Migration**: 所有 i18next.t() 调用必须有默认值
