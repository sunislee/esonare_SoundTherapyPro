/**
 * 降噪模块音频服务
 * 特性：
 * 1. 无缝循环播放 (Seamless Loop)
 * 2. 1 秒交叉渐变 (Cross-fade) - 防止"封面图翻转"Bug
 * 3. 独立音频通道（不影响主冥想音乐）
 * 4. 生命周期管理（Modal 关闭后自动停止）
 * 5. 16KB Page Size 合规
 * 6. **多轨并行混音** (方案 A：三轨分频段播放)
 */

import Sound from 'react-native-sound';
import { NativeModules } from 'react-native';
import { NOISE_CANCELLATION_AUDIO, getNoiseCancellationAudio } from '../constants/noiseCancellationAudio';
import { play8TrackAudio, stop8TrackAudio, warmupAudio, setLoadingProgressCallback } from './8TrackAudioService';

// 初始化音频类别（Android 必需）
Sound.setCategory('Playback');
Sound.setMode('Default');

// 音频播放器实例（独立于主播放器）- 单例
let noisePlayer: Sound | null = null;

// 当前播放的降噪模式 ID
let currentModeId: string | null = null;

// 是否正在淡出
let isFadingOut = false;

// 淡入定时器引用（用于清理）
let fadeInInterval: NodeJS.Timeout | null = null;

// 淡出定时器引用（用于清理）
let fadeOutInterval: NodeJS.Timeout | null = null;

// 交叉渐变时长：1 秒（防止切换突兀）
const CROSSFADE_DURATION = 1000; // 1000ms = 1s

// 初始化音频（预加载）
export const initNoiseAudio = async () => {
  try {
    // 预加载所有降噪音频资源
    for (const audio of NOISE_CANCELLATION_AUDIO) {
      // 资源会在首次播放时自动加载
      console.log('[NoiseAudio] 预加载资源:', audio.id);
    }
    
    // 【多轨模式】初始化多轨音频服务
    console.log('[NoiseAudio] 🎵 初始化多轨音频服务');
  } catch (error) {
    console.error('[NoiseAudio] 初始化失败:', error);
  }
};

// 播放降噪音频（带淡入效果）
export const playNoiseAudio = async (modeId: string) => {
  try {
    console.log('[NoiseAudio] 播放模式:', modeId);
    
    // 如果已经是当前模式，跳过
    if (currentModeId === modeId) {
      console.log('[NoiseAudio] 已是当前模式，跳过播放');
      return;
    }
    
    // 先彻底停止当前音频（如果有）- 1 秒交叉渐变
    if (currentModeId) {
      console.log('[NoiseAudio] 切换到新模式，执行 1 秒交叉渐变');
      await fadeOutAudio();
    }
    
    // 【8 轨模式】根据 modeId 播放对应的 8 轨音频
    // modeId 映射：'noise_wind' -> 'wind_noise', 'noise_traffic' -> 'traffic_noise', etc.
    let audioGroupId = 'balanced_noise'; // 默认
    
    if (modeId === 'noise_wind') {
      audioGroupId = 'wind_noise';
    } else if (modeId === 'noise_traffic') {
      audioGroupId = 'traffic_noise';
    } else if (modeId === 'noise_crowd') {
      audioGroupId = 'crowd_noise';
    } else if (modeId === 'noise_balanced' || modeId === 'balanced') {
      audioGroupId = 'balanced_noise';
    }
    
    console.log('[NoiseAudio] 🎚️ 使用 8 轨混音模式播放:', audioGroupId);
    await play8TrackAudio(audioGroupId);
    
    currentModeId = modeId;
    
    console.log('[NoiseAudio] ✅ 8 轨音频播放成功');
  } catch (error) {
    console.error('[NoiseAudio] 播放失败:', error);
  }
};

// 淡入效果（1 秒）
const fadeInAudio = () => {
  if (!noisePlayer) return;
  
  // 清理之前的淡入定时器（防止冲突）
  if (fadeInInterval) {
    clearInterval(fadeInInterval);
    fadeInInterval = null;
  }
  
  isFadingOut = false;
  const duration = CROSSFADE_DURATION; // 1000ms = 1s
  const steps = 100; // 100 步，每步 10ms（更精细）
  const volumeStep = 1.0 / steps;
  const interval = duration / steps;
  
  let currentStep = 0;
  
  fadeInInterval = setInterval(() => {
    if (isFadingOut) {
      clearInterval(fadeInInterval!);
      fadeInInterval = null;
      return;
    }
    
    currentStep++;
    const newVolume = Math.min(1.0, currentStep * volumeStep);
    noisePlayer?.setVolume(newVolume);
    
    if (currentStep >= steps) {
      clearInterval(fadeInInterval!);
      fadeInInterval = null;
      console.log('[NoiseAudio] 淡入完成');
    }
  }, interval);
  
  console.log('[NoiseAudio] 开始淡入，时长:', duration, 'ms');
};

// 淡出效果（1 秒）
const fadeOutAudio = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!noisePlayer) {
      resolve();
      return;
    }
    
    // 清理之前的淡出定时器（防止冲突）
    if (fadeOutInterval) {
      clearInterval(fadeOutInterval);
      fadeOutInterval = null;
    }
    
    isFadingOut = true;
    const duration = CROSSFADE_DURATION; // 1000ms = 1s
    const steps = 100; // 100 步，每步 10ms（更精细）
    const volumeStep = 1.0 / steps;
    const interval = duration / steps;
    
    let currentStep = 0;
    
    fadeOutInterval = setInterval(() => {
      currentStep++;
      const newVolume = Math.max(0, 1.0 - (currentStep * volumeStep));
      noisePlayer?.setVolume(newVolume);
      
      if (currentStep >= steps) {
        clearInterval(fadeOutInterval!);
        fadeOutInterval = null;
        console.log('[NoiseAudio] 淡出完成');
        
        // 停止播放并彻底释放资源
        if (noisePlayer) {
          noisePlayer.stop(() => {
            console.log('[NoiseAudio] 停止完成');
            noisePlayer.release();
            console.log('[NoiseAudio] 释放完成');
            noisePlayer = null;
            currentModeId = null;
            resolve();
          });
        } else {
          resolve();
        }
      }
    }, interval);
    
    console.log('[NoiseAudio] 开始淡出，时长:', duration, 'ms');
  });
};

// 停止降噪音频（Modal 关闭时调用）
export const stopNoiseAudio = async () => {
  console.log('[NoiseAudio] 停止播放');
  
  // 清理所有定时器
  if (fadeInInterval) {
    clearInterval(fadeInInterval);
    fadeInInterval = null;
  }
  
  if (fadeOutInterval) {
    clearInterval(fadeOutInterval);
    fadeOutInterval = null;
  }
  
  // 【8 轨模式】调用 8TrackAudioService 停止
  console.log('[NoiseAudio] 调用 8TrackAudioService 停止');
  await stop8TrackAudio();
  currentModeId = null;
};

// 清理资源（页面卸载时调用）
export const cleanupNoiseAudio = async () => {
  console.log('[NoiseAudio] 清理资源');
  await stopNoiseAudio();
};

// 获取当前播放状态
export const getCurrentMode = () => {
  return currentModeId;
};

// 检查是否在播放
export const isPlaying = () => {
  return noisePlayer !== null && currentModeId !== null;
};

// 【关键修复】导出预热函数
export { warmupAudio } from './8TrackAudioService';
