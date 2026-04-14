/**
 * useLFO Hook - 高性能低频振荡器
 * 
 * 特性：
 * 1. 使用 Reanimated 3 的 useFrameCallback 在 UI 线程计算
 * 2. 非对称呼吸曲线（吸气 4:6 呼气），模拟真实人类呼吸
 * 3. 20fps 节流跨桥通信，避免性能压力
 * 4. 支持单素材音量调制 + 双素材 Crossfade 模式
 * 
 * @param config LFO 配置参数
 * @param onVolumeChange 音量变化回调（在 JS 线程执行）
 */

import { useRef, useCallback } from 'react';
import { useFrameCallback, runOnJS } from 'react-native-reanimated';

export interface LFOConfig {
  /** 周期（秒）：默认 10 秒（8-12 秒范围） */
  period?: number;
  
  /** 最小音量：默认 0.75（75%） */
  minVolume?: number;
  
  /** 最大音量：默认 1.0（100%） */
  maxVolume?: number;
  
  /** 吸气/呼气比例：默认 0.4（4:6，吸气占 40%） */
  inhaleRatio?: number;
  
  /** 是否启用 Crossfade 模式（双素材）：默认 false */
  crossfadeMode?: boolean;
}

export interface LFOOutput {
  /** 当前音量值（0.0 - 1.0） */
  volume: number;
  
  /** Crossfade 模式：素材 A 音量（0.0 - 1.0） */
  volA?: number;
  
  /** Crossfade 模式：素材 B 音量（0.0 - 1.0） */
  volB?: number;
  
  /** LFO 相位（0.0 - 1.0），用于可视化 */
  phase: number;
  
  /** 是否正在吸气阶段 */
  isInhaling: boolean;
}

/**
 * 非线性呼吸曲线函数（增强版）
 * 
 * 使用 S-Curve + 幂函数模拟真实呼吸：
 * - 吸气阶段（0 - 0.4）：较快上升，顶部平滑
 * - 呼气阶段（0.4 - 1.0）：较慢下降，底部平滑
 * - 引入 Sigmoid 曲线，让最高点和最低点停留更久（模拟屏息瞬间）
 * - 加入微小频率抖动（±0.5 秒），避免机械感
 * 
 * @param phase 相位（0.0 - 1.0）
 * @param inhaleRatio 吸气比例（默认 0.4）
 * @param jitter 频率抖动（默认 0，范围 -0.05 到 0.05）
 * @returns 归一化的呼吸强度（0.0 - 1.0）
 */
const calculateBreathCurve = (phase: number, inhaleRatio = 0.4, jitter = 0): number => {
  'worklet';
  
  // 应用频率抖动（±0.5 秒 = ±5% 周期）
  const jitteredPhase = phase + jitter;
  const normalizedPhase = ((jitteredPhase % 1.0) + 1.0) % 1.0; // 确保在 0-1 范围
  
  if (normalizedPhase < inhaleRatio) {
    // 吸气阶段（0.0 - 0.4）：S 形上升曲线
    const inhalePhase = normalizedPhase / inhaleRatio; // 0.0 - 1.0
    
    // 使用 S-Curve（Sigmoid 变体）让两端更平滑
    // 公式：3x² - 2x³（smoothstep 函数）
    const smoothedInhale = 3 * inhalePhase * inhalePhase - 2 * inhalePhase * inhalePhase * inhalePhase;
    
    // 再应用幂函数，让顶部更圆润
    const powerAdjusted = Math.pow(smoothedInhale, 0.8);
    
    return powerAdjusted;
  } else {
    // 呼气阶段（0.4 - 1.0）：S 形下降曲线
    const exhalePhase = (normalizedPhase - inhaleRatio) / (1 - inhaleRatio); // 0.0 - 1.0
    
    // 使用 S-Curve 下降
    const smoothedExhale = 1 - (3 * exhalePhase * exhalePhase - 2 * exhalePhase * exhalePhase * exhalePhase);
    
    // 应用幂函数，让底部停留更久（模拟屏息）
    const powerAdjusted = Math.pow(smoothedExhale, 1.2);
    
    return powerAdjusted;
  }
};

