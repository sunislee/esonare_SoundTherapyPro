# 8 段音轨并发加载测试指南

## 📋 测试目标
验证在 16KB 页设备上，8 段音轨并发加载时的内存占用情况。

**目标阈值**：PSS Total < 200MB

---

## 🛠️ 测试准备

### 1. 连接设备
```bash
adb devices
```
确保红米 K80 Pro 已连接并被识别。

### 2. 安装测试版本
```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081
pnpm android
```

### 3. 启动内存监控（方式一：持续监控）
```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/scripts
./monitor_memory.sh
```

### 4. 快速检查（方式二：单次检查）
```bash
./check_memory_quick.sh
```

---

## 🎯 测试步骤

### 步骤 1：基线测量（App 冷启动）
1. 完全关闭 App
2. 重新启动 App
3. 记录初始内存占用（基线值）

```bash
# 执行快速检查
./check_memory_quick.sh
```

**预期**：基线内存应该在 80-120MB 之间

---

### 步骤 2：单场景音频加载测试
1. 进入任意降噪场景（如：微风轻拂）
2. 等待音频加载完成
3. 记录内存占用

```bash
./check_memory_quick.sh
```

**预期**：单场景加载后内存增加 20-40MB

---

### 步骤 3：8 段音轨并发加载测试（压力测试）

#### 方法 A：手动触发
1. 打开降噪房间页面
2. **快速连续点击** 4 个不同的降噪场景卡片
3. 每次点击间隔 < 1 秒
4. 观察内存监控脚本的实时数据

#### 方法 B：使用测试脚本（推荐）
创建一个自动化测试脚本，自动触发 8 段音轨加载。

---

## 📊 数据记录

### 测试数据记录表

| 测试阶段 | PSS Total(MB) | Native Heap(MB) | Private Dirty(MB) | 时间戳 |
|---------|---------------|-----------------|-------------------|--------|
| 基线（冷启动） | | | | |
| 单场景加载 | | | | |
| 4 场景并发 | | | | |
| 8 音轨峰值 | | | | |

---

## ⚠️ 阈值告警

### 如果内存超过 200MB：

1. **立即停止测试**
2. **保存详细日志**：
   ```bash
   adb shell dumpsys meminfo com.anonymous.soundtherapyapp > memory_detail.txt
   ```

3. **分析 Sound 实例**：
   ```bash
   # 查看当前运行的 Sound 实例数量
   adb shell dumpsys meminfo com.anonymous.soundtherapyapp | grep -i "sound\|audio\|track"
   ```

4. **检查音轨加载逻辑**：
   - 是否有音轨未正确释放？
   - 是否存在重复加载？
   - 音频缓冲区大小是否合理？

---

## 🔍 性能优化建议

### 如果内存接近阈值（> 180MB）：

1. **实现音轨懒加载**
   - 只在需要时加载音轨
   - 场景切换时卸载旧音轨

2. **优化音频缓冲区**
   - 减小 Sound 实例的缓冲区大小
   - 使用流式加载代替一次性加载

3. **添加内存警告处理**
   ```typescript
   import { AppState } from 'react-native';
   
   AppState.addEventListener('memoryWarning', () => {
     // 释放未使用的 Sound 实例
     cleanupUnusedSounds();
   });
   ```

---

## 📝 测试报告模板

```
测试日期：2026-04-17
设备：红米 K80 Pro (Android 15, 16KB 页)
RN 版本：0.81.5

【测试结果】
✅ 通过 / ❌ 失败

基线内存：XX MB
单场景加载：XX MB (+XX MB)
8 音轨并发峰值：XX MB (+XX MB)

【问题分析】
（如有问题，详细描述）

【优化建议】
（如有必要，列出优化方向）
```

---

## 🚀 开始测试

执行以下命令开始：

```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/scripts

# 方式 1：持续监控（推荐）
./monitor_memory.sh

# 方式 2：快速检查
./check_memory_quick.sh
```

然后在设备上触发 8 段音轨并发加载，观察内存变化。
