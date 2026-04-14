# 📅 本周工作计划 (2026.04.13 - 2026.04.19)

## 🎯 本周目标
完成 8 段 EQ 音效系统的全面升级，实现专业级音频调节体验

---

## 📋 每日任务分解

### 周一（已完成）✅
**主题：背景图实装与 UI 纠偏**

#### 完成内容
- [x] 从 Pexels/Unsplash 下载 4 张高清实拍背景图
  - 微风轻拂：柳树春日景色
  - 倾盆掩盖：雨夜城市交通路口
  - 围炉隔离：温馨家庭聚餐
  - 深空专注：极简办公桌面
- [x] 实现 `blurRadius=15` 模糊效果
- [x] 实现 1.5 秒淡入淡出动画
- [x] 添加 50% 透明度蒙层，确保文字清晰
- [x] 修正围炉隔离背景图（删除加班图，替换为家庭聚餐）
- [x] 修正深空专注图标（从问号改为 scan-outline）
- [x] 代码推送到 GitHub 和 Gitee

#### 技术细节
```typescript
// 背景图片配置
const SCENE_BACKGROUNDS = {
  noise_wind: require('../assets/images/nc_backgrounds/noise_wind.jpg'),
  noise_balanced: require('../assets/images/nc_backgrounds/noise_balanced.jpg'),
  noise_crowd: require('../assets/images/nc_backgrounds/noise_crowd.jpg'),
  noise_traffic: require('../assets/images/nc_backgrounds/noise_traffic.jpg'),
};

// 动画实现
Animated.timing(backgroundOpacity, {
  toValue: 0,
  duration: 750,
  useNativeDriver: true,
  easing: Easing.inOut(Easing.ease),
}).start();
```

#### 交付物
- ✅ 4 张高清背景图（src/assets/images/nc_backgrounds/）
- ✅ NoiseCancellationRoom.tsx 背景系统重构
- ✅ Git 提交：feat(nc-backgrounds), fix(nc-crowd-bg), fix(nc-icon)

---

### 周二（今日）🔥
**主题：音源落地与 LFO 算法注入**

#### 核心任务
1. **音频资源整理**
   - [ ] 确认 4 个降噪场景的 8 段音轨文件已就绪
   - [ ] 验证音频文件命名规范（nc_{mode}_freq{Hz}.m4a）
   - [ ] 检查音频文件完整性（时长、音量、音质）

2. **LFO 算法实现**
   - [ ] 封装 LFO 调制函数（Low Frequency Oscillator）
   - [ ] 实现正弦波、三角波、方波三种波形
   - [ ] 添加 LFO 深度（Depth）和速率（Rate）参数调节
   - [ ] 将 LFO 调制应用到 8 段音轨的音量参数

3. **音频播放逻辑优化**
   - [ ] 优化 8 段音轨并发加载逻辑
   - [ ] 实现音轨预热（Warmup）机制
   - [ ] 添加音频焦点管理（暂停/恢复）

#### 技术要点
```typescript
// LFO 算法示例
interface LFOParams {
  waveform: 'sine' | 'triangle' | 'square';
  rate: number;      // 0.1Hz - 10Hz
  depth: number;     // 0.0 - 1.0
}

function applyLFO(baseVolume: number, lfo: LFOParams, time: number): number {
  const lfoValue = calculateLFO(lfo, time);
  return baseVolume * (1 - lfo.depth + lfo.depth * lfoValue);
}
```

#### 交付物
- [ ] LFO 算法模块（src/services/LFOService.ts）
- [ ] 音频资源验证报告
- [ ] 8 段音轨并发加载优化代码
- [ ] Git 提交并推送远端

#### 预计工时
- 音频资源整理：1 小时
- LFO 算法实现：3 小时
- 播放逻辑优化：2 小时
- 测试验证：2 小时

---

### 周三
**主题：精调 8 段 EQ 预设**

#### 核心任务
1. **预设配置设计**
   - [ ] 定义 4 种场景的 EQ 预设曲线
   - [ ] 创建预设配置文件（src/configs/eq-presets.ts）
   - [ ] 实现预设快速切换功能

