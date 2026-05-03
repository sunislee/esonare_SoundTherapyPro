# 场景资源管理规则 (Scene Asset Management)

## 1. 唯一事实来源 (Single Source of Truth)
- **权威文件**：`src/constants/assetsIndex.js` 是场景资源的唯一权威来源。
- **映射文档**：`SCENE_MAP.md` 记录了所有 28 个场景的音频/图片配对关系。
- **铁律**：任何涉及资源引用的修改，必须以 `SCENE_MAP.md` 和 `assetsIndex.js` 为准，严禁自行推测文件名或路径。

## 2. 禁止硬编码映射
- 严禁在 UI 组件、`scenes.ts` 或其他文件中重新定义音频/图片对应关系。
- 所有场景资源必须通过 `SCENE_DATA[sceneId]` 查询获取。
- `scenes.ts` 中的 `getSceneBackground()` 和 `getSceneAudio()` 是唯一合法的查询入口。

## 3. RN 0.81.5 兼容性约束
- 所有场景渲染逻辑必须使用 React Native 0.81.5 兼容写法。
- 修改任何场景渲染逻辑前，必须先确认代码符合 RN 0.81.5 API 规范。
- 禁止使用 RN 0.81.5 中已废弃的 API。

## 4. 禁止占位资源
- 严禁使用项目中不存在的占位资源（如 `require('./placeholder.png')`）。
- 所有 `require()` 路径必须指向真实存在的文件。

## 5. 资源重新生成
- 修改 `github_音频资源` 或 `github_图片资源` 后，必须运行 `npm run build:assets` 重新生成 `assetsIndex.js`。
- 生成脚本位于 `scripts/generate-assets.js`，映射规则定义在其中的 `SCENE_IMAGE_MAP`。

## 6. 分类渲染顺序
- 场景分类渲染顺序必须与 `audioAssets.ts` 中的 `AUDIO_MANIFEST` 顺序一致。
- 分类名称映射：`nature` → `Nature`, `healing` → `Healing`, `brainwave` → `Brainwave`, `life` → `Life`, `western_church` → `WesternChurch`, `zen` → `Zen`, `interactive` → `Interactive`。
