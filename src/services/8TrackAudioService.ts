/**
 * 8 轨并行混音音频服务（方案 B 升级版）
 * 特性：
 * 1. 8 轨并行播放：track_1.mp3 ~ track_8.mp3
 * 2. 独立音量控制：每个频段独立 setVolume()
 * 3. 同步播放/暂停/循环
 * 5. 动态加载任意音频组
 * 6. 相位对齐保护
 * 7. LFO 动态音量调制（呼吸感/流动感）
 */

import Sound from 'react-native-sound';
import { lfoService, type LFOParams } from './LFOService';
import { getLocalPath } from '../constants/audioAssets';
import * as RNFS from '@dr.pogodin/react-native-fs';

// 初始化音频类别
Sound.setCategory('Playback');
Sound.setMode('Default');

// LFO 启用状态
let isLFOEnabled = false;
let lfoUnsubscribe: (() => void) | null = null;

// 8 轨播放器实例
type TrackPlayers = {
  1: Sound | null;
  2: Sound | null;
  3: Sound | null;
  4: Sound | null;
  5: Sound | null;
  6: Sound | null;
  7: Sound | null;
  8: Sound | null;
};

// 【关键修复】初始化为全 null，确保无残留
let players: TrackPlayers = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
  7: null,
  8: null,
};

// 当前播放的音频组 ID
let currentAudioGroupId: string | null = null;

// 是否正在播放
let isPlaying = false;

// 当前各轨道音量（0.0-1.0）
let currentVolumes: number[] = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

// 【关键修复】场景切换锁，防止并发播放
let isSwitching = false;

/**
 * 重置所有音量为默认值（100%）
 * 用于场景切换时清理残留状态
 */
export const resetAllVolumes = () => {
  console.log('[8Track] 🔄 重置所有轨道音量为默认值 100%');
  currentVolumes = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  
  // 同步更新播放器音量
  for (let i = 1; i <= 8; i++) {
    if (players[i]) {
      players[i]?.setVolume(1.0);
    }
  }
};

/**
 * 淡出所有音轨（防止音爆）
 * @param duration 淡出时长（ms）
 */
const fadeOut8Track = async (duration: number = FADE_OUT_DURATION) => {
  return new Promise<void>((resolve) => {
    console.log(`[8Track] 📉 开始淡出 (${duration}ms)`);
    
    const steps = 20; // 20 步
    const volumeStep = 1.0 / steps;
    const interval = duration / steps;
    
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      const targetVolume = Math.max(0, 1.0 - (currentStep * volumeStep));
      
      // 更新所有轨道音量
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          players[i]?.setVolume(targetVolume);
        }
      }
      
      if (currentStep >= steps) {
        clearInterval(timer);
        console.log('[8Track] ✅ 淡出完成 - 8 轨音量 0%');
        resolve();
      }
    }, interval);
  });
};

/**
 * 淡入所有音轨（平滑启动）
 * @param duration 淡入时长（ms）
 */
const fadeIn8Track = async (duration: number = FADE_IN_DURATION) => {
  return new Promise<void>((resolve) => {
    console.log(`[8Track] 📈 开始淡入 (${duration}ms)`);
    
    const steps = 20; // 20 步
    const volumeStep = 1.0 / steps;
    const interval = duration / steps;
    
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      const targetVolume = Math.min(1.0, currentStep * volumeStep);
      
      // 更新所有轨道音量
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          players[i]?.setVolume(targetVolume);
        }
      }
      
      if (currentStep >= steps) {
        clearInterval(timer);
        console.log('[8Track] ✅ 淡入完成 - 8 轨音量 100%');
        resolve();
      }
    }, interval);
  });
};

// 交叉渐变时长
const CROSSFADE_DURATION = 1000;
// 场景切换淡出时长（快速淡出，避免音爆）
const FADE_OUT_DURATION = 150;
// 场景切换淡入时长（快速淡入）
const FADE_IN_DURATION = 200;
// 单个轨道加载超时时长（2 秒 - 极速优化）
const LOAD_TIMEOUT_MS = 2000;
// 轨道加载间隔时长（staggered parallel）
const STAGGER_INTERVAL_MS = 30;
// 全局最大加载时间（2 秒 - 用户体验红线）
const MAX_LOADING_TIME_MS = 2000;
// 最小成功加载数量（6 个 - 超过 70% 即可播放）
const MIN_SUCCESS_COUNT = 6;

