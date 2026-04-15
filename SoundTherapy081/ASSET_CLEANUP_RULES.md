# 音频资源清理保护规则

## ⚠️ 重要警告：禁止清理降噪资源

### 受保护的降噪资源（禁止删除）

#### 1. **android/app/src/main/res/raw/** 目录
以下文件 **绝对禁止删除**，因为降噪功能需要 8 轨同步播放：

**均衡降噪（Balanced Noise）- 8 轨：**
- `balanced_noise_track_1.mp3` ~ `balanced_noise_track_8.mp3` (每轨 4.2MB)

**交通降噪（Traffic Noise）- 8 轨：**
- `traffic_noise_track_1.mp3` ~ `traffic_noise_track_8.mp3` (每轨 4.1MB)

**人声降噪（Crowd Noise）- 8 轨：**
- `crowd_noise_track_1.mp3` ~ `crowd_noise_track_8.mp3` (每轨 4.1MB)

**风声降噪（Wind Noise）- 8 轨：**
- `wind_noise_track_1.mp3` ~ `wind_noise_track_8.mp3` (每轨 519KB)

**总计：32 个文件，约 104MB**

#### 2. **src/assets/audio/noise_cancellation/** 目录
以下文件 **禁止删除**：
- `balanced_noise.m4a`
- `traffic_noise.wav`
- `crowd_noise.wav`
- `wind_noise.m4a`

### 可清理的资源（仅用于测试）

#### 普通场景音频（可删除，通过远程下载恢复）
- `android/app/src/main/res/raw/` 以外的场景音频
- 远程 URL 已配置的资源（通过 `audioAssets.ts` 管理）

### 技术原因

**为什么降噪资源必须本地化？**

1. **多轨同步播放**：降噪功能使用 `MultiTrackAudioService` 同时播放 3 个音轨（低/中/高频），需要精确的相位对齐
2. **实时性要求**：本地读取延迟 < 10ms，而下载可能受网络影响
3. **8 轨循环**：每种降噪类型有 8 个独立音轨，下载会显著增加首次启动时间
4. **稳定性**：本地资源不受网络波动、服务器可用性影响

### 清理脚本规范

**正确的清理逻辑：**

```bash
#!/bin/bash

# ❌ 错误：删除所有 raw 资源
# rm -rf android/app/src/main/res/raw/*.mp3

# ✅ 正确：保护降噪资源
cd android/app/src/main/res/raw/

# 保留降噪资源（32 个轨道文件）
# 只删除其他非关键资源

# 如果要清理，只能删除远程已配置的场景资源
# 并且必须确保 DownloadService 可用
```

### 恢复方法

如果误删降噪资源，使用 Git 恢复：

```bash
# 恢复 raw 目录
git checkout SoundTherapy081/android/app/src/main/res/raw/

# 恢复 src/assets/audio 目录
git checkout SoundTherapy081/src/assets/audio/
```

### 验证清单

清理后必须验证：
- [ ] raw 目录包含 32 个降噪轨道文件
- [ ] `noiseCancellationAudio.ts` 引用的资源存在
- [ ] `MultiTrackAudioService.ts` 能正常加载轨道
- [ ] 降噪功能测试通过

---

**最后更新**: 2024-04-15
**执行人**: AI Assistant
