# 修复 i18n 语言初始化问题

## 问题分析

### 根本原因
1. **`initLanguage()` 未被调用**：
   - `index.js` 只导入了 `import './src/i18n'`，这会执行基础初始化
   - 但 `initLanguage()` 是异步函数，需要显式调用才能从 AsyncStorage 加载用户保存的语言设置
   - 当前代码中 `initLanguage()` 没有被任何地方调用

2. **为什么 scene.title 显示中文**：
   - `scene.title` 是 key（如 `"scenes.nature_forest.title"`）
   - `i18n.t(scene.title)` 能正确返回中文 "迷雾森林"
   - 说明 i18n 的基础初始化是成功的，但语言可能不对

3. **为什么其他文本显示英文**：
   - i18n 初始化时使用 `getSystemLanguage()` 检测系统语言
   - 如果检测失败，会回退到 `fallbackLng: 'en'`
   - Android 设备的语言检测可能有问题

## 修复方案

### 方案 1：在 App.tsx 中调用 initLanguage()
在 App 组件初始化时调用 `initLanguage()`，确保语言正确加载。

### 方案 2：在 AudioProvider 中强制同步语言
在 AudioProvider 初始化时，强制同步 i18n 实例的语言。

### 推荐方案：两者结合
1. 在 App.tsx 中调用 `initLanguage()`
2. 在 AudioProvider 中添加语言同步保护

## 实施步骤

### 1. 修改 App.tsx
```typescript
import { initLanguage } from './src/i18n';

useEffect(() => {
  const initApp = async () => {
    // 1. 先初始化语言
    await initLanguage();
    
    // 2. 再初始化 AudioService
    await audioService.setupPlayer();
    
    setIsAudioReady(true);
  };
  
  initApp();
}, []);
```

### 2. 修改 AudioContext.tsx
在 useEffect 中添加语言同步：
```typescript
useEffect(() => {
  // 强制同步语言
  const currentLang = i18n.language;
  console.log('[AudioContext] Current i18n language:', currentLang);
  
  audioService.onResourceNotFound = (scene) => {
    // ...
  };
}, [navigation, t]);
```

### 3. 添加调试日志
在 `getSystemLanguage()` 中添加详细日志，帮助诊断问题。

## 验收标准

- [ ] App 启动时调用 `initLanguage()`
- [ ] 控制台输出 `[i18n] Using system language: zh` 或类似日志
- [ ] 弹窗显示中文文本（"资源下载中"、"取消"、"去下载"）
- [ ] 场景名称显示中文（"迷雾森林"）