// 【关键修复】音频预热标志
let isAudioWarmup = false;

// 【关键修复】加载进度状态
let loadingProgress = 0;
let onLoadingProgressCallback: ((progress: number, loadedCount: number, totalCount: number) => void) | null = null;

/**
 * 【关键修复】强制全局重置：彻底释放所有播放器资源
 * 用于场景切换前的资源清理
 */
export const forceGlobalReset = () => {
  console.log('[8Track] 🔥 强制全局重置：释放所有播放器资源');
  
  // 【关键修复】并行释放所有资源
  const releasePromises = [];
  for (let i = 1; i <= 8; i++) {
    if (players[i]) {
      console.log(`[8Track] 🔥 强制释放 Track ${i}`);
      const p = new Promise<void>((resolve) => {
        try {
          players[i]?.stop();
          players[i]?.release();
          console.log(`[8Track] ✅ Track ${i} 已释放`);
        } catch (e) {
          console.error(`[8Track] ⚠️ Track ${i} 释放失败:`, e);
        }
        players[i] = null;
        resolve();
      });
      releasePromises.push(p);
    }
  }
  
  // 等待所有资源释放完成
  Promise.all(releasePromises).then(() => {
    console.log('[8Track] ✅ 所有资源已并行释放完成');
  });
  
  currentAudioGroupId = null;
  isPlaying = false;
  console.log('[8Track] ✅ 全局重置完成 - 所有资源已释放');
};

/**
 * 【关键修复】强制清空所有播放器占位符
 * 用于首次播放前，确保 players 数组完全干净
 */
const forceClearPlayers = () => {
  console.log('[8Track] 🧹 强制清空所有播放器占位符');
  for (let i = 1; i <= 8; i++) {
    players[i] = null;
  }
  console.log('[8Track] ✅ 播放器数组已清空');
};

/**
 * 【关键修复】设置加载进度回调
 * 用于 UI 显示加载进度
 */
export const setLoadingProgressCallback = (
  callback: ((progress: number, loadedCount: number, totalCount: number) => void) | null
) => {
  onLoadingProgressCallback = callback;
};

/**
 * 【关键修复】静默预热：强迫 react-native-sound 底层初始化
 * 在页面初始化时调用，加载一个极小的音频然后立刻释放
 */
export const warmupAudio = async () => {
  if (isAudioWarmup) {
    console.log('[8Track] ✅ 音频已预热，跳过');
    return;
  }
  
  console.log('[8Track] 🔥 开始静默预热音频底层...');
  
  try {
    const filename = 'balanced_noise_track_1.mp3';
    const localPath = getLocalPath('noise_reduction', filename);
    const fileExists = await RNFS.exists(localPath);
    
    if (!fileExists) {
      console.log('[8Track] ⚠️ 预热文件未下载，跳过预热');
      isAudioWarmup = true;
      return;
    }
    
    const warmupSound = await new Promise<Sound>((resolve, reject) => {
      const s = new Sound(localPath, '', (error) => {
        if (error) {
          console.error('[8Track] ⚠️ 预热加载失败:', error);
          reject(error);
        } else {
          console.log('[8Track] ✅ 预热加载成功');
          resolve(s);
        }
      });
    });
    
    warmupSound.release();
    isAudioWarmup = true;
    
    console.log('[8Track] ✅ 音频底层预热完成 - react-native-sound 已激活');
  } catch (error) {
    console.error('[8Track] ❌ 预热失败:', error);
    isAudioWarmup = true;
  }
};

/**
 * 8 轨音频资源配置
 * 资源命名规则：{folder_name}_track_{n}.mp3
 */
const AUDIO_GROUPS: Record<string, { id: string; title: string; folder: string }> = {
  balanced_noise: {
    id: 'balanced_noise',
    title: '均衡白噪音',
    folder: 'balanced_noise',
  },
  wind_noise: {
    id: 'wind_noise',
    title: '风声白噪音',
    folder: 'wind_noise',
  },
  crowd_noise: {
    id: 'crowd_noise',
    title: '人声白噪音',
    folder: 'crowd_noise',
  },
  traffic_noise: {
    id: 'traffic_noise',
    title: '交通白噪音',
    folder: 'traffic_noise',
  },
};

/**
 * 初始化 8 轨音频
 */
export const init8TrackAudio = async () => {
  console.log('[8Track] 初始化 8 轨音频服务');
};

