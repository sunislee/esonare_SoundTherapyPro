# NameEntry 页面闪退修复规范

## Why
用户在 NameEntry 页面输入名字点击确定按钮后，App 立即闪退。Crash log 显示 `TypeError: undefined is not a function`，错误发生在 `AudioProvider` 和 `NameEntryScreen` 渲染时。需要在渲染 NameEntry 页面之前确保 i18n 和 AudioService 都已正确初始化。

## What Changes
- **修复 i18n 初始化时机**：确保在 App 渲染前完成 i18next 初始化
- **增强 AudioService 初始化保护**：在 AudioProvider 中增加更严格的就绪检查
- **优化 NameEntryScreen 渲染逻辑**：在翻译和导航未准备好时显示降级 UI
- **添加错误边界**：捕获并处理渲染时的异常

## Impact
- Affected specs: App 启动流程、i18n 初始化、AudioService 单例管理
- Affected code: `index.js`, `App.tsx`, `src/context/AudioContext.tsx`, `src/screens/NameEntryScreen.tsx`

## ADDED Requirements

### Requirement: i18n 初始化保护
The system SHALL ensure i18next is fully initialized before rendering any component that uses translations.

#### Scenario: App 启动时 i18n 初始化
- **WHEN** App 启动
- **THEN** i18next 必须在 index.js 中同步初始化
- **AND** NameEntryScreen 渲染前必须验证 t() 函数可用性

### Requirement: AudioService 就绪检查
The system SHALL verify AudioService is fully initialized before calling any of its methods.

#### Scenario: AudioProvider 挂载
- **WHEN** AudioProvider 挂载
- **THEN** 必须等待 AudioService.isReady() 返回 true
- **AND** 在未就绪时提供降级功能（允许用户继续使用，但不播放音频）

### Requirement: NameEntryScreen 降级渲染
The system SHALL allow NameEntryScreen to render even if i18n or AudioService is not ready.

#### Scenario: 翻译未准备好
- **WHEN** t() 函数不可用
- **THEN** 显示硬编码的默认文本
- **AND** 允许用户正常输入和跳转

## MODIFIED Requirements

### Requirement: index.js 初始化顺序
在 index.js 中，i18n 导入必须在最前面，确保在任何组件渲染前完成初始化。

```javascript
import './src/i18n'; // 【关键修复】确保 i18next 在应用启动时初始化
import TrackPlayer from 'react-native-track-player';
import PlaybackService from './src/services/PlaybackService';
TrackPlayer.registerPlaybackService(() => PlaybackService);
```

### Requirement: AudioContext 初始化保护
AudioContext 中的 useEffect 必须包含完整的错误处理，防止因 AudioService 未就绪导致的崩溃。

## REMOVED Requirements
**无** - 本次修复不删除任何现有功能，仅增强错误处理和初始化保护。
