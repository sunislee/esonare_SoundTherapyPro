import AsyncStorage from '@react-native-async-storage/async-storage'; 
import RNFS from 'react-native-fs'; 
import { 
  AUDIO_MANIFEST, 
  REMOTE_RESOURCE_BASE_URL, 
  getLocalPath as getLocalPathHelper 
} from '../constants/audioAssets';

// 核心：版本号必须一致
const RESOURCE_VERSION = '1.0.7'; 
const READY_KEY = 'RESOURCE_READY_V_' + RESOURCE_VERSION; 

export interface DownloadProgress {
  progress: number;
  receivedBytes: number;
  totalBytes: number;
}

export const DownloadService = { 
  /**
   * 检查资源是否已经准备就绪（秒开的关键）
   */
  async isResourceReady(): Promise<boolean> { 
    try { 
      const ready = await AsyncStorage.getItem(READY_KEY); 
      console.log('--- [启动检查] 1.0.7 状态:', ready); 
      return ready === 'true'; 
    } catch (e) { 
      return false; 
    } 
  }, 
 
  /**
   * 标记资源为就绪
   */
  async markAsReady() { 
    try {
      await AsyncStorage.setItem(READY_KEY, 'true'); 
      console.log('--- [存盘] 1.0.7 通关文牒已写入 ---'); 
    } catch (e) {
      console.error('存储状态失败', e);
    }
  }, 
 
  /**
   * 执行资源校验和下载
   */
  async checkAndDownload(onProgress: (p: DownloadProgress) => void) { 
    try { 
      console.log('--- [校验] 开始检查资源清单 ---'); 
      
      let totalBytes = 0;
      let currentReceivedBytes = 0;
      const fileSizes: { [key: string]: number } = {};
      const filesToDownload: any[] = [];

      // 1. 第一步：获取所有文件的真实大小（已存在的查本地，不存在的优先查清单 fallback，再尝试 HEAD）
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const fileExists = await RNFS.exists(localPath);
        
        if (fileExists) {
          const fileStat = await RNFS.stat(localPath);
          const size = Number(fileStat.size);
          fileSizes[asset.id] = size;
          totalBytes += size;
          currentReceivedBytes += size; // 已存在的直接计入已下载
        } else {
          filesToDownload.push(asset);
          // 优先使用清单中预定义的 size 作为 fallback
          let size = (asset as any).size || 0;
          
          try {
            // 尝试通过 HEAD 请求获取更精准的远程文件大小
            const response = await fetch(`${REMOTE_RESOURCE_BASE_URL}${asset.filename}`, { method: 'HEAD' });
            const remoteSize = Number(response.headers.get('content-length'));
            if (remoteSize && remoteSize > 0) {
              size = remoteSize;
            }
          } catch (e) {
            console.warn(`无法获取远程文件大小: ${asset.filename}, 使用 fallback: ${size}`, e);
          }
          
          fileSizes[asset.id] = size;
          totalBytes += size;
        }
      }

      // 初始进度
      onProgress({
        progress: totalBytes > 0 ? currentReceivedBytes / totalBytes : 0,
        receivedBytes: currentReceivedBytes,
        totalBytes: totalBytes
      });

      // 2. 第二步：下载缺失文件
      for (const asset of filesToDownload) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
        
        if (!(await RNFS.exists(dirPath))) {
          await RNFS.mkdir(dirPath);
        }

        console.log(`--- [下载中] ${asset.filename} ---`);
        let lastFileReceived = 0;

        await RNFS.downloadFile({
          fromUrl: `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`,
          toFile: localPath,
          progressDivider: 5, // 减少回调频率，减轻 UI 压力
          progress: (res) => {
            const delta = res.bytesWritten - lastFileReceived;
            lastFileReceived = res.bytesWritten;
            currentReceivedBytes += delta;

            // 下载阶段真实反映进度，不人为限死 99
            // UI 保护：确保进度不会超过 100%
            const rawProgress = totalBytes > 0 ? currentReceivedBytes / totalBytes : 0;
            onProgress({
              progress: Math.min(0.999, rawProgress),
              receivedBytes: Math.min(currentReceivedBytes, totalBytes),
              totalBytes: totalBytes
            });
          }
        }).promise;
      }
      
      // 3. 第三步：全部完成，强制 100%
      onProgress({
        progress: 1,
        receivedBytes: totalBytes,
        totalBytes: totalBytes
      });

    } catch (e) {
      console.error('--- [校验报错] ---', e);
    } finally { 
      await this.markAsReady(); 
    } 
  }, 
 
  /**
   * 获取本地音频路径（供播放器使用）
   */
  async getLocalPath(id: string) { 
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const path = getLocalPathHelper(asset.category, asset.filename);
    if (await RNFS.exists(path)) return path;
    return null;
  },

  /**
   * 单独下载某个音频文件 (带重试机制)
   */
  async downloadAudio(id: string, url: string, retries = 3): Promise<string | null> {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const localPath = getLocalPathHelper(asset.category, asset.filename);
    const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
    
    for (let i = 0; i < retries; i++) {
      try {
        if (!(await RNFS.exists(dirPath))) {
          await RNFS.mkdir(dirPath);
        }
        
        console.log(`[DownloadService] 正在下载 (${i + 1}/${retries}): ${asset.filename}`);
        await RNFS.downloadFile({
          fromUrl: url || `${REMOTE_RESOURCE_BASE_URL}${asset.filename}`,
          toFile: localPath,
          connectionTimeout: 15000,
          readTimeout: 30000,
        }).promise;
        
        if (await RNFS.exists(localPath)) {
          return localPath;
        }
      } catch (e) {
        console.error(`[DownloadService] 下载失败 (第 ${i + 1} 次重试) ${id}:`, e);
        if (i < retries - 1) {
          // 指数退避重试
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    return null;
  }
}; 

export default DownloadService;