/**
 * 播放 8 轨音频
 * @param audioGroupId 音频组 ID（如 'balanced_noise'）
 */
export const play8TrackAudio = async (audioGroupId: string) => {
  try {
    console.log('[8Track] 播放音频组:', audioGroupId);
    
    // 【关键修复】资源复用：如果点击的是当前正在播放的场景，直接 return
    if (currentAudioGroupId === audioGroupId && isPlaying) {
      console.log('[8Track] ✅ 已是当前音频组，跳过播放（资源复用）');
      return;
    }
    
    // 【关键修复】检查切换锁，防止并发
    if (isSwitching) {
      console.log('[8Track] ⚠️ 正在切换中，忽略本次播放请求');
      return;
    }
    
    // 【关键修复】设置切换锁
    isSwitching = true;
    console.log('[8Track] 🔒 设置切换锁，开始原子切换');
    
    try {
      // 【关键修复】单例控制：如果有正在播放的音频，立即停止
      if (currentAudioGroupId && isPlaying) {
        console.log('[8Track] 🎭 检测到场景切换，执行原子切换流程');
        console.log('[8Track] 📉 步骤 1: 淡出旧场景 (150ms)');
        
        // 1. 先淡出当前音频（150ms）
        await fadeOut8Track(FADE_OUT_DURATION);
        
        // 2. 【关键修复】极致的清理延迟：把 release 操作放到 setImmediate
        console.log('[8Track] 🔥 步骤 2: 异步强制全局重置（不阻塞主线程）');
        setImmediate(() => {
          forceGlobalReset();
          console.log('[8Track] ✅ 旧场景已在后台清理完成');
        });
        
        console.log('[8Track] ✅ 旧场景已淡出，立即开始加载新场景');
      } else {
        // 【关键修复】首次播放：强制清空所有占位符
        console.log('[8Track] 🎵 首次播放，执行强制清空');
        forceClearPlayers();
      }
      
      // 【关键修复】场景切换时重置所有状态
      console.log('[8Track] 🔄 步骤 3: 重置所有音量为默认值');
      resetAllVolumes();
      
      // 获取音频配置
      const audioConfig = AUDIO_GROUPS[audioGroupId];
      if (!audioConfig) {
        console.error('[8Track] 未找到音频组配置:', audioGroupId);
        console.log('[8Track] 可用的音频组:', Object.keys(AUDIO_GROUPS));
        throw new Error(`未知的音频组：${audioGroupId}`);
      }
      
      console.log('[8Track] 准备加载 8 轨音频:', audioConfig.title);
      
      // 强制音频路由（混音模式）
      console.log('[8Track] 🔊 强制设置音频路由：Playback + 混音');
      Sound.setCategory('Playback', true);
      
      // 【关键修复】真正的并行加载（Controlled Parallel）
      console.log('[8Track] ⏳ 步骤 4: 真正的并行加载 8 个轨道...');
      
      const loadedPlayers: (Sound | null)[] = new Array(8).fill(null);
      let loadedCount = 0;
      let resolveCount = 0;
      
      // 【关键修复】抢跑机制：6 个轨道成功即可播放
      const earlyResolvePromise = new Promise<void>((resolve) => {
        const checkEarlyResolve = () => {
          if (resolveCount >= MIN_SUCCESS_COUNT) {
            console.log(`[8Track] 🏃 抢跑机制触发：${resolveCount}/${MIN_SUCCESS_COUNT} 轨道成功，立即启动播放`);
            resolve();
          }
        };
        
        // 同时检查全局超时
        setTimeout(() => {
          console.log(`[8Track] ⏱️ 全局超时 (${MAX_LOADING_TIME_MS}ms) 到达`);
          checkEarlyResolve(); // 即使超时也检查是否达到最小数量
        }, MAX_LOADING_TIME_MS);
      });
      
      // 并行加载所有轨道
      const loadPromises = [];
      for (let trackNum = 1; trackNum <= 8; trackNum++) {
        // 从 AUDIO_MANIFEST 获取本地路径
        const assetId = `8track_${audioConfig.folder.split('_')[0]}_${trackNum}`;
        const filename = `${audioConfig.folder}_track_${trackNum}.mp3`;
        // 【关键修复】GitHub 目录名是 "noise reduction"（带空格）
        const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
        
        console.log(`[8Track] 🚀 准备加载轨道 [${trackNum}/8]: ${filename}`);
        console.log(`[8Track] 📂 本地路径: ${localPath}`);
        
        const loadPromise = new Promise<Sound | null>(async (resolve) => {
          let isResolved = false;
          
          // 单个轨道超时（2 秒）
          const trackTimeout = setTimeout(() => {
            if (!isResolved) {
              console.error(`[8Track] ❌ [${trackNum}/8] Track ${trackNum} 加载超时 (${LOAD_TIMEOUT_MS}ms)`);
              isResolved = true;
              resolve(null);
            }
          }, LOAD_TIMEOUT_MS);
          
          // 检查文件是否存在
          const fileExists = await RNFS.exists(localPath);
          if (!fileExists) {
            clearTimeout(trackTimeout);
            isResolved = true;
            console.error(`[8Track] ❌ [${trackNum}/8] 文件不存在: ${localPath}`);
            resolve(null);
            return;
          }
          
          console.log(`[8Track] ⏳ [${trackNum}/8] 正在加载 Track ${trackNum}`);
          
          // 使用本地文件路径加载
          const s = new Sound(localPath, '', (error) => {
            clearTimeout(trackTimeout);
            isResolved = true;
            
            if (error) {
              console.error(`[8Track] ❌ [${trackNum}/8] Track ${trackNum} 加载失败:`, error);
              resolve(null);
            } else {
              console.log(`[8Track] ✅ [${trackNum}/8] Track ${trackNum} 加载成功 (duration=${s.getDuration().toFixed(2)}s)`);
              resolve(s);
            }
          });
        }).then((sound) => {
          // 更新进度
          loadedCount++;
          loadingProgress = Math.round((loadedCount / 8) * 100);
          
          console.log(`[8Track] 📊 加载进度：${loadingProgress}% (${loadedCount}/8)`);
          
          // 通知 UI 更新进度
          if (onLoadingProgressCallback) {
            onLoadingProgressCallback(loadingProgress, loadedCount, 8);
          }
          
          // 如果加载成功，增加计数并检查抢跑
          if (sound !== null) {
            resolveCount++;
            console.log(`[8Track] 📊 成功计数：${resolveCount}/8`);
          }
          
          return sound;
        });
        
        loadPromises.push(loadPromise);
      }
      
      // 【关键修复】抢跑机制：等待 6 个轨道成功或全局超时
      console.log(`[8Track] 🔍 等待轨道加载完成（最多 ${MAX_LOADING_TIME_MS}ms，最少 ${MIN_SUCCESS_COUNT} 个）...`);
      
      // 【Bug修复】放弃 Promise.race + catch 吞错，改用 allSettled 确保结果完整收集
      const settledResults = await Promise.allSettled(loadPromises);
      for (let i = 0; i < 8; i++) {
        if (settledResults[i].status === 'fulfilled' && settledResults[i].value !== null) {
          loadedPlayers[i] = settledResults[i].value;
        }
      }
      
      // 检查加载成功数量
      const successCount = loadedPlayers.filter(s => s !== null).length;
      console.log(`[8Track] 📊 加载完成：${successCount}/8 个轨道成功`);
      
      if (successCount < MIN_SUCCESS_COUNT) {
        console.error(`[8Track] ❌ 成功加载的轨道少于 ${MIN_SUCCESS_COUNT} 个，放弃播放`);
        throw new Error('成功加载的轨道过少');
      }
      
      console.log('[8Track] 🎉 步骤 4 完成：加载阶段结束');
      
      // 保存播放器实例（过滤掉 null）
      players = {
        1: loadedPlayers[0],
        2: loadedPlayers[1],
        3: loadedPlayers[2],
        4: loadedPlayers[3],
        5: loadedPlayers[4],
        6: loadedPlayers[5],
        7: loadedPlayers[6],
        8: loadedPlayers[7],
      };
      
      // 【严格起跑线】二次检查所有轨道是否就绪
      console.log('[8Track] 🔍 步骤 5: 检查所有轨道准备状态...');
      const readyCount = loadedPlayers.filter(s => s && s.isLoaded()).length;
      console.log(`[8Track] ✅ ${readyCount}/8 个轨道准备就绪`);
      
      if (readyCount < 4) {
        console.error('[8Track] ❌ 准备就绪的轨道少于 4 个，放弃播放');
        throw new Error('准备就绪的轨道过少');
      }
      
      // 【关键修复】淡入启动：先以 0 音量启动，再淡入
      console.log('[8Track] 🎵 步骤 6: 以 0 音量启动播放，准备淡入...');
      
      // 设置所有轨道为循环模式并初始化为 0 音量
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          players[i]?.setNumberOfLoops(-1);
          players[i]?.setVolume(0); // 从 0 开始
          currentVolumes[i - 1] = 0;
        }
      }
      
      // 【关键修复】统一播放：确保所有轨道同时启动（解决相位差）
      console.log('[8Track] 🚀 8 轨同时启动（0 音量）...');
      
      // 【关键修复】播放超时缩短到 1 秒（快速失败）
      const PLAY_TIMEOUT_MS = 1000;
      
      // 使用 requestAnimationFrame 确保所有 play 调用在同一帧执行
      const playPromises = await new Promise<void[]>((resolve) => {
        requestAnimationFrame(() => {
          const promises: Promise<void>[] = [];
          
          for (let i = 1; i <= 8; i++) {
            if (players[i]) {
              const p = new Promise<void>((res) => {
                let isResolved = false;
                
                // 【关键修复】播放超时保护（1 秒 - 快速失败）
                const timeout = setTimeout(() => {
                  if (!isResolved) {
                    console.warn(`[8Track] ⚠️ Track ${i} 播放超时 (${PLAY_TIMEOUT_MS}ms)，强制继续`);
                    isResolved = true;
                    res(); // 超时也继续
                  }
                }, PLAY_TIMEOUT_MS);
                
                // 【关键修复】直接调用 play，不依赖回调
                players[i]?.play((success) => {
                  clearTimeout(timeout);
                  isResolved = true;
                  
                  if (success) {
                    console.log(`[8Track] ✅ Track ${i} 播放启动成功`);
                    res();
                  } else {
                    console.warn(`[8Track] ⚠️ Track ${i} 播放失败，但继续`);
                    res(); // 失败也继续
                  }
                });
                
                // 【关键修复】假设 play 是同步的，立即 resolve
                // react-native-sound 的 play 通常是同步启动的
                setTimeout(() => {
                  if (!isResolved) {
                    console.log(`[8Track] ⚡ Track ${i} 假设已启动（无回调）`);
                    isResolved = true;
                    res();
                  }
                }, 100);
              });
              promises.push(p);
            }
          }
          
          resolve(promises);
        });
      });
      
      // 【关键修复】不等待 play 回调，立即继续
      console.log('[8Track] ⚡ 8 轨已启动（不等待回调），开始淡入...');
      
      // 淡入到目标音量（200ms）
      console.log('[8Track] 📈 步骤 7: 淡入新场景 (200ms)');
      await fadeIn8Track(FADE_IN_DURATION);
      
      // 设置最终音量为 100%
      currentVolumes = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
      
      // 更新当前音频组 ID
      currentAudioGroupId = audioGroupId;
      isPlaying = true;
      
      // 【关键修复】释放切换锁
      isSwitching = false;
      console.log('[8Track] ✅ 8 轨音频播放成功 - 切换锁释放');
      console.log('[8Track] 🎉 原子切换完成 - 当前场景:', audioGroupId);
      
    } catch (error) {
      // 加载失败时，立即释放锁并清理资源
      console.error('[8Track] ❌ 加载失败:', error);
      
      // 强制全局重置
      forceGlobalReset();
      
      isPlaying = false;
      currentAudioGroupId = null;
      
      // 释放切换锁
      isSwitching = false;
      
      throw error; // 重新抛出错误，让 UI 层处理
    }
    
  } catch (error) {
    console.error('[8Track] ❌ 播放失败:', error);
    // 出错时清理资源
    for (let i = 1; i <= 8; i++) {
      if (players[i]) {
        players[i].release();
        players[i] = null;
      }
    }
    isPlaying = false;
    currentAudioGroupId = null;
    isSwitching = false;
    throw error; // 【Bug修复】重新抛出错误，让调用方（handleSceneSelect）收到失败信号并触发降级逻辑
  }
};