2. **频响曲线精调**
   - [ ] 微风轻拂：提升高频（8k-16k），平滑中频
   - [ ] 倾盆掩盖：增强低频（60-250Hz），模拟雨声
   - [ ] 围炉隔离：衰减中频（500-2k），模糊人声
   - [ ] 深空专注：平衡全频段，轻微提升低频

3. **用户交互优化**
   - [ ] 预设切换动画（200ms 淡入淡出）
   - [ ] 添加预设名称和描述
   - [ ] 支持用户自定义保存预设

#### 交付物
- [ ] EQ 预设配置文件
- [ ] 4 种场景的频响曲线参数
- [ ] 预设切换 UI 组件
- [ ] Git 提交并推送远端

#### 预计工时
- 预设配置设计：2 小时
- 频响曲线精调：4 小时
- 交互优化：2 小时

---

### 周四
**主题：Android 16KB 页适配压测**

#### 核心任务
1. **内存压力测试**
   - [ ] 在 16KB 页内核设备上测试音频加载
   - [ ] 监控内存峰值（目标：< 200MB）
   - [ ] 优化音频缓冲区大小

2. **性能优化**
   - [ ] 使用 Profiler 分析音频线程性能
   - [ ] 优化音轨加载时序
   - [ ] 实现音频资源懒加载

3. **兼容性验证**
   - [ ] 测试 Android 11-15 各版本
   - [ ] 验证不同品牌设备（小米、华为、OPPO）
   - [ ] 收集崩溃日志（Firebase Crashlytics）

#### 交付物
- [ ] 性能测试报告（内存、CPU、启动时间）
- [ ] 优化方案实施记录
- [ ] 兼容性测试清单
- [ ] Git 提交并推送远端

#### 预计工时
- 内存压力测试：3 小时
- 性能优化：3 小时
- 兼容性验证：2 小时

---

### 周五
**主题：代码双端同步与灰度准备**

#### 核心任务
1. **代码审查与清理**
   - [ ] 审查本周所有提交（Git Log）
   - [ ] 删除临时文件和调试代码
   - [ ] 更新 CHANGELOG.md

2. **双端同步**
   - [ ] 确保 GitHub 和 Gitee 代码一致
   - [ ] 验证 CI/CD 流水线
   - [ ] 打版本标签（v1.2.0）

3. **灰度发布准备**
   - [ ] 准备 Release Notes
   - [ ] 配置 Firebase App Distribution
   - [ ] 准备应用商店更新文案

#### 交付物
- [ ] CHANGELOG.md 更新
- [ ] Git 标签 v1.2.0
- [ ] Release Notes
- [ ] 灰度发布计划文档

#### 预计工时
- 代码审查：2 小时
- 双端同步：1 小时
- 灰度准备：3 小时

---

## 📊 进度追踪

| 日期 | 主题 | 状态 | 完成度 |
|------|------|------|--------|
| 周一 | 背景图实装与 UI 纠偏 | ✅ 已完成 | 100% |
| 周二 | 音源落地与 LFO 算法注入 | 🔥 进行中 | 0% |
| 周三 | 精调 8 段 EQ 预设 | ⏳ 待开始 | 0% |
| 周四 | Android 16KB 页适配压测 | ⏳ 待开始 | 0% |
| 周五 | 代码双端同步与灰度准备 | ⏳ 待开始 | 0% |

---

## 🎯 本周关键指标

- **代码质量**：无严重 Bug，Lint 通过率 100%
- **性能指标**：音频加载时间 < 500ms，内存峰值 < 200MB
- **兼容性**：Android 11-15 全版本通过测试
- **交付物**：5 个 Git 提交，1 个版本标签

---

## 📝 备注

- 每日工作结束后更新进度表
- 遇到问题及时记录并解决
- 保持代码注释和文档同步更新
- 每晚推送当日代码到远端

---

**创建时间**：2026-04-13  
**最后更新**：2026-04-13  
**负责人**：@sunislee
