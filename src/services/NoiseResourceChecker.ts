/**
 * 降噪音频资源检查工具
 * 用于检查 8-track 音频组的本地文件是否全部就绪
 */

import * as RNFS from '@dr.pogodin/react-native-fs';
import { getLocalPath } from '../constants/audioAssets';

/**
 * 检查指定音频组对应的8个轨道文件是否全部存在于本地。
 * @param audioGroupId 音频组 ID，如 'balanced_noise'、'wind_noise'
 * @returns true 表示8个文件全部就绪（可播放）
 */
export const checkNoiseResourcesReady = async (audioGroupId: string): Promise<boolean> => {
  try {
    console.log('[NoiseResourceChecker] checkNoiseResourcesReady START', audioGroupId);
    
    for (let trackNum = 1; trackNum <= 8; trackNum++) {
      const filename = `${audioGroupId}_track_${trackNum}.mp3`;
      const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
      
      const exists = await RNFS.exists(localPath);
      if (!exists) {
        console.warn('[NoiseResourceChecker] ❌ 资源未就绪：缺少', filename);
        return false;
      }
    }
    
    console.log('[NoiseResourceChecker] ✅ 8-track 资源全部就绪:', audioGroupId);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[NoiseResourceChecker] ❌ checkNoiseResourcesReady error:', errorMsg);
    return false;
  }
};

/**
 * 获取指定音频组对应的8个轨道文件的本地路径列表
 * @param audioGroupId 音频组 ID
 * @returns 8个本地文件路径的数组
 */
export const getNoiseResourceFiles = (audioGroupId: string): string[] => {
  const files: string[] = [];
  
  for (let trackNum = 1; trackNum <= 8; trackNum++) {
    const filename = `${audioGroupId}_track_${trackNum}.mp3`;
    const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
    files.push(localPath);
  }
  
  return files;
};