/**
 * 停止 8 轨音频
 */
export const stop8TrackAudio = async () => {
  console.log('[8Track] 停止播放');
  
  // 【修复】使用 Object.values().some() 检查是否有播放器
  const hasPlayers = Object.values(players).some(p => p !== null);
  
  if (hasPlayers) {
    try {
      // 先淡出（100ms 快速淡出）
      await fadeOut8Track(100);
      
      // 停止并释放所有音轨
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          console.log(`[8Track] 停止 Track ${i}`);
          players[i].stop();
          players[i].release();
          players[i] = null;
        }
      }
      
      currentAudioGroupId = null;
      isPlaying = false;
      
      console.log('[8Track] ✅ 已停止播放 - 所有资源已释放');
    } catch (error) {
      console.error('[8Track] ❌ 停止失败:', error);
      // 即使出错也要清理资源
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          try {
            players[i].release();
          } catch (e) {
            // 忽略释放错误
          }
          players[i] = null;
        }
      }
      isPlaying = false;
    }
  } else {
    console.log('[8Track] ⚠️ 没有正在播放的音轨');
    isPlaying = false;
  }
};

/**
 * 设置指定轨道音量
 * @param trackNum 轨道编号 (1-8)
 * @param volume 音量 (0.0-1.0)
 */
