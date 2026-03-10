import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  AUDIO_MANIFEST, 
  ASSET_LIST, 
  getLocalPath as getLocalPathHelper,
  IS_GOOGLE_PLAY_VERSION
} from '../constants/audioAssets';

// 资源版本标记（用于强制重新下载时使用）
const RESOURCE_VERSION = '1.0.7';
const SOURCE_ID = IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE';
// 简化 key，不再包含版本号，避免版本更新后要求重新下载
const READY_KEY = 'RESOURCE_READY';

export interface ResourceIntegrityResult {
  isComplete: boolean;
  missingAssets: string[];
  corruptedAssets: string[];
  totalSize: number;
  expectedSize: number;
  existingFileCount: number;
  totalFileCount: number;
}

export interface DownloadProgressState {
  assetId: string;
  downloadedBytes: number;
  totalBytes: number;
  isCompleted: boolean;
  timestamp: number;
}

export const OfflineService = {
  /**
   * 检测当前是否处于离线模式
   * 简化网络检测逻辑，避免崩溃，添加超时机制
   */
  async isOfflineMode(): Promise<boolean> {
    try {
      // 使用 Promise.race 添加 5 秒超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Network check timeout')), 5000);
      });
      
      const fetchPromise = fetch('https://www.baidu.com/favicon.ico', { 
        method: 'HEAD',
        cache: 'no-cache',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return !response.ok;
    } catch (e) {
      console.warn('[OfflineService] 网络检测失败或超时，默认在线模式以允许下载');
      return false; // 网络检测失败时默认在线，允许下载
    }
  },

  /**
   * 物理校验所有资源文件的完整性
   * 检查文件是否存在且大小匹配预期
   */
  async checkResourceIntegrity(): Promise<ResourceIntegrityResult> {
    const missingAssets: string[] = [];
    const corruptedAssets: string[] = [];
    let totalSize = 0;
    let expectedSize = 0;
    let existingFileCount = 0;

    for (const asset of ASSET_LIST) {
      const audioAsset = AUDIO_MANIFEST.find(a => a.id === asset.id);
      if (!audioAsset) continue;

      expectedSize += asset.expectedSize;

      const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
      const fileExists = await RNFS.exists(localPath);

      if (!fileExists) {
        missingAssets.push(asset.id);
        continue;
      }

      try {
        const fileStat = await RNFS.stat(localPath);
        const actualSize = Number(fileStat.size);
        totalSize += actualSize;
        existingFileCount++;

        // 文件大小偏差超过 1% 视为损坏
        const sizeDiff = Math.abs(actualSize - asset.expectedSize);
        const sizeDiffPercent = sizeDiff / asset.expectedSize;
        
        if (sizeDiffPercent > 0.01) {
          corruptedAssets.push(asset.id);
          console.warn(`[OfflineService] 文件大小不匹配: ${asset.id}, 实际: ${actualSize}, 预期: ${asset.expectedSize}`);
        }
      } catch (e) {
        corruptedAssets.push(asset.id);
        console.error(`[OfflineService] 文件读取失败: ${asset.id}, ${e}`);
      }
    }

    const isComplete = missingAssets.length === 0 && corruptedAssets.length === 0;

    return {
      isComplete,
      missingAssets,
      corruptedAssets,
      totalSize,
      expectedSize,
      existingFileCount,
      totalFileCount: ASSET_LIST.length
    };
  },

  /**
   * 校验单个资源文件
   */
  async validateAsset(assetId: string): Promise<boolean> {
    const asset = ASSET_LIST.find(a => a.id === assetId);
    const audioAsset = AUDIO_MANIFEST.find(a => a.id === assetId);
    
    if (!asset || !audioAsset) {
      console.error(`[OfflineService] 未知资源: ${assetId}`);
      return false;
    }

    const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
    const fileExists = await RNFS.exists(localPath);

    if (!fileExists) {
      return false;
    }

    try {
      const fileStat = await RNFS.stat(localPath);
      const actualSize = Number(fileStat.size);
      const sizeDiff = Math.abs(actualSize - asset.expectedSize);
      const sizeDiffPercent = sizeDiff / asset.expectedSize;
      
      return sizeDiffPercent <= 0.01;
    } catch (e) {
      return false;
    }
  },

  /**
   * 统一的资源就绪判断
   * 必须同时满足：物理文件完整 + AsyncStorage 标记为就绪
   */
  async isResourceReady(): Promise<boolean> {
    try {
      // 1. 检查 AsyncStorage 标记
      const readyFlag = await AsyncStorage.getItem(READY_KEY);
      const isFlagSet = readyFlag === 'true';

      // 2. 物理校验
      const integrity = await this.checkResourceIntegrity();
      const isPhysicallyReady = integrity.isComplete;

      // 3. 放宽条件：只要物理文件就绪就认为资源就绪
      const isReady = isPhysicallyReady;

      console.log(`[OfflineService] 资源就绪检查: flag=${isFlagSet}, physical=${isPhysicallyReady}, result=${isReady}`);

      // 4. 如果物理文件就绪但标记未设置，设置标记
      if (isPhysicallyReady && !isFlagSet) {
        console.log('[OfflineService] 物理文件就绪但标记未设置，设置标记');
        await this.markAsReady();
      }

      // 5. 如果标记为就绪但物理文件不完整，清除标记
      if (isFlagSet && !isPhysicallyReady) {
        console.warn('[OfflineService] 标记为就绪但物理文件不完整，清除标记');
        await this.clearReadyFlag();
      }

      return isReady;
    } catch (e) {
      console.error('[OfflineService] 资源就绪检查失败:', e);
      return false;
    }
  },

  /**
   * 标记资源为就绪状态
   */
  async markAsReady() {
    try {
      await AsyncStorage.setItem(READY_KEY, 'true');
      console.log('[OfflineService] 资源已标记为就绪');
    } catch (e) {
      console.error('[OfflineService] 标记就绪状态失败:', e);
    }
  },

  /**
   * 清除就绪标记
   */
  async clearReadyFlag() {
    try {
      await AsyncStorage.removeItem(READY_KEY);
      console.log('[OfflineService] 就绪标记已清除');
    } catch (e) {
      console.error('[OfflineService] 清除就绪标记失败:', e);
    }
  },

  /**
   * 获取本地文件路径
   * 如果文件不存在返回 null
   */
  async getLocalPath(assetId: string): Promise<string | null> {
    const audioAsset = AUDIO_MANIFEST.find(a => a.id === assetId);
    if (!audioAsset) return null;

    const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
    const exists = await RNFS.exists(localPath);
    
    return exists ? localPath : null;
  },

  /**
   * 保存下载进度（用于断点续传）
   */
  async saveDownloadProgress(progress: DownloadProgressState) {
    try {
      const key = `DOWNLOAD_PROGRESS_${progress.assetId}_${RESOURCE_VERSION}`;
      await AsyncStorage.setItem(key, JSON.stringify(progress));
    } catch (e) {
      console.error('[OfflineService] 保存下载进度失败:', e);
    }
  },

  /**
   * 获取下载进度
   */
  async getDownloadProgress(assetId: string): Promise<DownloadProgressState | null> {
    try {
      const key = `DOWNLOAD_PROGRESS_${assetId}_${RESOURCE_VERSION}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('[OfflineService] 获取下载进度失败:', e);
      return null;
    }
  },

  /**
   * 清除下载进度
   */
  async clearDownloadProgress(assetId: string) {
    try {
      const key = `DOWNLOAD_PROGRESS_${assetId}_${RESOURCE_VERSION}`;
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('[OfflineService] 清除下载进度失败:', e);
    }
  },

  /**
   * 获取所有需要重新下载的资源列表
   * 包括：缺失的、损坏的、下载未完成的
   */
  async getAssetsNeedDownload(): Promise<string[]> {
    const integrity = await this.checkResourceIntegrity();
    const needDownload = [...integrity.missingAssets, ...integrity.corruptedAssets];
    
    // 检查是否有未完成的下载
    for (const asset of ASSET_LIST) {
      if (needDownload.includes(asset.id)) continue;
      
      const progress = await this.getDownloadProgress(asset.id);
      if (progress && !progress.isCompleted) {
        needDownload.push(asset.id);
      }
    }

    return [...new Set(needDownload)];
  }
};

export default OfflineService;
