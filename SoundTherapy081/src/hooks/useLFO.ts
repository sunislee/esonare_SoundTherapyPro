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
 * 非线性呼吸曲线函数
 * 
 * 使用改进的三角波模拟真实呼吸：
 * - 吸气阶段（0 - 0.4）：较快上升（40% 时间）
 * - 呼气阶段（0.4 - 1.0）：较慢下降（60% 时间）
 * - 使用正弦函数平滑过渡，避免线性突变
 * 
 * @param phase 相位（0.0 - 1.0）
 * @param inhaleRatio 吸气比例（默认 0.4）
 * @returns 归一化的呼吸强度（0.0 - 1.0）
 */
const calculateBreathCurve = (phase: number, inhaleRatio = 0.4): number => {
  'worklet';
  
  // 归一化相位到 0-1 范围
  const normalizedPhase = phase % 1.0;
  
  if (normalizedPhase < inhaleRatio) {
    // 吸气阶段（0.0 - 0.4）：从 0 上升到 1
    // 使用正弦函数的上升段，更自然
    const inhalePhase = normalizedPhase / inhaleRatio; // 0.0 - 1.0
    return Math.sin(inhalePhase * Math.PI / 2);
  } else {
    // 呼气阶段（0.4 - 1.0）：从 1 下降到 0
    // 使用正弦函数的下降段，更缓慢
    const exhalePhase = (normalizedPhase - inhaleRatio) / (1 - inhaleRatio); // 0.0 - 1.0
    return Math.cos(exhalePhase * Math.PI / 2);
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
  
  // 计算当前相位（0.0 - 1.0）
  const phase = (elapsedMs / 1000) / period;
  
  // 计算呼吸曲线强度（0.0 - 1.0）
  const breathIntensity = calculateBreathCurve(phase, inhaleRatio);
  
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
  /** 深海呼吸：10 秒周期，75%-100% 音量，4:6 非对称呼吸 */
  deepSeaBreath: (): LFOConfig => ({
    period: 10,
    minVolume: 0.75,
    maxVolume: 1.0,
    inhaleRatio: 0.4,
    crossfadeMode: false,
  }),
  
  /** 舟上雨：8 秒周期，80%-100% 音量，5:5 对称呼吸 */
  boatRain: (): LFOConfig => ({
    period: 8,
    minVolume: 0.8,
    maxVolume: 1.0,
    inhaleRatio: 0.5,
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
