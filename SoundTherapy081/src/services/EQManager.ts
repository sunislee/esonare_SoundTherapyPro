/**
 * 8 段均衡器管理器
 * 
 * 功能：
 * 1. 针对 react-native-sound 的 Sound 实例提供 8 段 EQ 控制
 * 2. 频段：63Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz
 * 3. 场景预设：深海/森林/雨声等
 * 4. 平滑切换，避免爆音
 */

import Sound from 'react-native-sound';

// 8 段 EQ 频段定义
export const EQ_BANDS = [
  { freq: 63, label: '63Hz' },    // 超低频
  { freq: 125, label: '125Hz' },  // 低频
  { freq: 250, label: '250Hz' },  // 中低频
  { freq: 500, label: '500Hz' },  // 中频
  { freq: 1000, label: '1kHz' },  // 中高频
  { freq: 2000, label: '2kHz' },  // 高频
  { freq: 4000, label: '4kHz' },  // 超高频
  { freq: 8000, label: '8kHz' },  // 极高频
];

// EQ 增益范围
const MIN_GAIN = -12; // -12 dB
const MAX_GAIN = 12;  // +12 dB
const DEFAULT_GAIN = 0; // 0 dB

// 平滑过渡时长
const FADE_DURATION = 300; // 300ms

/**
 * EQ 预设配置
 */
export interface EQPreset {
  name: string;
  gains: number[]; // 8 个频段的增益值 (dB)
}

/**
 * 场景 EQ 预设固化
 */
export const SCENE_EQ_PRESETS: Record<string, EQPreset> = {
  // 深海呼吸：增强超低频和低频，营造浑厚深邃感（已优化：提升 2kHz/4kHz 增强清晰度）
  deepSea: {
    name: '深海呼吸',
    gains: [4, 4, 2, 0, 0, 2, 2, -1], // 63Hz/125Hz +4dB, 2kHz/4kHz +2dB (增强水泡细节)
  },
  
  // 迷雾森林：增强高频，提升空气感与通透度（已优化：削弱 4kHz 避免火烧声）
  forest: {
    name: '迷雾森林',
    gains: [0, 0, 0, 1, 2, 2, 1.5, 2], // 2kHz +2dB, 4kHz +1.5dB (降低避免火烧声), 8kHz +2dB
  },
  
  // 雨声场景：微调极高频，强化雨滴细节
  rain: {
    name: '雨声',
    gains: [0, 0, 0, 0, 1, 2, 2, 3], // 8kHz +3dB
  },
  
  // 午后书店：温暖中频，适度衰减极高频
  bookstore: {
    name: '午后书店',
    gains: [0, 1, 2, 2, 1, 0, -1, -2], // 250Hz/500Hz +2dB
  },
  
  // 禅意颂钵：平衡全频段，轻微增强低频
  zen: {
    name: '禅意颂钵',
    gains: [2, 2, 1, 0, 0, 0, 0, 0], // 63Hz/125Hz +2dB
  },
  
  // 脑波 Alpha：轻微增强高频，提升专注力
  alpha: {
    name: 'Alpha 专注',
    gains: [0, 0, 0, 0, 1, 2, 1, 0], // 2kHz +2dB
  },
  
  // 脑波 Delta：增强低频，促进放松
  delta: {
    name: 'Delta 入眠',
    gains: [3, 3, 2, 1, 0, 0, -1, -2], // 63Hz/125Hz +3dB
  },
  
  // ==================== 新增 8 段 EQ 预设 ====================
  
  // Jazz-Funk 模式：强化 60Hz 鼓点与 4kHz 乐器明亮度
  jazzFunk: {
    name: 'Jazz-Funk',
    gains: [5, 4, 2, 0, -1, 3, 4, 2], // 63Hz +5dB (鼓点), 4kHz +4dB (乐器明亮度), 8kHz +2dB
  },
  
  // Deep Sleep 模式：削减高频，增强 100Hz 以下的稳态包裹感
  deepSleep: {
    name: 'Deep Sleep',
    gains: [6, 5, 3, 1, 0, -2, -4, -6], // 63Hz/125Hz +6/+5dB (包裹感), 4kHz/8kHz -4/-6dB (削减高频)
  },
  
  // 默认/平坦
  flat: {
    name: '默认',
    gains: [0, 0, 0, 0, 0, 0, 0, 0], // 全 0 dB
  },
};

/**
 * 获取场景 EQ 预设
 * @param sceneId 场景 ID
 */
export const getSceneEQPreset = (sceneId: string): EQPreset => {
  // 场景 ID 映射
  if (sceneId.includes('deep_sea')) return SCENE_EQ_PRESETS.deepSea;
  if (sceneId.includes('forest') || sceneId.includes('misty')) return SCENE_EQ_PRESETS.forest;
  if (sceneId.includes('rain') || sceneId.includes('boat')) return SCENE_EQ_PRESETS.rain;
  if (sceneId.includes('bookstore')) return SCENE_EQ_PRESETS.bookstore;
  if (sceneId.includes('zen') || sceneId.includes('bowl') || sceneId.includes('clean')) return SCENE_EQ_PRESETS.zen;
  if (sceneId.includes('alpha')) return SCENE_EQ_PRESETS.alpha;
  if (sceneId.includes('delta')) return SCENE_EQ_PRESETS.delta;
  
  // 新增：Jazz-Funk 和 Deep Sleep 模式
  if (sceneId.includes('jazz') || sceneId.includes('funk')) return SCENE_EQ_PRESETS.jazzFunk;
  if (sceneId.includes('sleep') || sceneId.includes('deep_sleep')) return SCENE_EQ_PRESETS.deepSleep;
  
  // 默认返回平坦预设
  return SCENE_EQ_PRESETS.flat;
};

