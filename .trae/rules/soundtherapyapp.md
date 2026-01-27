---
alwaysApply: false
---
# SoundTherapyApp 开发准则

## 1. 视觉与 UI 规范 (对标「小睡眠」)
- **风格**：必须保持深色沉浸式助眠风格。背景色使用 `#0F111A`，卡片色使用 `#1C1E2D`。
- **圆角**：所有交互卡片的 `borderRadius` 统一为 `16`。
- **禁止简陋**：严禁直接使用原生的 `Button` 或简单的 `View` 边框，必须使用具有交互反馈的 `TouchableOpacity` 和精致的阴影/层级设计。

## 2. 交互与动效 (Reanimated 规范)
- **侧滑删除**：必须使用 `ReanimatedSwipeable`。删除图标需带有缩放 (`scale`) 或透明度 (`opacity`) 的动画效果。
- **渲染安全**：严禁在组件渲染周期内直接读取 SharedValue 的 `.value` 属性（防止黄条警告）。必须通过 `useAnimatedStyle` 访问。

## 3. 数据持久化与同步逻辑
- **一致性**：当在管理页面（如 `RemixSchemeManagerScreen`）修改或删除数据时，必须确保 `AsyncStorage` 同步更新。
- **实时刷新**：所有展示持久化数据的页面（如 `HomeScreen`）必须使用 `useFocusEffect` 监听焦点状态，确保从其他页面返回时数据是最新的。

## 4. 环境约束
- **运行环境**：基于 Mac 系统开发，使用真机调试（不使用模拟器）。
- **网络**：考虑网络环境限制，优先使用本地缓存或验证过的库。

## 5. UI调整
- **所有 Screen 级别的组件，其根容器必须处理 SafeArea，严禁让内容钻入状态栏下方。
