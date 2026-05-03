# 修复 AudioContext 弹窗 i18n 问题

## 问题描述
在 `src/context/AudioContext.tsx` 中，`Alert.alert` 弹窗显示的是 i18n key 而不是翻译后的中文文本。

## 修复方案

### 1. 引入 useTranslation hook
在 `AudioContext.tsx` 中导入并使用 `useTranslation` hook。

### 2. 翻译场景名称
将 `scene.title` 转换为 `t(scene.title)`，确保显示中文而不是 key。

### 3. 翻译按钮文本
将硬编码的按钮文本改为使用 i18n：
- `'取消'` → `t('common.cancel')` 或 `t('profile.modals.cancel')`
- `'去下载'` → 需要新增翻译 key，建议使用 `actions.download` 或 `common.download`

### 4. 新增翻译 key
在以下文件中添加缺失的翻译：
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ja.json`

需要添加的 key：
```json
{
  "actions": {
    "download": "去下载"
  }
}
```

### 5. 添加错误保护
参考 `useBackHandler.ts` 的模式，使用 `i18n.t()` 而不是 `t()`，因为 Alert 回调可能在 hook 作用域外执行。

## 修改文件清单

1. **SoundTherapy081/src/context/AudioContext.tsx**
   - 导入 `useTranslation` 和 `i18n`
   - 修改 `Alert.alert` 调用
   - 使用 `i18n.t()` 确保在回调中也能正确获取翻译

2. **SoundTherapy081/src/i18n/locales/zh.json**
   - 在 `actions` 中添加 `download: "去下载"`

3. **SoundTherapy081/src/i18n/locales/en.json**
   - 在 `actions` 中添加 `download: "Download"`

4. **SoundTherapy081/src/i18n/locales/ja.json**
   - 在 `actions` 中添加 `download: "ダウンロード"`

## 参考实现

参考 `src/hooks/useBackHandler.ts` 的实现模式：
```typescript
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

export const useBackHandler = (isHomeScreen: boolean, navigation: any) => {
  const { t } = useTranslation();
  
  const handleBackPress = useCallback(() => {
    if (isHomeScreen) {
      Alert.alert(
        i18n.t('profile.modals.exitTitle'),
        i18n.t('profile.modals.exitMsg'),
        [
          {
            text: i18n.t('profile.modals.cancel'),
            // ...
          }
        ]
      );
    }
  }, [isHomeScreen, navigation, i18n.language]);
};
```

## 验收标准

- [ ] 弹窗显示中文场景名称（如"迷雾森林"）而不是 key（如"scenes.nature_forest.title"）
- [ ] 按钮文本显示中文（"取消"、"去下载"）
- [ ] 切换语言后弹窗文本能正确更新
- [ ] 英文和日文环境下也能正确显示对应语言
