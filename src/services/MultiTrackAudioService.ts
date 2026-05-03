/**
 * 多轨并行混音音频服务（方案 A：不使用 Equalizer）
 * 特性：
 * 1. 三轨并行播放：low.mp3, mid.mp3, high.mp3
 * 2. 独立音量控制：每个频段独立 setVolume()
 * 3. 同步播放/暂停/循环
 * 4. 交叉渐变切换
 */

import Sound from 'react-native-sound';

// 初始化音频类别
Sound.setCategory('Playback');
Sound.setMode('Default');

// 三轨播放器实例
interface TrackPlayers {
  low: Sound | null;
  mid: Sound | null;
  high: Sound | null;
}

let players: TrackPlayers = {
  low: null,
  mid: null,
  high: null,
};

// 当前播放的音频 ID
let currentAudioId: string | null = null;

// 是否正在播放
let isPlaying = false;

// 交叉渐变时长
const CROSSFADE_DURATION = 1000;

/**
 * 音频资源配置（分频段版本）
 */
const MULTI_TRACK_AUDIO = {
  balanced: {
    id: 'balanced',
    title: '均衡白噪音',
    tracks: {
      low: 'low_balanced_noise',     // raw/low_balanced_noise.m4a
      mid: 'mid_balanced_noise',     // raw/mid_balanced_noise.m4a
      high: 'high_balanced_noise',   // raw/high_balanced_noise.m4a
    },
  },
  // 后续可以添加更多分频段资源
};

/**
 * 初始化多轨音频
 */
export const initMultiTrackAudio = async () => {
  console.log('[MultiTrack] 初始化多轨音频服务');
};

/**
 * 播放多轨音频
 */
export const playMultiTrackAudio = async (audioId: string) => {
  try {
    console.log('[MultiTrack] 播放音频:', audioId);
    
    // 如果已经是当前音频，跳过
    if (currentAudioId === audioId && isPlaying) {
      console.log('[MultiTrack] 已是当前音频，跳过播放');
      return;
    }
    
    // 先停止当前播放
    await stopMultiTrackAudio();
    
    // 获取音频配置
    const audioConfig = MULTI_TRACK_AUDIO[audioId as keyof typeof MULTI_TRACK_AUDIO];
    if (!audioConfig) {
      console.error('[MultiTrack] 未找到音频配置:', audioId);
      return;
    }
    
    console.log('[MultiTrack] 准备加载三轨音频:', audioConfig.title);
    
    // 并行加载三个音轨
    const loadTrack = (trackName: keyof typeof audioConfig.tracks): Promise<Sound> => {
      return new Promise((resolve, reject) => {
        const resourceName = audioConfig.tracks[trackName];
        console.log(`[MultiTrack] 加载 ${trackName} 轨道：${resourceName}`);
        
        const sound = new Sound(resourceName, Sound.MAIN_BUNDLE, (error) => {
          if (error) {
            console.error(`[MultiTrack] 加载 ${trackName} 失败:`, error);
            reject(error);
          } else {
            console.log(`[MultiTrack] ✅ ${trackName} 轨道加载成功 (duration=${sound.getDuration()}s)`);
            resolve(sound);
          }
        });
      });
    };
    
    // 同时加载三个轨道
    const [lowPlayer, midPlayer, highPlayer] = await Promise.all([
      loadTrack('low'),
      loadTrack('mid'),
      loadTrack('high'),
    ]);
    
    // 保存播放器实例
    players = {
      low: lowPlayer,
      mid: midPlayer,
      high: highPlayer,
    };
    
    // 设置循环播放
    lowPlayer.setNumberOfLoops(-1);
    midPlayer.setNumberOfLoops(-1);
    highPlayer.setNumberOfLoops(-1);
    
    // 初始音量设为 0（淡入准备）
    lowPlayer.setVolume(0);
    midPlayer.setVolume(0);
    highPlayer.setVolume(0);
    
    // 【关键】同时开始播放（确保相位对齐）
    console.log('[MultiTrack] 🚀 三轨同时启动...');
    lowPlayer.play((success) => {
      if (success) {
        console.log('[MultiTrack] low 循环完成，自动重新开始');
      } else {
        console.error('[MultiTrack] low 播放失败');
      }
    });
    midPlayer.play((success) => {
      if (success) {
        console.log('[MultiTrack] mid 循环完成，自动重新开始');
      } else {
        console.error('[MultiTrack] mid 播放失败');
      }
    });
    highPlayer.play((success) => {
      if (success) {
        console.log('[MultiTrack] high 循环完成，自动重新开始');
      } else {
        console.error('[MultiTrack] high 播放失败');
      }
    });
    
    // 执行淡入效果（防止爆音）
    await fadeInMultiTrack();
    
    currentAudioId = audioId;
    isPlaying = true;
    
    console.log('[MultiTrack] ✅ 三轨音频播放成功 - 压力测试准备就绪');
  } catch (error) {
    console.error('[MultiTrack] 播放失败:', error);
  }
};

/**
 * 淡入效果（1 秒，防止爆音）
 */
const fadeInMultiTrack = async () => {
  console.log('[MultiTrack] 📈 开始淡入 (1000ms)');
  
  const duration = CROSSFADE_DURATION;
  const steps = 50; // 降低步数，更平滑
  const volumeStep = 1.0 / steps;
  const interval = duration / steps;
  
  for (let step = 0; step <= steps; step++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    
    const volume = Math.min(1.0, step * volumeStep);
    
    players.low?.setVolume(volume);
    players.mid?.setVolume(volume);
    players.high?.setVolume(volume);
  }
  
  console.log('[MultiTrack] ✅ 淡入完成 - 三轨音量 100%');
};

/**
 * 淡出效果（1 秒，防止爆音）
 */
