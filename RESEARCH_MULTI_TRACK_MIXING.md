# 多轨道动态混音引擎 - 技术预研报告

## 📋 任务目标
实现"自动滑块"逻辑，同时低延迟播放 3-5 个音轨，并独立控制每个音轨的 Gain（音量）。

## 🔍 现有依赖分析

### 已安装的音频库：
1. **react-native-video@6.19.1** ✅
2. **react-native-sound@0.13.0** ✅ (已用于 SFXPlayer)
3. **react-native-track-player@4.1.2** ✅ (已用于主音频服务)
4. **expo-av** ❌ (未在 0.81.5 项目中安装)

---

## 🎯 方案对比

### 方案 1：react-native-video（推荐 ⭐⭐⭐⭐⭐）

#### 优势：
- ✅ **已安装**，无需新增依赖
- ✅ **原生层强大**：基于 AVPlayer (iOS) / ExoPlayer (Android)
- ✅ **低延迟**：原生解码，硬件加速
- ✅ **独立音量控制**：每个实例独立控制 volume
- ✅ **支持本地资源**：可播放 `res/raw` 中的音频
- ✅ **后台播放**：系统级音频焦点管理
- ✅ **RN 0.81 兼容**：已验证可用

#### 实现方式：
```typescript
import Video, { VideoRef } from 'react-native-video';

// 创建多个音频轨道实例
const tracks = [
  useRef<VideoRef>(null),
  useRef<VideoRef>(null),
  useRef<VideoRef>(null),
];

// 独立控制每个轨道的音量
tracks[0].current?.setVolume(0.8); // 主轨道 80%
tracks[1].current?.setVolume(0.5); // 叠加轨道 50%
tracks[2].current?.setVolume(0.3); // 环境音 30%

// 播放本地资源
<Video
  ref={track1Ref}
  source={{ uri: 'res:/wind_noise' }} // Android: res/raw/wind_noise.m4a
  repeat={true}
  volume={0.8}
  muted={false}
  playInBackground={true}
  paused={false}
/>
```

#### 技术要点：
- **Android**: 使用 `res:///resource_name` 访问 `res/raw` 资源
- **iOS**: 需要预加载到临时目录，使用 `file://` 路径
- **延迟**: <50ms（原生解码）
- **并发**: 支持 5-8 个实例同时播放

---

### 方案 2：react-native-sound（备选 ⭐⭐⭐⭐）

#### 优势：
- ✅ **已安装**，SFXPlayer 已验证可用
- ✅ **简单 API**：适合短音效
- ✅ **独立音量控制**：每个 Sound 实例独立控制
- ✅ **低延迟**：直接基于 AVAudioPlayer (iOS) / SoundPool (Android)

#### 劣势：
- ⚠️ **内存限制**：SoundPool 限制 25MB，不适合长音频
- ⚠️ **手动管理**：需要手动 preload 和 release
- ⚠️ **不支持流式**：必须完整加载到内存

#### 实现方式：
```typescript
import Sound from 'react-native-sound';

// 预加载多个音轨
Sound.setCategory('Playback');

const track1 = new Sound('wind_noise.m4a', Sound.MAIN_BUNDLE, (error) => {
  if (!error) {
    track1.setVolume(0.8);
    track1.setLoops(-1); // 无限循环
    track1.play();
  }
});

const track2 = new Sound('crowd_noise.wav', Sound.MAIN_BUNDLE, (error) => {
  if (!error) {
    track2.setVolume(0.5);
    track2.play();
  }
});

// 动态调整音量
track1.setVolume(0.6);
track2.setVolume(0.7);
```

---

### 方案 3：react-native-track-player（不推荐 ⭐⭐）

#### 优势：
- ✅ 已用于主音频服务
- ✅ 支持队列播放
- ✅ 后台播放完善

#### 劣势：
- ⚠️ **单实例限制**：同一时间只能播放一个 Track
- ⚠️ **混音复杂**：需要创建多个 Player 实例
- ⚠️ **资源占用高**：每个 Player 都是独立服务