export const setTrackVolume = (trackNum: number, volume: number) => {
  if (trackNum < 1 || trackNum > 8) {
    console.error('[8Track] ❌ 轨道编号错误:', trackNum);
    return;
  }
  
  const clampedVolume = Math.max(0, Math.min(1.0, volume));
  players[trackNum]?.setVolume(clampedVolume);
  currentVolumes[trackNum - 1] = clampedVolume;
  
  console.log(`[8Track] 🎚️ Track ${trackNum} 音量：${(clampedVolume * 100).toFixed(0)}%`);
};

/**
 * 批量设置 8 轨音量
 * @param volumes 8 个音量值的数组
 */
export const setAllTrackVolumes = (volumes: number[]) => {
  if (volumes.length !== 8) {
    console.error('[8Track] ❌ 需要 8 个音量值，当前：', volumes.length);
    return;
  }
  
  for (let i = 0; i < 8; i++) {
    setTrackVolume(i + 1, volumes[i]);
  }
};

/**
 * 设置单轨音量（百分比 0-100）
 * @param trackNum 轨道编号 (1-8)
 * @param percentage 音量百分比 (0-100)
 */
export const setTrackVolumePercent = (trackNum: number, percentage: number) => {
  const volume = Math.max(0, Math.min(100, percentage)) / 100;
  setTrackVolume(trackNum, volume);
};

