# 📋 明日工作计划 (2026-05-08)

## 🎯 最高优先级：修复缩略图实时刷新问题

### 问题描述
资源下载完成后（Ready to Play），HomeScreen 的缩略图不会自动刷新显示真实背景图，仍然显示语义化占位块。只有进入播放页再返回后，缩略图才会更新为真实图片。

### 问题现象时间线
```
T0: 打开 App → oriental_zen_temple 显示 🏯 占位块 (isResourceReady = false)
T1: 后台下载中 → 进度条 10%...90% → 缩略图仍是占位块 ❌
T2: 下载完成 (Ready to Play) → isResourceReady = true → 缩略图仍是占位块 ❌
T3: 点击进入播放页 → 播放页显示真实背景图 ✅
T4: 返回 HomeScreen → 缩略图终于变成真实图片 ✅ (组件重新挂载)
```

### 根因分析
| 问题点 | 原因 |
|--------|------|
| **状态不同步** | `isResourceReady` 在 SceneItem 渲染时固定，不动态响应下载完成事件 |
| **缺少 key 刷新** | 缩略图组件未根据 `isResourceReady` 变化重新挂载 |
| **无订阅机制** | SceneItem 没有监听 `useResourceDownloader` 的完成回调 |

---

## 🔧 修复方案（3个备选）

### 方案 A：Key 强制重渲染 ⭐ 推荐（简单高效）
```typescript
// HomeScreen.tsx - SceneItem 组件内
<ImageBackground
  source={getThumbnailSource(item, isResourceReady)}
  style={styles.thumbnail}
  key={`thumb-${item.id}-${isResourceReady ? 'ready' : 'pending'}`}
  resizeMode="cover"
  imageStyle={styles.thumbnailRadius}
/>
```
**原理：** 当 `isResourceReady` 从 `false`→`true` 时，`key` 变化触发 React 重新挂载组件  
**优点：** 实现简单，无需额外状态管理  
**缺点：** 组件完全重新挂载，可能有轻微闪烁

### 方案 B：useEffect 监听 + forceUpdate
```typescript
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
  if (isResourceReady) {
    setRefreshKey(k => k + 1);
  }
}, [isResourceReady]);

// 使用时
<View key={refreshKey}>
  <ImageBackground ... />
</View>
```
**优点：** 更精细的控制  
**缺点：** 需要额外的 state 管理

### 方案 C：全局事件订阅（最彻底）
```typescript
// useResourceDownloader hook 中添加
const onDownloadComplete = useCallback((sceneId: string) => {
  EventEmitter.emit('DOWNLOAD_COMPLETE', sceneId);
}, []);

// SceneItem 中订阅
useEffect(() => {
  const sub = EventEmitter.addListener('DOWNLOAD_COMPLETE', (sceneId) => {
    if (sceneId === item.id) {
      setRefreshKey(k => k + 1);
    }
  });
  return sub.remove;
}, [item.id]);
```
**优点：** 最彻底的解决方案，支持跨组件通信  
**缺点：** 实现复杂度较高

---

## 📝 执行步骤

### Step 1: 备份当前代码
```bash
git stash 或 git commit -m "backup: 语义化占位机制实现"
```

### Step 2: 实施修复（推荐方案 A）
- 文件：`src/screens/HomeScreen.tsx`
- 位置：SceneItem 组件内的 ImageBackground/占位块渲染逻辑
- 修改：添加 `key` 属性绑定 `isResourceReady` 状态

### Step 3: 测试验证
1. 清除 App 数据（模拟首次安装）
2. 打开 HomeScreen，确认所有场景显示占位块
3. 等待某个 oriental/western_church 场景下载完成
4. **关键测试点：** 下载完成后缩略图是否自动变为真实图片？
5. 不进入播放页，直接在列表页观察变化

### Step 4: 性能检查
- 列表滑动是否流畅（60fps）
- 重新挂载是否有明显闪烁
- 内存占用是否正常

