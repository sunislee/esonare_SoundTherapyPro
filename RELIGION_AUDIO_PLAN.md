# 宗教音频内容接入计划

> **目标日期**: 2026-04-18
> **版本**: v1.4.2
> **分支**: main

---

## 1. 需求概述

在现有冥想场景基础上，新增宗教/灵性音频内容，丰富 App 的内容生态。

---

## 2. 待确认事项

### 2.1 宗教类型清单
需明确具体接入哪些宗教/灵性音频，例如：
- [ ] 佛教（诵经、木鱼、钟声等）
- [ ] 基督教（圣歌、管风琴、唱诗班等）
- [ ] 伊斯兰教（古兰经诵读、宣礼等）
- [ ] 印度教（Om 吟唱、西塔琴等）
- [ ] 道教（太极音乐、古琴等）
- [ ] 其他：________

### 2.2 音频资源来源
- [ ] 音频文件是否已准备好？
- [ ] 音频格式要求：MP3 / M4A / WAV？
- [ ] 音频时长范围？
- [ ] 是否需要循环播放？

### 2.3 版权合规
- [ ] 所有音频是否拥有合法使用权？
- [ ] 是否需要标注来源/作者？
- [ ] Google Play 审核对宗教内容的政策确认

---

## 3. 技术实现步骤

### 3.1 场景分类扩展
修改 [scenes.ts](file:///Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/src/constants/scenes.ts)：
- 新增 `SceneCategory` 枚举值：`'Religion'` 或 `'Spiritual'`
- 为该分类配置背景图和主题色

### 3.2 音频资源接入
- 音频文件放置到 `android/app/src/main/res/raw/`
- 更新 `audioAssets.ts` 资源清单
- 确保 `audioAssets.ts` 与原生目录同步

### 3.3 场景定义
在 `SCENES` 数组中新增宗教场景条目，格式参考现有场景：
```typescript
{
  id: 'buddhist_chant',
  title: '佛教诵经',
  category: 'Religion',
  audioSource: 'raw',
  filename: 'buddhist_chant',
  baseVolume: 0.8,
  // ...
}
```

### 3.4 UI 展示
- 主页场景列表按分类分组展示
- 确认宗教场景的分类标题（中文/英文）
- 图标/封面图设计

---

## 4. 执行清单

- [ ] 确认宗教类型清单
- [ ] 收集/准备音频文件
- [ ] 确认版权合规
- [ ] 扩展 SceneCategory 枚举
- [ ] 配置宗教分类背景图和主题色
- [ ] 音频文件放入 res/raw 目录
- [ ] 更新 audioAssets.ts
- [ ] 在 scenes.ts 中定义宗教场景
- [ ] 真机测试播放效果
- [ ] 检查分类展示 UI
- [ ] Git 提交并推送

---

## 5. 备注

- 宗教内容需尊重各宗教文化，命名和描述需审慎
- Google Play 对宗教类 App 有额外审核要求，需提前确认
- 建议先接入 1-2 个宗教类型做 MVP 验证，再逐步扩展
