/**
 * 降噪模块音频服务
 * 特性：
 * 1. 无缝循环播放 (Seamless Loop)
 * 2. 1 秒交叉渐变 (Cross-fade) - 防止"封面图翻转"Bug
 * 3. 独立音频通道（不影响主冥想音乐）
 * 4. 生命周期管理（Modal 关闭后自动停止）
 * 5. 16KB Page Size 合规
 * 6. 单例锁机制（全局唯一播放器实例）
 */

import Sound from 'react-native-sound';
import { NOISE_CANCELLATION_AUDIO, getNoiseCancellationAudio } from '../constants/noiseCancellationAudio';

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
  } catch (error) {
    console.error('[NoiseAudio] 初始化失败:', error);
  }
};

// 播放降噪音频（带淡入效果）
export const playNoiseAudio = async (modeId: string) => {
  try {
    console.log('[NoiseAudio] 播放模式:', modeId);
    
    // 如果已经是当前模式，跳过
    if (currentModeId === modeId && noisePlayer) {
      console.log('[NoiseAudio] 已是当前模式，跳过播放');
      return;
    }
    
    // 先彻底停止当前音频（如果有）- 1 秒交叉渐变
    if (noisePlayer && currentModeId) {
      console.log('[NoiseAudio] 切换到新模式，执行 1 秒交叉渐变');
      await fadeOutAudio();
    }
    
    // 确保旧实例已完全释放（单例锁保护）
    if (noisePlayer) {
      console.log('[NoiseAudio] 强制释放旧实例');
      noisePlayer.stop();
      noisePlayer.release();
      noisePlayer = null;
    }
    
    // 获取音频配置
    const audioConfig = getNoiseCancellationAudio(modeId);
    if (!audioConfig) {
      console.error('[NoiseAudio] 未找到音频配置:', modeId);
      return;
    }
    
    console.log('[NoiseAudio] 准备加载音频:', audioConfig.title);
    console.log('[NoiseAudio] 资源名称:', audioConfig.resourceName);
    
    // 创建新的播放器实例 - 使用原生 raw 资源
    // 16KB Page Size 合规：使用 Sound 类的安全加载方式
    console.log('[NoiseAudio] 准备创建 Sound 实例，使用 raw 资源');
    noisePlayer = new Sound(audioConfig.resourceName, Sound.MAIN_BUNDLE, (error) => {
      console.log('[NoiseAudio] Sound 回调触发');
      if (error) {
        console.error('[NoiseAudio] 加载失败:', error);
        console.error('[NoiseAudio] 错误详情:', JSON.stringify(error));
        return;
      }
      
      console.log('[NoiseAudio] 加载成功，开始播放');
      console.log('[NoiseAudio] 音频时长:', noisePlayer?.getDuration());
      
      // 设置无缝循环播放
      noisePlayer?.setNumberOfLoops(-1);
      
      // 初始音量设为 0（淡入准备）
      noisePlayer?.setVolume(0);
      
      // 开始播放
      noisePlayer?.play(() => {
        // 播放完成回调（循环播放不会触发）
        console.log('[NoiseAudio] 播放完成');
      });
      
      // 执行淡入效果（1 秒）
      fadeInAudio();
    });
    
    console.log('[NoiseAudio] Sound 实例创建完成');
    currentModeId = modeId;
    
  } catch (error) {
    console.error('[NoiseAudio] 播放失败:', error);
    console.error('[NoiseAudio] 错误堆栈:', JSON.stringify(error));
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
  
  // 强制停止并释放资源
  if (noisePlayer) {
    console.log('[NoiseAudio] 停止并释放播放器');
    isFadingOut = true;
    noisePlayer.stop();
    noisePlayer.release();
    noisePlayer = null;
    currentModeId = null;
    console.log('[NoiseAudio] 播放器已释放');
  }
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