---

### 方案 4：Native Module + AVFoundation/AudioTrack（终极方案 ⭐⭐⭐⭐⭐）

#### 优势：
- ✅ **最低延迟**：<10ms
- ✅ **专业混音**：支持 EQ、Pan、Effects
- ✅ **无限轨道**：受限于 CPU，不受框架限制
- ✅ **完全控制**：原生层实现混音逻辑

#### 实现方式：
```kotlin
// Android: 使用 AudioTrack + MediaMuxer
class AudioMixerModule {
    private val tracks = mutableListOf<AudioTrack>()
    
    fun addTrack(resourceId: Int, volume: Float) {
        val audioTrack = createAudioTrack(resourceId, volume)
        tracks.add(audioTrack)
    }
    
    fun setTrackVolume(index: Int, volume: Float) {
        tracks[index].setVolume(volume)
    }
}
```

```swift
// iOS: 使用 AVAudioEngine + AVAudioMixerNode
class AudioMixerModule {
    let engine = AVAudioEngine()
    let mixer = AVAudioMixerNode()
    
    func addTrack(url: URL, volume: Float) {
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: mixer, format: nil)
        player.volume = volume
        player.play()
    }
}
```

---

## 🚀 推荐实施方案

### 阶段 1：快速原型（使用 react-native-video）
**时间**: 2-3 小时
**目标**: 验证 3-5 轨道同时播放

```typescript
// 创建混音引擎核心类
class MultiTrackMixer {
  private tracks: VideoRef[] = [];
  private trackVolumes: number[] = [];
  
  async addTrack(resourceId: string, initialVolume: number = 1.0): Promise<void> {
    const ref = createRef<VideoRef>();
    this.tracks.push(ref);
    this.trackVolumes.push(initialVolume);
    
    // 渲染隐藏的 Video 组件
    // 使用 res:/// 访问原生资源
  }
  
  setTrackVolume(index: number, volume: number): void {
    this.tracks[index].current?.setVolume(volume);
  }
  
  async playAll(): Promise<void> {
    this.tracks.forEach(ref => ref.current?.play());
  }
  
  async pauseAll(): Promise<void> {
    this.tracks.forEach(ref => ref.current?.pause());
  }
}
```

### 阶段 2：自动滑块逻辑
**时间**: 3-4 小时
**目标**: 根据场景自动调整各轨道音量

```typescript
interface TrackPreset {
  windVolume: number;      // 风声音轨
  crowdVolume: number;     // 人声轨
  trafficVolume: number;   // 交通轨
  rainVolume: number;      // 雨声轨
  birdVolume: number;      // 鸟鸣轨
}

const SCENE_PRESETS: Record<string, TrackPreset> = {
  'wind': { windVolume: 0.8, crowdVolume: 0.2, trafficVolume: 0, rainVolume: 0, birdVolume: 0.3 },
  'crowd': { windVolume: 0.1, crowdVolume: 0.9, trafficVolume: 0.3, rainVolume: 0, birdVolume: 0 },
  'traffic': { windVolume: 0, crowdVolume: 0.3, trafficVolume: 1.0, rainVolume: 0, birdVolume: 0 },
  'rain': { windVolume: 0.3, crowdVolume: 0, trafficVolume: 0, rainVolume: 0.9, birdVolume: 0 },
};

// 自动滑块逻辑
function applyScenePreset(sceneType: string) {
  const preset = SCENE_PRESETS[sceneType];
  mixer.setTrackVolume(0, preset.windVolume);
  mixer.setTrackVolume(1, preset.crowdVolume);
  mixer.setTrackVolume(2, preset.trafficVolume);
  // ...
}
```

### 阶段 3：平滑过渡（Crossfade）
**时间**: 2-3 小时
**目标**: 音量变化时使用缓动曲线，避免突变

