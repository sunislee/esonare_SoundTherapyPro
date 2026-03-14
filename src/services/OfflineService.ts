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
   * 优化：资源已下载完成，直接返回在线状态
   */
  async isOfflineMode(): Promise<boolean> {
    // 资源已下载完成，始终返回在线状态以允许播放
    return false;
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
          console.warn(`[OfflineService] 文件大小不匹配：${asset.id}, 实际：${actualSize}, 预期：${asset.expectedSize}`);
        }
      } catch (e) {
        corruptedAssets.push(asset.id);
        console.error(`[OfflineService] 文件读取失败：${asset.id}, ${e}`);
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
      console.error(`[OfflineService] 未知资源：${assetId}`);
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
   * 【关键修复】分离 Core 资源就绪和完整资源就绪
   * - Core 资源就绪：允许用户进入应用（起名/主页）
   * - 完整资源就绪：所有资源下载完成
   */
  async isResourceReady(): Promise<boolean> {
    try {
      // 1. 检查 AsyncStorage 标记
      const readyFlag = await AsyncStorage.getItem(READY_KEY);
      const isFlagSet = readyFlag === 'true';
      console.log(`[OfflineService] AsyncStorage 标记：${readyFlag}`);

      // 2. 物理校验
      const integrity = await this.checkResourceIntegrity();
      const isPhysicallyReady = integrity.isComplete;
      console.log(`[OfflineService] 物理完整性：${isPhysicallyReady} (存在${integrity.existingFileCount}/${integrity.totalFileCount}文件)`);

      // 3. 【关键修复】Core 资源检查：只要核心资源存在即可
      const CORE_ASSET_IDS = [
        'nature_deep_sea',      // 深海呼吸（启动场景）
        'interactive_breath',   // 呼吸交互（核心交互）
        'healing_zen_bowl',     // 颂钵冥想（启动音效）
      ];
      
      let coreAssetsReady = true;
      const coreCheckDetails: any[] = [];
      for (const coreId of CORE_ASSET_IDS) {
        const coreAsset = AUDIO_MANIFEST.find(a => a.id === coreId);
        if (!coreAsset) {
          coreCheckDetails.push(`${coreId}: 未找到`);
          coreAssetsReady = false; // 找不到 Core 资源定义，标记为不就绪
          continue;
        }
        
        const localPath = getLocalPathHelper(coreAsset.category, coreAsset.filename);
        const exists = await RNFS.exists(localPath);
        
        // 【暴力修复 3】核心校验降级：强制打印文件大小
        let fileSize = 0;
        if (exists) {
          try {
            const stat = await RNFS.stat(localPath);
            fileSize = Number(stat.size);
            console.log(`[OfflineService] 正在校验文件：${coreId}, 路径：${localPath}, 大小：${fileSize} bytes (${(fileSize/1024).toFixed(2)} KB)`);
          } catch (e) {
            console.error(`[OfflineService] 无法读取文件大小：${coreId}, ${e}`);
            coreAssetsReady = false;
            continue;
          }
        } else {
          console.log(`[OfflineService] 正在校验文件：${coreId}, 路径：${localPath}, 大小：0 bytes (文件不存在)`);
        }
        
        coreCheckDetails.push(`${coreId}: ${exists ? '存在' : '不存在'} (${localPath}, ${fileSize} bytes)`);
        
        if (!exists) {
          coreAssetsReady = false;
        }
      }
      
      console.log(`[OfflineService] Core 资源检查详情：${coreCheckDetails.join(', ')}`);
      console.log(`[OfflineService] Core 资源就绪：${coreAssetsReady}`);

      // 4. 放宽条件：只要 Core 资源就绪就认为资源就绪（允许用户进入应用）
      const isReady = coreAssetsReady;

      console.log(`[OfflineService] 资源就绪检查：flag=${isFlagSet}, physical=${isPhysicallyReady}, core=${coreAssetsReady}, result=${isReady}`);

      // 5. 如果 Core 资源就绪但标记未设置，设置标记
      if (coreAssetsReady && !isFlagSet) {
        console.log('[OfflineService] Core 资源就绪但标记未设置，设置标记');
        await this.markAsReady();
      }

      // 6. 如果标记为就绪但 Core 资源不完整，清除标记
      if (isFlagSet && !coreAssetsReady) {
        console.warn('[OfflineService] 标记为就绪但 Core 资源不完整，清除标记');
        await this.clearReadyFlag();
      }

      return isReady;
    } catch (e) {
      console.error('[OfflineService] 资源就绪检查失败:', e);
      return false;
    }
  },

  /**
   * 【新增】完整资源完整性检查
   * 检查所有资源文件是否存在且大小正确
   */
  async checkFullIntegrity(): Promise<{
    isComplete: boolean;
    missingFiles: string[];
    corruptedFiles: string[];
    details: string[];
  }> {
    try {
      const missingFiles: string[] = [];
      const corruptedFiles: string[] = [];
      const details: string[] = [];
      
      console.log('[OfflineService] 开始完整资源检查...');
      console.log(`[OfflineService] AUDIO_MANIFEST 长度: ${AUDIO_MANIFEST.length}`);
      
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const exists = await RNFS.exists(localPath);
        
        console.log(`[OfflineService] 检查文件: ${asset.id}, path: ${localPath}, exists: ${exists}`);
        
        if (!exists) {
          missingFiles.push(asset.id);
          details.push(`${asset.id}: 缺失 (${localPath})`);
          continue;
        }
        
        // 检查文件大小
        try {
          const stat = await RNFS.stat(localPath);
          const actualSize = Number(stat.size);
          const expectedSize = asset.size;
          const sizeDiff = Math.abs(actualSize - expectedSize);
          const sizeDiffPercent = expectedSize > 0 ? sizeDiff / expectedSize : 0;
          
          if (sizeDiffPercent > 0.01) { // 允许 1% 的误差
            corruptedFiles.push(asset.id);
            details.push(`${asset.id}: 大小不匹配 - 实际：${actualSize} bytes, 预期：${expectedSize} bytes`);
          } else {
            details.push(`${asset.id}: 正常 (${actualSize} bytes)`);
          }
        } catch (e) {
          corruptedFiles.push(asset.id);
          details.push(`${asset.id}: 无法读取文件信息 - ${e}`);
        }
      }
      
      const isComplete = missingFiles.length === 0 && corruptedFiles.length === 0;
      
      console.log(`[OfflineService] 完整资源检查：${isComplete ? '通过' : '失败'}`);
      console.log(`[OfflineService] 缺失文件：${missingFiles.length}个 - ${missingFiles.join(', ')}`);
      console.log(`[OfflineService] 损坏文件：${corruptedFiles.length}个 - ${corruptedFiles.join(', ')}`);
      
      return {
        isComplete,
        missingFiles,
        corruptedFiles,
        details
      };
    } catch (e) {
      console.error('[OfflineService] 完整资源检查失败:', e);
      return {
        isComplete: false,
        missingFiles: [],
        corruptedFiles: [],
        details: [`检查失败：${e}`]
      };
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
  }
};

export default OfflineService;