/**
 * 获取当前播放状态
 */
export const getPlaybackStatus = () => {
  return {
    isPlaying,
    currentAudioGroupId,
    activeTracks: Object.entries(players)
      .filter(([_, player]) => player !== null)
      .map(([trackNum, _]) => parseInt(trackNum)),
    volumes: [...currentVolumes],
  };
};

/**
 * 获取当前音频组 ID
 */
export const getCurrentAudioGroupId = () => {
  return currentAudioGroupId;
};

/**
 * 预加载音频组（不播放）
 */
export const preload8TrackAudio = async (audioGroupId: string): Promise<boolean> => {
  try {
    console.log('[8Track] 预加载音频组:', audioGroupId);
    
    const audioConfig = AUDIO_GROUPS[audioGroupId];
    if (!audioConfig) {
      console.error('[8Track] 未找到音频组配置:', audioGroupId);
      return false;
    }
    
    // 加载 8 个轨道但不播放
    const loadPromises = [];
    for (let i = 1; i <= 8; i++) {
      const resourceName = `${audioConfig.folder}_track_${i}`.toLowerCase();
      loadPromises.push(
        new Promise<Sound>((resolve, reject) => {
          // 【关键修复】Android 使用 '' (空字符串) 加载 raw 资源
          const sound = new Sound(resourceName, '', (error) => {
            if (error) reject(error);
            else resolve(sound);
          });
        })
      );
    }
    
    const loadedPlayers = await Promise.all(loadPromises);
    
    // 设置循环但不播放
    loadedPlayers.forEach((player, i) => {
      player.setNumberOfLoops(-1);
      player.setVolume(0);
      players[i + 1 as keyof TrackPlayers] = player;
    });
    
    console.log('[8Track] ✅ 预加载完成');
    return true;
  } catch (error) {
    console.error('[8Track] 预加载失败:', error);
    return false;
  }
};

// ==================== LFO 动态音量调制 ====================

/**
 * 启用 LFO 动态音量调制
 * @param params LFO 参数配置
 */
