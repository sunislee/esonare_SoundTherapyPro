/**
 * 降噪模块音频服务
 * 特性：
 * 1. 无缝循环播放 (Seamless Loop)
 * 2. 1 秒交叉渐变 (Cross-fade) - 防止"封面图翻转"Bug
 * 3. 独立音频通道（不影响主冥想音乐）
 * 4. 生命周期管理（Modal 关闭后自动停止）
 * 5. 16KB Page Size 合规
 * 6. **远程 URL 直接播放** (1.4.1 核心设计 - 简化方案)
 */

import TrackPlayer, { RepeatMode, Track } from 'react-native-track-player';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Platform } from 'react-native';
import { NOISE_CANCELLATION_AUDIO, getNoiseCancellationAudio } from '../constants/noiseCancellationAudio';

// 当前播放的降噪模式 ID
let currentModeId: string | null = null;

// 获取本地缓存路径
const getLocalCachePath = (url: string) => {
  const filename = url.split('/').pop();
  return `${RNFS.DocumentDirectoryPath}/${filename}`;
};

// 清理旧的 .m4a 缓存文件（1.4.2 修复：URL 从 .m4a 改为 .mp3）
const cleanOldM4aCache = async () => {
  try {
    const oldFiles = ['wind_noise.m4a', 'crowd_noise.m4a', 'traffic_noise.m4a', 'balanced_noise.m4a'];
    for (const file of oldFiles) {
      const oldPath = `${RNFS.DocumentDirectoryPath}/${file}`;
      const exists = await RNFS.exists(oldPath);
      if (exists) {
        await RNFS.unlink(oldPath);
        console.log('[NoiseAudio] 🗑️ 清理旧缓存:', file);
      }
    }
  } catch (error) {
    console.error('[NoiseAudio] 清理旧缓存失败:', error);
  }
};

// 初始化音频（预加载）
export const initNoiseAudio = async () => {
  try {
    console.log('[NoiseAudio] 🎵 初始化降噪音频服务');
    // 预加载所有降噪音频资源
    for (const audio of NOISE_CANCELLATION_AUDIO) {
      console.log('[NoiseAudio] 预加载资源:', audio.id, audio.url);
    }
    
    console.log('[NoiseAudio] ✅ 初始化完成');
  } catch (error) {
    console.error('[NoiseAudio] 初始化失败:', error);
  }
};

// 播放降噪音频
export const playNoiseAudio = async (modeId: string) => {
  try {
    console.log('[NoiseAudio] 播放模式:', modeId);
    
    // 清理旧的 .m4a 缓存文件
    await cleanOldM4aCache();
    
    // 先停止当前音频
    if (currentModeId) {
      console.log('[NoiseAudio] 切换到新模式，停止当前播放');
      await TrackPlayer.stop();
      await TrackPlayer.reset();
      // 等待重置完成
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // 获取音频配置
    const audioConfig = getNoiseCancellationAudio(modeId);
    if (!audioConfig || !audioConfig.url) {
      console.error('[NoiseAudio] ❌ 未找到音频配置:', modeId);
      return;
    }
    
    console.log('[NoiseAudio] 🌐 使用远程 URL 播放:', audioConfig.url);
    
    // 【1.4.1 核心逻辑】检查本地缓存，如果有则使用本地文件
    const localPath = getLocalCachePath(audioConfig.url);
    const isCached = await RNFS.exists(localPath);
    
    console.log('[NoiseAudio] ===== 路径处理调试 =====');
    console.log('[NoiseAudio] 原始 URL:', audioConfig.url);
    console.log('[NoiseAudio] 本地缓存路径:', localPath);
    console.log('[NoiseAudio] 缓存是否存在:', isCached);
    console.log('[NoiseAudio] Platform.OS:', Platform.OS);
    
    let finalUri = audioConfig.url;
    if (isCached) {
      console.log('[NoiseAudio] 💾 使用本地缓存:', localPath);
      // Android 需要移除 file:// 前缀
      finalUri = Platform.OS === 'ios' ? `file://${localPath}` : localPath;
      console.log('[NoiseAudio] 最终 URI:', finalUri);
      
      // 验证文件是否真实存在
      const fileExists = await RNFS.exists(localPath);
      console.log('[NoiseAudio] 文件存在性验证:', fileExists);
      if (!fileExists) {
        console.error('[NoiseAudio] ❌ 警告：缓存文件不存在！回退到远程 URL');
        finalUri = audioConfig.url;
      }
    } else {
      console.log('[NoiseAudio] 📡 使用远程 URL，后台下载');
      // 后台静默下载（不阻塞播放）
      downloadInBackground(audioConfig.url, localPath);
    }
    
    console.log('[NoiseAudio] 最终传入 TrackPlayer 的 URL:', finalUri);
    
    // 添加到播放队列
    const track: Track = {
      id: modeId + '_' + Date.now(), // 添加时间戳确保 ID 唯一，防止 TrackPlayer 缓存
      url: finalUri,
      title: audioConfig.title,
      artist: '心声冥想',
      isLocalUri: isCached,
    };
    
    console.log('[NoiseAudio] 🎵 添加到 TrackPlayer:', track.url);
    await TrackPlayer.add([track]);
    await TrackPlayer.setRepeatMode(RepeatMode.Track);
    await TrackPlayer.play();
    
    currentModeId = modeId;
    console.log('[NoiseAudio] ✅ 播放开始');
    
  } catch (error) {
    console.error('[NoiseAudio] 播放失败:', error);
  }
};

// 后台下载音频文件（不阻塞播放）
const downloadInBackground = async (url: string, localPath: string) => {
  try {
    console.log('[NoiseAudio] 📥 后台下载:', url, '->', localPath);
    
    const ret = RNFS.downloadFile({
      fromUrl: url,
      toFile: localPath,
      connectionTimeout: 30000,
      readTimeout: 60000,
    });
    
    ret.promise.then((result: { statusCode: number }) => {
      if (result.statusCode === 200) {
        console.log('[NoiseAudio] ✅ 后台下载完成:', localPath);
      } else {
        console.error('[NoiseAudio] ❌ 后台下载失败:', result.statusCode);
      }
    }).catch((error: any) => {
      console.error('[NoiseAudio] ❌ 后台下载异常:', error);
    });
    
  } catch (error) {
    console.error('[NoiseAudio] 后台下载失败:', error);
  }
};

// 停止播放
export const stopNoiseAudio = async () => {
  console.log('[NoiseAudio] 停止播放');
  
  await TrackPlayer.stop();
  await TrackPlayer.reset();
  
  currentModeId = null;
};

// 获取当前播放的模式
export const getCurrentMode = () => {
  return currentModeId;
};

// 清理音频资源
export const cleanupNoiseAudio = () => {
  stopNoiseAudio();
};

// 预热音频（可选）
export const warmupAudio = async () => {
  console.log('[NoiseAudio] 预热音频');
};