const fadeOutMultiTrack = async () => {
  console.log('[MultiTrack] 📉 开始淡出 (1000ms)');
  
  const duration = CROSSFADE_DURATION;
  const steps = 50;
  const interval = duration / steps;
  
  for (let step = 0; step <= steps; step++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    
    const volume = Math.max(0, 1.0 - (step * volumeStep));
    
    players.low?.setVolume(volume);
    players.mid?.setVolume(volume);
    players.high?.setVolume(volume);
  }
  
  console.log('[MultiTrack] ✅ 淡出完成 - 三轨音量 0%');
};

/**
 * 停止多轨音频
 */
export const stopMultiTrackAudio = async () => {
  console.log('[MultiTrack] 停止播放');
  
  if (players.low || players.mid || players.high) {
    // 先淡出
    await fadeOutMultiTrack();
    
    // 停止并释放
    players.low?.stop();
    players.mid?.stop();
    players.high?.stop();
    
    players.low?.release();
    players.mid?.release();
    players.high?.release();
    
    players = {
      low: null,
      mid: null,
      high: null,
    };
    
    currentAudioId = null;
    isPlaying = false;
    
    console.log('[MultiTrack] ✅ 已停止播放');
  }
};

/**
 * 设置各频段音量（核心功能）
 */
export const setTrackVolume = (track: 'low' | 'mid' | 'high', volume: number) => {
  const clampedVolume = Math.max(0, Math.min(1.0, volume));
  
  if (track === 'low') {
    players.low?.setVolume(clampedVolume);
    console.log(`[MultiTrack] 🎚️ Low 音量：${(clampedVolume * 100).toFixed(0)}%`);
  } else if (track === 'mid') {
    players.mid?.setVolume(clampedVolume);
    console.log(`[MultiTrack] 🎚️ Mid 音量：${(clampedVolume * 100).toFixed(0)}%`);
  } else if (track === 'high') {
    players.high?.setVolume(clampedVolume);
    console.log(`[MultiTrack] 🎚️ High 音量：${(clampedVolume * 100).toFixed(0)}%`);
  }
  
  // 【压力测试】记录其他轨道的音量状态
  if (track === 'low') {
    console.log(`[MultiTrack]   - Mid 保持：${players.mid ? '✅' : '❌'}, High 保持：${players.high ? '✅' : '❌'}`);
  } else if (track === 'mid') {
    console.log(`[MultiTrack]   - Low 保持：${players.low ? '✅' : '❌'}, High 保持：${players.high ? '✅' : '❌'}`);
  } else if (track === 'high') {
    console.log(`[MultiTrack]   - Low 保持：${players.low ? '✅' : '❌'}, Mid 保持：${players.mid ? '✅' : '❌'}`);
  }
};

/**
 * 批量设置三轨音量
 */
export const setAllTrackVolumes = (volumes: { low?: number; mid?: number; high?: number }) => {
  if (volumes.low !== undefined) setTrackVolume('low', volumes.low);
  if (volumes.mid !== undefined) setTrackVolume('mid', volumes.mid);
  if (volumes.high !== undefined) setTrackVolume('high', volumes.high);
};

/**
 * 【虚拟 8 段 EQ】将 8 段滑块映射到 3 个音轨
 * 映射逻辑：
 * - 第 1-2 段 (60Hz, 150Hz) → 控制 Low 轨道
 * - 第 3-6 段 (400Hz-2.4kHz) → 控制 Mid 轨道
 * - 第 7-8 段 (4.8kHz, 9.6kHz) → 控制 High 轨道
 */
export const set8BandEQ = (gains: number[]) => {
  if (gains.length !== 8) {
    console.error('[MultiTrack] ❌ 8 段 EQ 参数错误，需要 8 个值');
    return;
  }
  
  // 【低频带】第 1-2 段 (索引 0-1) → Low 轨道
  // 使用加权平均，让两段平滑过渡
  const lowGain = (gains[0] + gains[1]) / 2;
  
  // 【中频带】第 3-6 段 (索引 2-5) → Mid 轨道
  // 使用 4 段的平均值
  const midGain = (gains[2] + gains[3] + gains[4] + gains[5]) / 4;
  
  // 【高频带】第 7-8 段 (索引 6-7) → High 轨道
  const highGain = (gains[6] + gains[7]) / 2;
  
  // 将增益 (-1.0 ~ 1.0) 映射到音量 (0.0 ~ 1.0)
  // 0dB (gain=0) → 100% 音量
  // -12dB (gain=-1.0) → 0% 音量
  // +12dB (gain=1.0) → 100% 音量 (不放大，只衰减)
  const gainToVolume = (gain: number) => {
    // 将 [-1.0, 1.0] 映射到 [0.0, 1.0]
    // gain = -1.0 → volume = 0.0
    // gain = 0.0 → volume = 0.5
    // gain = 1.0 → volume = 1.0
    return Math.max(0, Math.min(1.0, (gain + 1.0) / 2.0));
  };
  
  const lowVolume = gainToVolume(lowGain);
  const midVolume = gainToVolume(midGain);
  const highVolume = gainToVolume(highGain);
  
  console.log('[MultiTrack] 🎚️ 虚拟 8 段 EQ 映射:');
  console.log(`   Low (0-300Hz):  ${lowGain.toFixed(2)} → ${(lowVolume * 100).toFixed(0)}%`);
  console.log(`   Mid (300-3k):   ${midGain.toFixed(2)} → ${(midVolume * 100).toFixed(0)}%`);
  console.log(`   High (3k-20k):  ${highGain.toFixed(2)} → ${(highVolume * 100).toFixed(0)}%`);
  
  // 应用到三轨
  setAllTrackVolumes({
    low: lowVolume,
    mid: midVolume,
    high: highVolume,
  });
};