/**
 * LFO 计算核心函数（UI 线程执行）
 */
const calculateLFO = (
  elapsedMs: number,
  config: Required<LFOConfig>
): Omit<LFOOutput, 'phase' | 'isInhaling'> => {
  'worklet';
  
  const { period, minVolume, maxVolume, inhaleRatio, crossfadeMode } = config;
  
  // 计算基础相位（0.0 - 1.0）
  const basePhase = (elapsedMs / 1000) / period;
  
  // 加入微小频率抖动（±0.5 秒 = ±5% 周期）
  // 使用简单的正弦抖动，周期约 30 秒，避免重复模式
  const jitter = 0.05 * Math.sin(elapsedMs / 30000);
  
  // 计算呼吸曲线强度（0.0 - 1.0）
  const breathIntensity = calculateBreathCurve(basePhase, inhaleRatio, jitter);
  
  // 映射到目标音量范围
  const volumeRange = maxVolume - minVolume;
  const volume = minVolume + breathIntensity * volumeRange;
  
  if (crossfadeMode) {
    // Crossfade 模式：输出两个互补的音量
    // 吸气时 volA 增大，volB 减小
    // 呼气时 volA 减小，volB 增大
    const volA = minVolume + breathIntensity * volumeRange;
    const volB = maxVolume - breathIntensity * volumeRange;
    
    return { volume: volA, volA, volB };
  } else {
    // 单素材模式：只输出音量
    return { volume };
  }
};

export const useLFO = (
  config: LFOConfig = {},
  onVolumeChange?: (volume: number) => void
) => {
  // 合并配置
  const mergedConfig: Required<LFOConfig> = {
    period: config.period ?? 10,          // 默认 10 秒周期
    minVolume: config.minVolume ?? 0.75,  // 默认 75% 最小音量
    maxVolume: config.maxVolume ?? 1.0,   // 默认 100% 最大音量
    inhaleRatio: config.inhaleRatio ?? 0.4, // 默认 4:6 非对称呼吸
    crossfadeMode: config.crossfadeMode ?? false,
  };
  
  // 记录上次触发回调的时间（用于节流）
  const lastCallbackTime = useRef<number>(0);
  const THROTTLE_MS = 50; // 20fps = 50ms/次
  
  // 记录上次的音量值，避免重复回调
  const lastVolume = useRef<number>(mergedConfig.minVolume);
  
  // 回调函数包装（确保在 JS 线程执行）
  const executeCallback = useCallback((volume: number) => {
    if (onVolumeChange) {
      onVolumeChange(volume);
    }
  }, [onVolumeChange]);
  
  // Frame 回调（在 UI 线程执行）
  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    
    const elapsedMs = frameInfo.timeSinceFirstFrame;
    
    // 计算 LFO 输出
    const lfoOutput = calculateLFO(elapsedMs, mergedConfig);
    
    // 节流跨桥通信（20fps）
    if (onVolumeChange) {
      const currentTime = Date.now();
      if (currentTime - lastCallbackTime.current >= THROTTLE_MS) {
        // 只有音量变化超过阈值才触发回调
        const volumeDelta = Math.abs(lfoOutput.volume - lastVolume.current);
        if (volumeDelta > 0.01) { // 1% 的变化阈值
          lastVolume.current = lfoOutput.volume;
          lastCallbackTime.current = currentTime;
          
          // 在 JS 线程执行回调
          runOnJS(executeCallback)(lfoOutput.volume);
        }
      }
    }
  });
  
  // 启动/停止控制
  const start = useCallback(() => {
    frameCallback.setActive(true);
  }, [frameCallback]);
  
  const stop = useCallback(() => {
    frameCallback.setActive(false);
  }, [frameCallback]);
  
  // 自动启动
  start();
  
  // 返回控制接口和当前状态
  return {
    volume: mergedConfig.minVolume,
    volA: mergedConfig.crossfadeMode ? mergedConfig.minVolume : undefined,
    volB: mergedConfig.crossfadeMode ? mergedConfig.maxVolume : undefined,
    phase: 0,
    isInhaling: true,
    config: mergedConfig,
    start,
    stop,
  };
};

