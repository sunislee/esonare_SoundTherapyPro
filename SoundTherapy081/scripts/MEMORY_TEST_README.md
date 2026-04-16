# 内存压力测试执行手册

> **日期**: 2026-04-17  
> **设备**: 红米 K80 Pro (Android 15, 16KB 页)  
> **RN 版本**: 0.81.5  
> **目标**: PSS Total < 200MB

---

## ✅ 环境检查完成

### 配置状态

| 检查项 | 状态 | 详情 |
|--------|------|------|
| RN 版本 | ✅ | 0.81.5 |
| NDK 版本 | ✅ | 27.1.12297006（支持 16KB） |
| extractNativeLibs | ✅ | true（已适配 16KB） |
| abiFilters | ✅ | arm64-v8a（已添加） |

### 已修改文件
- `android/app/build.gradle` - 添加 abiFilters 配置

---

## 🛠️ 测试工具已就绪

### 脚本清单

| 脚本名称 | 用途 | 使用场景 |
|---------|------|---------|
| `monitor_memory.sh` | 持续内存监控（每 5 秒） | 长时间测试 |
| `check_memory_quick.sh` | 快速内存检查（单次） | 快速验证 |
| `test_8track_concurrent.sh` | 8 段音轨并发测试 | 压力测试 |
| `analyze_sound_instances.sh` | Sound 实例堆栈分析 | 内存超标时 |

### 脚本位置
```
/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/scripts/
```

---

## 📋 测试流程

### 阶段 1：基线测量

#### 步骤 1：启动 App
```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081
pnpm android
```

#### 步骤 2：测量基线内存
```bash
cd scripts
./check_memory_quick.sh
```

**预期结果**：80-120MB

---

### 阶段 2：单场景测试

#### 步骤 1：进入降噪场景
在设备上点击任意降噪场景卡片

#### 步骤 2：测量内存
```bash
./check_memory_quick.sh
```

**预期结果**：增加 20-40MB

---

### 阶段 3：8 段音轨并发压力测试

#### 方法 A：自动测试脚本
```bash
./test_8track_concurrent.sh
```

#### 方法 B：手动测试 + 持续监控

1. **启动持续监控**（新终端）：
   ```bash
   ./monitor_memory.sh
   ```

2. **手动触发并发加载**：
   - 打开降噪房间页面
   - 快速连续点击 4 个不同场景卡片
   - 每次间隔 < 1 秒

3. **观察内存峰值**：
   - 监控脚本会实时显示 PSS 值
   - 超过 200MB 会自动告警

---

### 阶段 4：内存超标分析

**如果内存 > 200MB**，执行：

```bash
./analyze_sound_instances.sh
```

该脚本会：
1. 分析 Native Heap 占用
2. 分析 Dalvik Heap 占用
3. 查找 Sound/Audio 相关对象
4. 生成优化建议

**输出文件**：`memory_analysis_YYYYMMDD_HHMMSS.txt`

---

## 📊 数据记录表

### 测试数据记录

| 测试阶段 | PSS Total(MB) | Native Heap(MB) | Private Dirty(MB) | 时间戳 | 状态 |
|---------|---------------|-----------------|-------------------|--------|------|
| 基线（冷启动） | | | | | ⏳ |
| 单场景加载 | | | | | ⏳ |
| 双场景并发 | | | | | ⏳ |
| 4 场景并发 | | | | | ⏳ |
| 8 音轨峰值 | | | | | ⏳ |

### 测试结果判定

| 内存峰值 | 判定 | 操作 |
|---------|------|------|
| < 150MB | ✅ 优秀 | 继续优化 |
| 150-180MB | ✅ 良好 | 可以发布 |
| 180-200MB | ⚠️ 临界 | 需要优化 |
| > 200MB | ❌ 失败 | 必须优化 |

---

## 🔍 常见问题诊断

### 问题 1：内存持续不降

**症状**：场景切换后，内存只增不减

**可能原因**：
- Sound 实例未正确释放
- 音频资源未清理

**诊断方法**：
```bash
adb shell dumpsys meminfo com.anonymous.soundtherapyapp | grep -i "sound\|audio"
```

**解决方案**：
检查 `AudioService.ts` 中的 `stop()` 和 `release()` 逻辑

---

### 问题 2：Native Heap 过高

**症状**：Native Heap 占用 > 100MB

**可能原因**：
- 音频缓冲区过大
- 并发音轨过多

**解决方案**：
1. 减小 Sound 实例缓冲区
2. 限制并发音轨数量（最多 4 个）
3. 实现音轨懒加载

---

### 问题 3：Dalvik Heap 过高

**症状**：Dalvik Heap 占用 > 80MB

**可能原因**：
- React 组件未正确卸载
- 音频资源管理逻辑内存泄漏

**解决方案**：
1. 检查组件 componentWillUnmount
2. 添加内存警告处理
3. 优化资源管理逻辑

---

## 🚀 快速开始

### 一键测试命令

```bash
cd /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/scripts

# 1. 启动持续监控
./monitor_memory.sh

# 2. 在设备上触发场景切换

# 3. 观察控制台输出
# 如果看到 "⚠️  警告：内存超过 200MB 阈值！"
# 立即执行：
./analyze_sound_instances.sh
```

---

## 📝 测试报告模板

```markdown
# 内存压力测试报告

**测试日期**: 2026-04-17
**测试设备**: 红米 K80 Pro (Android 15, 16KB 页)
**RN 版本**: 0.81.5
**测试人员**: @sunislee

## 测试结果

✅ 通过 / ❌ 失败

### 内存数据

| 阶段 | PSS Total | 增长 |
|------|-----------|------|
| 基线 | XX MB | - |
| 单场景 | XX MB | +XX MB |
| 4 场景并发 | XX MB | +XX MB |
| 峰值 | XX MB | +XX MB |

## 问题分析

（如有问题，详细描述）

## 优化建议

（如有必要，列出优化方向）

## 附件

- 监控日志：memory_log_YYYYMMDD_HHMMSS.txt
- 分析报告：memory_analysis_YYYYMMDD_HHMMSS.txt
```

---

## 📞 需要帮助？

如果测试过程中遇到问题：

1. 查看详细日志文件
2. 执行 `analyze_sound_instances.sh` 生成分析报告
3. 检查 AudioService.ts 中的 Sound 实例管理逻辑
4. 参考 `MEMORY_TEST_GUIDE.md` 获取详细指导

---

**准备就绪！现在可以开始测试了！** 🚀

执行以下命令开始：
```bash
cd scripts
./monitor_memory.sh
```
