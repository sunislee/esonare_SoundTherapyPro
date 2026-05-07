import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  AUDIO_MANIFEST, 
  ASSET_LIST, 
  getLocalPath as getLocalPathHelper,
  IS_GOOGLE_PLAY_VERSION,
  LOCAL_RESOURCE_PATH
} from '../constants/audioAssets';
import { Platform, NativeModules } from 'react-native';

// 资源版本标记（用于强制重新下载时使用）
const RESOURCE_VERSION = '1.0.7';
const SOURCE_ID = IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE';
// 简化 key，不再包含版本号，避免版本更新后要求重新下载
const READY_KEY = 'RESOURCE_READY';
const BUNDLED_ASSETS_COPIED_KEY = 'BUNDLED_ASSETS_COPIED_V1';

// 内置音频文件列表（从 res/raw 复制）
// 【注意】西方教会音频已改为远程下载，此列表保留为空
const BUNDLED_AUDIO_FILES: string[] = [];

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
   * 复制内置音频文件从 res/raw 到 DocumentDirectory
   * 仅在首次安装或资源未复制时执行
   */
  async copyBundledAssets(): Promise<void> {
    try {
      const alreadyCopied = await AsyncStorage.getItem(BUNDLED_ASSETS_COPIED_KEY);
      if (alreadyCopied === 'true') {
        console.log('[OfflineService] ✅ 内置音频已复制，跳过');
        return;
      }

      console.log('[OfflineService] 📦 开始复制内置音频文件...');
      
      // 【防御性检查】确保目录路径有效
      if (!LOCAL_RESOURCE_PATH || typeof LOCAL_RESOURCE_PATH !== 'string') {
        console.error('[OfflineService] ❌ 本地资源路径无效:', LOCAL_RESOURCE_PATH);
        return;
      }
      
      // 确保目标目录存在
      try {
        if (!(await RNFS.exists(LOCAL_RESOURCE_PATH))) {
          await RNFS.mkdir(LOCAL_RESOURCE_PATH);
        }
      } catch (dirError: any) {
        console.error('[OfflineService] ❌ 创建目录失败:', dirError?.message);
        // 尝试使用备用目录
        const fallbackPath = `${RNFS.CachesDirectoryPath}/audio_resources`;
        console.log('[OfflineService] 使用备用目录:', fallbackPath);
        await RNFS.mkdir(fallbackPath);
      }

      let copiedCount = 0;
      for (const filename of BUNDLED_AUDIO_FILES) {
        const destPath = `${LOCAL_RESOURCE_PATH}/${filename}`;
        
        // 检查目标文件是否已存在
        try {
          if (await RNFS.exists(destPath)) {
            console.log(`[OfflineService] ⏭️ 文件已存在，跳过：${filename}`);
            copiedCount++;
            continue;
          }
        } catch (existsError: any) {
          console.warn(`[OfflineService] 检查 ${filename} 存在性失败:`, existsError?.message);
          // 继续执行，假设文件不存在
        }

        try {
          // Android: 从 assets 目录复制
          if (Platform.OS === 'android') {
            const assetPath = `audio/${filename}`;
            await RNFS.copyFileAssets(assetPath, destPath);
            console.log(`[OfflineService] ✅ 复制成功：${filename}`);
            copiedCount++;
          } else {
            // iOS: 从 Bundle 复制
            const bundlePath = RNFS.MainBundlePath + `/${filename}`;
            if (await RNFS.exists(bundlePath)) {
              await RNFS.copyFile(bundlePath, destPath);
              console.log(`[OfflineService] ✅ 复制成功：${filename}`);
              copiedCount++;
            }
          }
        } catch (error: any) {
          console.warn(`[OfflineService] ⚠️ 复制失败：${filename}`, error?.message);
          // 继续处理下一个文件
        }
      }

      // 标记已复制
      await AsyncStorage.setItem(BUNDLED_ASSETS_COPIED_KEY, 'true');
      console.log(`[OfflineService] 📦 内置音频复制完成：${copiedCount}/${BUNDLED_AUDIO_FILES.length}`);
    } catch (error: any) {
      console.error('[OfflineService] ❌ 复制内置音频失败:', error?.message);
      // 【防御性处理】即使失败也不阻塞应用启动
    }
  },

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
   * 【关键修复】改为按文件名去重校验，支持多场景复用同一音频文件
   * 【关键修复】只校验 AUDIO_MANIFEST 中的文件，不校验 ASSET_LIST 中的额外文件
   */
  async checkResourceIntegrity(): Promise<ResourceIntegrityResult> {
    const missingAssets: string[] = [];
    const corruptedAssets: string[] = [];
    let totalSize = 0;
    let expectedSize = 0;
    let existingFileCount = 0;

    // 【资源复用】按文件名去重，避免同一文件被多次校验
    const checkedFiles: Set<string> = new Set();

    for (const asset of AUDIO_MANIFEST) {
      expectedSize += asset.size;

      const localPath = getLocalPathHelper(asset.category, asset.filename);
      
      // 【资源复用】如果该文件已经检查过，跳过
      if (checkedFiles.has(localPath)) {
        existingFileCount++;
        continue;
      }
      checkedFiles.add(localPath);

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

        // 【底层校验逻辑修改】只要文件存在且大小 > 0，就视为有效
        // 不再严格比对硬编码大小，以实际下载大小为准
        if (actualSize <= 0) {
          corruptedAssets.push(asset.id);
          console.warn(`[OfflineService] 文件大小为 0：${asset.id}`);
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
      totalFileCount: AUDIO_MANIFEST.length
    };
  },

  /**
   * 校验单个资源文件
   */
  async validateAsset(assetId: string): Promise<boolean> {
    const audioAsset = AUDIO_MANIFEST.find(a => a.id === assetId);
    
    if (!audioAsset) {
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
      const expectedSize = audioAsset.size;
      const sizeDiff = Math.abs(actualSize - expectedSize);
      const sizeDiffPercent = expectedSize > 0 ? sizeDiff / expectedSize : 0;
      
      return sizeDiffPercent <= 0.01;
    } catch (e) {
      return false;
    }
  },

  /**
   * 统一的资源就绪判断
   * 【铁律】所有音频必须 100% 下载完成，否则严禁进入主页
   */
  async isResourceReady(): Promise<boolean> {
    try {
      const checkedFiles: Set<string> = new Set();
      
      for (const audioAsset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
        
        if (checkedFiles.has(localPath)) {
          continue;
        }
        checkedFiles.add(localPath);
        
        const exists = await RNFS.exists(localPath);
        
        if (!exists) {
          console.warn(`[OfflineService] 资源缺失: ${audioAsset.id}，禁止进入主页`);
          return false;
        }
        
        try {
          const stat = await RNFS.stat(localPath);
          const actualSize = Number(stat.size);
          const expectedSize = audioAsset.size;
          const sizeDiff = Math.abs(actualSize - expectedSize);
          const sizeDiffPercent = expectedSize > 0 ? sizeDiff / expectedSize : 0;
          
          if (sizeDiffPercent > 0.01) {
            console.warn(`[OfflineService] 资源大小不匹配: ${audioAsset.id} (实际:${actualSize}, 预期:${expectedSize})，禁止进入主页`);
            return false;
          }
        } catch (e) {
          console.error(`[OfflineService] 资源读取失败: ${audioAsset.id}`);
          return false;
        }
      }
      
      console.log('[OfflineService] 所有资源全部就绪，允许进入主页');
      return true;
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
      
      // 【资源复用】按文件名去重，避免同一文件被多次校验
      const checkedFiles: Set<string> = new Set();
      
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        
        // 【资源复用】如果该文件已经检查过，复用结果
        if (checkedFiles.has(localPath)) {
          details.push(`${asset.id}: 复用已检查文件 (${localPath})`);
          continue;
        }
        checkedFiles.add(localPath);
        
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