/**
 * 工具函数：生成预设 LFO 配置
 */
export const LFOPresets = {
  /** 深海呼吸：10 秒周期，65%-100% 音量，4:6 非对称呼吸，S-Curve 平滑 */
  deepSeaBreath: (): LFOConfig => ({
    period: 10,
    minVolume: 0.65,      // 从 0.75 改为 0.65，增加动态范围
    maxVolume: 1.0,
    inhaleRatio: 0.4,
    crossfadeMode: false,
  }),
  
  /** 舟上雨：20 秒周期，80%-100% 音量，5:5 对称呼吸，标准正弦波 */
  boatRain: (): LFOConfig => ({
    period: 20,           // 极慢速晃动，消除机械感
    minVolume: 0.8,
    maxVolume: 1.0,
    inhaleRatio: 0.5,     // 对称呼吸
    crossfadeMode: false,
  }),
  
  /** 舟上雨 - 空间平移：20 秒周期，Pan 范围 -0.25 到 0.25，标准正弦波 */
  boatRainPanning: (): LFOConfig => ({
    period: 20,           // 20 秒超慢周期，模拟缓慢晃动
    minVolume: 0.0,       // 不用于音量调制
    maxVolume: 1.0,       // LFO 输出 0-1，映射到 Pan -0.25 到 0.25
    inhaleRatio: 0.5,     // 对称波形
    crossfadeMode: false,
  }),
  
  /** 午后书店 - 空间聚焦：45 秒超长周期，Pan 范围 -0.15 到 0.15，标准正弦波 */
  bookstoreFocus: (): LFOConfig => ({
    period: 45,           // 45 秒极长周期，产生不可察觉的环境变化
    minVolume: 0.0,       // 不用于音量调制
    maxVolume: 1.0,       // LFO 输出 0-1，映射到 Pan -0.15 到 0.15
    inhaleRatio: 0.5,     // 对称正弦波（5:5）
    crossfadeMode: false,
  }),
  
  /** 森林组 - 呼吸：35 秒周期，音量 0.7 ± 8%，模拟雾气吸声 */
  forestBreathing: (): LFOConfig => ({
    period: 35,           // 35 秒周期，模拟森林呼吸
    minVolume: 0.62,      // 0.7 - 8% = 0.62
    maxVolume: 0.78,      // 0.7 + 8% = 0.78
    inhaleRatio: 0.5,     // 对称呼吸
    crossfadeMode: false,
  }),
  
  /** 禅意组 - 共振：60 秒超长周期，音量 ±2%，Pan ±0.05，模拟能量场共振 */
  zenVibration: (): LFOConfig => ({
    period: 60,           // 60 秒超长周期，极慢速共振
    minVolume: 0.0,       // 不用于音量调制（由回调控制）
    maxVolume: 1.0,       // LFO 输出 0-1
    inhaleRatio: 0.5,     // 对称正弦波
    crossfadeMode: false,
  }),
  
  /** 流水组 - 流动：15 秒周期，双正弦波随机算法，音量 ±6% */
  riverFlow: (): LFOConfig => ({
    period: 15,           // 15 秒周期，模拟水流拍击
    minVolume: 0.0,       // 不用于音量调制（由回调控制）
    maxVolume: 1.0,       // LFO 输出 0-1
    inhaleRatio: 0.5,     // 对称波形
    crossfadeMode: false,
  }),
  
  /** 脑波组 - 同步：120 秒超长周期，几乎静止的音量调制，声场极慢漂移 */
  brainwaveSync: (): LFOConfig => ({
    period: 120,          // 120 秒超长周期，几乎静止
    minVolume: 0.0,       // 不用于音量调制
    maxVolume: 1.0,       // LFO 输出 0-1
    inhaleRatio: 0.5,     // 对称正弦波
    crossfadeMode: false,
  }),
  
  /** 森林鸟鸣：12 秒周期，70%-100% 音量，3:7 慢呼快吸 */
  forestBirds: (): LFOConfig => ({
    period: 12,
    minVolume: 0.7,
    maxVolume: 1.0,
    inhaleRatio: 0.3,
    crossfadeMode: false,
  }),
};

export default useLFO;