```typescript
import { Easing } from 'react-native';

function crossfadeTrack(trackIndex: number, fromVolume: number, toVolume: number, duration: number = 1000) {
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用缓动曲线
    const easedProgress = Easing.inOut(Easing.ease)(progress);
    const currentVolume = fromVolume + (toVolume - fromVolume) * easedProgress;
    
    mixer.setTrackVolume(trackIndex, currentVolume);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
}
```

---

## 📊 性能对比

| 方案 | 延迟 | 内存占用 | CPU 占用 | 最大轨道数 | 实现难度 |
|------|------|----------|---------|-----------|---------|
| react-native-video | <50ms | 中 | 低 | 5-8 | ⭐⭐ |
| react-native-sound | <20ms | 高 | 低 | 3-5 | ⭐ |
| Native Module | <10ms | 低 | 中 | 无限 | ⭐⭐⭐⭐⭐ |
| track-player | <100ms | 高 | 中 | 2-3 | ⭐⭐⭐ |

---

## 🔧 技术风险与解决方案

### 风险 1：Android 音频焦点冲突
**问题**: 多个 Video 实例可能争夺音频焦点

**解决**: 
```typescript
// 统一使用同一个 Audio Session
import { AudioSettings } from 'react-native-video';

AudioSettings.setActive(true);
AudioSettings.setCategory('playback');
AudioSettings.setMode('default');
```

### 风险 2：iOS 内存警告
**问题**: 5 个 Video 实例可能触发内存警告

**解决**:
```typescript
// 使用隐藏的 Video 组件，减少渲染开销
<Video
  ref={ref}
  style={{ width: 1, height: 1, opacity: 0 }} // 完全隐藏
  source={...}
  repeat={true}
  playInBackground={true}
  ignoreSilentSwitch="ignore"
/>
```

### 风险 3：音频不同步
**问题**: 多个轨道启动时间不一致

**解决**:
```typescript
// 预加载所有轨道
await Promise.all(tracks.map(track => track.loadAsync()));

// 同时启动
await Promise.all(tracks.map(track => track.playAsync()));
```

---

## 📝 明日行动计划

### 上午（9:00-12:00）：
1. ✅ 创建 `MultiTrackMixer` 核心类
2. ✅ 实现 5 个轨道同时播放
3. ✅ 测试独立音量控制
4. ✅ 验证延迟和同步性

### 下午（14:00-18:00）：
1. ✅ 实现"自动滑块"逻辑
2. ✅ 绑定场景识别结果
3. ✅ 添加 Crossfade 平滑过渡
4. ✅ UI 联调（5 个滑块 + 场景切换）

### 晚上（可选）：
- 🔧 性能优化（内存、CPU）
- 🔧 异常处理（音频焦点丢失、资源加载失败）

---

## 🎯 最终目标

**输入**: 场景识别结果（Wind/Crowd/Traffic）
**输出**: 5 个轨道自动调整音量，创造沉浸式声景

**示例场景**:
```
识别到"Crowd" → 
  主轨道：人群嘈杂声 80%
  叠加：远处交通声 30%
  叠加：微风声 10%
  叠加：鸟鸣 0%
  叠加：雨声 0%
  
识别到"Wind" →
  主轨道：风声 80%
  叠加：树叶沙沙声 50%
  叠加：远处鸟鸣 30%
  叠加：人群 0%
  叠加：交通 0%
```

---

## 📚 参考资料

- [react-native-video 文档](https://github.com/react-native-video/react-native-video)
- [react-native-sound 文档](https://github.com/zmxv/react-native-sound)
- [Android AudioTrack 官方文档](https://developer.android.com/reference/android/media/AudioTrack)
- [iOS AVAudioEngine 官方文档](https://developer.apple.com/documentation/avfaudio/avaudioengine)

---

**结论**: 使用 **react-native-video** 作为核心引擎，快速实现原型，验证可行性后再考虑是否需要原生优化。