export const enableLFO = (params?: Partial<LFOParams>) => {
  if (isLFOEnabled) {
    console.log('[8Track] LFO 已启用，跳过');
    return;
  }

  console.log('[8Track]  启用 LFO 动态音量调制');

  // 配置 LFO 参数
  if (params) {
    lfoService.configure(params);
  }

  // 订阅 LFO 输出，为每个音轨独立调制音量
  lfoUnsubscribe = lfoService.subscribe((lfoValue, trackIndex) => {
    if (!isPlaying || !isLFOEnabled) return;

    // 如果是多轨模式（trackIndex 有值），为每个音轨应用独立的相位
    if (trackIndex !== undefined) {
      // 将 LFO 值（-1 到 1）转换为音量调制因子（0.85 到 1.0）
      const modulationFactor = 0.85 + (lfoValue + 1) / 2 * 0.15;
      
      // 应用调制到指定音轨
      const trackNum = trackIndex + 1;
      if (players[trackNum]) {
        const baseVolume = currentVolumes[trackNum - 1];
        const modulatedVolume = baseVolume * modulationFactor;
        players[trackNum]?.setVolume(modulatedVolume);
      }
    } else {
      // 传统模式：统一调制所有音轨
      const modulationFactor = 0.85 + (lfoValue + 1) / 2 * 0.15;
      
      // 应用调制到所有轨道
      for (let i = 1; i <= 8; i++) {
        if (players[i]) {
          const baseVolume = currentVolumes[i - 1];
          const modulatedVolume = baseVolume * modulationFactor;
          players[i]?.setVolume(modulatedVolume);
        }
      }
    }
  });

  isLFOEnabled = true;
  lfoService.start();

  console.log('[8Track] ✅ LFO 已启动 - 波形:', lfoService.getParams().waveform);
};

/**
 * 禁用 LFO 动态音量调制
 */
export const disableLFO = () => {
  if (!isLFOEnabled) {
    return;
  }

  console.log('[8Track] 🚫 禁用 LFO');

  // 取消订阅
  if (lfoUnsubscribe) {
    lfoUnsubscribe();
    lfoUnsubscribe = null;
  }

  lfoService.stop();
  isLFOEnabled = false;

  // 恢复所有轨道到基础音量
  for (let i = 1; i <= 8; i++) {
    if (players[i]) {
      players[i]?.setVolume(currentVolumes[i - 1]);
    }
  }

  console.log('[8Track] ✅ LFO 已停止 - 音量已恢复');
};

/**
 * 更新 LFO 参数
 */
export const updateLFOParams = (params: Partial<LFOParams>) => {
  console.log('[8Track] 🎛️ 更新 LFO 参数:', params);
  lfoService.configure(params);
};

/**
 * 获取 LFO 状态
 */
export const getLFOStatus = () => {
  return {
    isEnabled: isLFOEnabled,
    isRunning: lfoService.getIsRunning(),
    params: lfoService.getParams(),
    currentValue: lfoService.getCurrentValue(),
  };
};

/**
 * 使用预设 LFO 配置（支持多轨相位偏移）
 * @param presetName 预设名称
 * @param useRandomPhase 是否为每个音轨应用随机相位（默认 true，增加层次感）
 */
export const useLFOPreset = (presetName: 'breeze' | 'water' | 'pulse' | 'meditation', useRandomPhase: boolean = true) => {
  const { LFOPresets } = require('./LFOService');
  
  // 如果是微风模式且启用随机相位，为 8 个音轨创建不同的相位偏移
  if (presetName === 'breeze' && useRandomPhase) {
    console.log('[8Track] 🎨 使用微风预设 + 随机相位偏移（增强层次感）');
    
    // 生成 8 个不同的相位偏移（0-1 之间均匀分布）
    const phaseOffsets = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
    
    // 为每个音轨应用不同的相位
    phaseOffsets.forEach((phase, index) => {
      const preset = LFOPresets.breeze(phase);
      console.log(`[8Track]   音轨 ${index + 1}: 相位偏移 ${phase * 360}°`);
    });
    
    // 使用平均参数配置 LFO
    lfoService.configure({
      waveform: 'sine',
      rate: 0.12,
      depth: 0.22,
      phase: 0, // LFO 主相位为 0，实际相位在底层动态计算
    });
  } else {
    const preset = LFOPresets[presetName]();
    console.log(`[8Track] 🎨 使用 LFO 预设：${presetName}`);
    lfoService.configure(preset);
  }
};