### Step 5: 提交合并
```bash
git add src/screens/HomeScreen.tsx
git commit -m "fix: 🖼️ 修复缩略图实时刷新问题 - 下载完成后立即显示真实图片"
git push origin RN0.81-16k
git checkout main && git merge RN0.81-16k && git push origin main
```

---

## ✅ 今日已完成成果（可提交）

| 功能模块 | 状态 | 关键文件 |
|---------|------|---------|
| 经典简约布局重构 | ✅ 完成 | `src/screens/HomeScreen.tsx` |
| 移除 BlurView 全背景模糊 | ✅ 完成 | 同上 |
| 左侧圆角缩略图 (64×64, r:12) | ✅ 完成 | 同上 |
| 三栏布局 (左-中-右) | ✅ 完成 | 同上 |
| 优雅语义化占位机制 | ✅ 完成 | 同上 |
| Category Icon 映射 (🏯⛪🌿💜🧠🏠) | ✅ 完成 | 同上 |
| 主题色占位块 (6种色调) | ✅ 完成 | 同上 |
| ImmersivePlayer 回滚稳定版 | ✅ 完成 | `src/screens/ImmersivePlayerNew.tsx` |

### 视觉规格达成清单
- [x] 卡片背景：深色半透明 `rgba(30,30,30,0.6)`
- [x] 已下载场景：显示真实背景图
- [x] 未下载场景：语义化磨砂色块 + Icon
- [x] 无黑块、无错误图片
- [x] 无 BlurView，60fps 丝滑
- [ ] **⬜ 下载完成后缩略图实时刷新（待修复）**

---

## 🎨 当前视觉效果截图参考

### 占位块效果（未下载时）
```
┌─────────────────────────────────────────────┐
│ ┌──────┐                                     │
│ │  🏯   │  禅意寺院              [▶]        │
│ │米色调 │  Ready to Play ✨                  │
│ └──────┘                                     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ┌──────┐                                     │
│ │  ⛪   │  西藏颂钵             [⬇]         │
│ │蓝灰调 │  45% - Downloading                 │
│ └──────┘                                     │
└─────────────────────────────────────────────┘
```

### 真实图片效果（已下载时）
```
┌─────────────────────────────────────────────┐
│ ┌──────┐                                     │
│ │🏯寺庙 │  禅意寺院              [▶]        │
│ │真实图 │  Ready to Play ✨                  │
│ └──────┘                                     │
└─────────────────────────────────────────────┘
```

---

## 💡 技术备忘录

### 关键代码位置
- **缩略图源选择器：** `HomeScreen.tsx` L41-L63 (`getThumbnailSource`)
- **语义化 Icon 映射：** `HomeScreen.tsx` L66-L74 (`CATEGORY_ICONS`)
- **主题色映射：** `HomeScreen.tsx` L78-L86 (`CATEGORY_COLORS`)
- **缩略图渲染逻辑：** `HomeScreen.tsx` L217-L233 (IIFE 双模式)
- **样式定义：** `HomeScreen.tsx` L552-L569 (`thumbnailPlaceholder`)

### 注意事项
1. **Android 兼容性：** 确保 `file://` 路径格式正确（已通过日志验证）
2. **性能优化：** 避免在列表项中使用复杂计算函数
3. **状态同步：** `isResourceReady` 来自 `downloadedSceneIds.has(scene.id)`
4. **缓存清理：** 修改后需执行 `./gradlew clean` 确保生效

---

## 🚀 明日目标

**核心目标：** 让"下载完成"到"缩略图显示真实图片"的过程无缝衔接，用户体验达到"一眼万年"的流畅感！

**成功标准：**
- ✅ 用户打开 App → 看到优雅占位块
- ✅ 后台静默下载 → 用户无感知
- ✅ 下载完成的瞬间 → 缩略图平滑过渡到真实图片
- ✅ 整个过程无需手动刷新或进出页面

---

*最后更新：2026-05-07 21:40*
*负责人：Trae AI Assistant*
*项目版本：SoundTherapyPro v1.4.2-beta*