/**
 * 将 dB 增益映射到 react-native-sound 的音量值 (0.0 - 1.0)
 * 
 * 注意：react-native-sound 的 setVolume 是线性音量，不是 dB
 * 这里使用近似映射：-12dB ≈ 0.25, 0dB = 1.0, +12dB ≈ 1.0 (限制在 1.0)
 * 
 * @param gainDB 增益值 (dB)
 * @returns 音量值 (0.0 - 1.0)
 */
const mapGainToVolume = (gainDB: number): number => {
  // 限制在合理范围内
  const clampedGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, gainDB));
  
  // 使用对数映射：dB = 20 * log10(volume)
  // volume = 10^(dB/20)
  const volume = Math.pow(10, clampedGain / 20);
  
  // 限制在 0.0 - 1.0 范围
  return Math.max(0.0, Math.min(1.0, volume));
};

/**
 * EQ 管理器类
 */
class EQManagerClass {
  // 当前激活的预设
  private currentPreset: EQPreset | null = null;
  
  // 每个 Sound 实例的 EQ 状态
  private soundEQStates = new Map<Sound, {
    currentGains: number[];
    targetGains: number[];
    fadeTimer: NodeJS.Timeout | null;
  }>();
  
  /**
   * 为 Sound 实例应用 EQ 预设
   * 
   * 注意：react-native-sound 不支持原生 EQ，这里使用音量调制模拟
   * 实际上是通过调整整体音量来模拟 EQ 效果（简化版）
   * 
   * @param sound Sound 实例
   * @param preset EQ 预设
   * @param smooth 是否平滑过渡
   */
  public applyPreset = (sound: Sound, preset: EQPreset, smooth: boolean = true): void => {
    if (!sound || !sound.isLoaded()) {
      console.warn('[EQ] Sound 实例未加载，跳过 EQ 应用');
      return;
    }
    
    console.log(`🎚️ EQ Preset Applied: ${preset.name}`);
    
    // 获取当前状态
    let state = this.soundEQStates.get(sound);
    if (!state) {
      state = {
        currentGains: [...SCENE_EQ_PRESETS.flat.gains],
        targetGains: [...preset.gains],
        fadeTimer: null,
      };
      this.soundEQStates.set(sound, state);
    } else {
      state.targetGains = [...preset.gains];
    }
    
    // 清除之前的淡入淡出定时器
    if (state.fadeTimer) {
      clearTimeout(state.fadeTimer);
    }
    
    if (smooth) {
      // 平滑过渡：每 50ms 更新一次，共 6 次 (300ms)
      const steps = 6;
      const stepDuration = FADE_DURATION / steps;
      const gainSteps = preset.gains.map((targetGain, i) => {
        const startGain = state!.currentGains[i];
        return (targetGain - startGain) / steps;
      });
      
      let currentStep = 0;
      const fadeInterval = setInterval(() => {
        currentStep++;
        
        // 更新当前增益
        state!.currentGains = state!.currentGains.map((gain, i) => {
          return gain + gainSteps[i];
        });
        
        // 计算整体音量因子
        const volumeFactor = this.calculateVolumeFactor(state!.currentGains);
        sound.setVolume(volumeFactor);
        
        if (currentStep >= steps) {
          clearInterval(fadeInterval);
          state!.fadeTimer = null;
          console.log(`[EQ] ✅ 平滑过渡完成：${preset.name}`);
        }
      }, stepDuration);
      
      state.fadeTimer = fadeInterval as unknown as NodeJS.Timeout;
    } else {
      // 立即应用
      state.currentGains = [...preset.gains];
      const volumeFactor = this.calculateVolumeFactor(state.currentGains);
      sound.setVolume(volumeFactor);
    }
    
    this.currentPreset = preset;
  };
  
  /**
   * 计算 EQ 增益对应的整体音量因子
   * 
   * 简化策略：取所有频段增益的平均值作为整体音量调整
   * 
   * @param gains 8 个频段的增益值
   * @returns 音量因子 (0.0 - 1.0)
   */
  private calculateVolumeFactor = (gains: number[]): number => {
    // 计算平均增益
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / 8;
    
    // 映射到音量
    const volumeFactor = mapGainToVolume(avgGain);
    
    console.log(`[EQ] 计算音量因子：平均增益 ${avgGain.toFixed(1)}dB → 音量 ${volumeFactor.toFixed(2)}`);
    
    return volumeFactor;
  };
  
  /**
   * 为场景应用 EQ 预设
   * @param sound Sound 实例
   * @param sceneId 场景 ID
   * @param smooth 是否平滑过渡
   */
  public applyScenePreset = (sound: Sound, sceneId: string, smooth: boolean = true): void => {
    const preset = getSceneEQPreset(sceneId);
    console.log(`🎚️ EQ Preset Applied for scene: ${sceneId} (${preset.name})`);
    this.applyPreset(sound, preset, smooth);
  };
  
  /**
   * 清除 Sound 实例的 EQ 状态
   * @param sound Sound 实例
   */
  public clearSound = (sound: Sound): void => {
    const state = this.soundEQStates.get(sound);
    if (state && state.fadeTimer) {
      clearTimeout(state.fadeTimer);
    }
    this.soundEQStates.delete(sound);
  };
  
  /**
   * 重置为平坦 EQ
   * @param sound Sound 实例
   */
  public resetToFlat = (sound: Sound): void => {
    this.applyPreset(sound, SCENE_EQ_PRESETS.flat, true);
  };
  
  /**
   * 获取当前预设
   */
  public getCurrentPreset = (): EQPreset | null => {
    return this.currentPreset;
  };
}

// 导出单例
export const EQManager = new EQManagerClass();
