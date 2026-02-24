import AsyncStorage from '@react-native-async-storage/async-storage'; 
import RNFS from 'react-native-fs'; 
import { 
  AUDIO_MANIFEST, 
  IS_GOOGLE_PLAY_VERSION,
  getDownloadUrl,
  getLocalPath as getLocalPathHelper 
} from '../constants/audioAssets';

// 核心：版本号必须一致
const RESOURCE_VERSION = '1.0.7'; 
const SOURCE_ID = IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE';
const READY_KEY = `RESOURCE_READY_V_${RESOURCE_VERSION}_${SOURCE_ID}`; 

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
      return ready === 'true'; 
    } catch (e) { 
      return false; 
    } 
  }, 
 
  /**
   * Mark resource as ready
   */
  async markAsReady() { 
    try {
      await AsyncStorage.setItem(READY_KEY, 'true'); 
    } catch (e) {
      console.error('Failed to save ready state', e);
    }
  }, 
 
  /**
   * Execute resource validation and download
   */
  async checkAndDownload(onProgress: (p: DownloadProgress) => void) { 
    try { 
      
      let totalBytes = 0;
      let currentReceivedBytes = 0;
      const fileSizes: { [key: string]: number } = {};
      const filesToDownload: any[] = [];

      // 1. 第一步：获取所有文件的真实大小
      // 预扫描：先统计所有文件的总大小（优先使用清单数据，异步更新真实大小）
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const fileExists = await RNFS.exists(localPath);
        
        if (fileExists) {
          const fileStat = await RNFS.stat(localPath);
          const size = Number(fileStat.size);
          fileSizes[asset.id] = size;
          totalBytes += size;
          currentReceivedBytes += size;
        } else {
          filesToDownload.push(asset);
          // 必须使用清单中定义的 size 作为初始基准，确保 totalBytes 相对准确
          const fallbackSize = (asset as any).size || 1024 * 1024; // 兜底 1MB
          fileSizes[asset.id] = fallbackSize;
          totalBytes += fallbackSize;
        }
      }

      // 异步校准：在后台通过 HEAD 请求获取更精准的远程文件大小，但不阻塞主流程
      // 如果校准成功，会更新 totalBytes，从而让进度条更准
      const calibrateSizes = async () => {
        let hasChanges = false;
        
        for (const asset of filesToDownload) {
          const urls = getDownloadUrl(asset.id);
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              
              const response = await fetch(url, { 
                method: 'HEAD',
                signal: controller.signal
              });
              clearTimeout(timeoutId);

              const remoteSize = Number(response.headers.get('content-length'));
              if (remoteSize && remoteSize > 0 && remoteSize !== fileSizes[asset.id]) {
                const diff = remoteSize - fileSizes[asset.id];
                fileSizes[asset.id] = remoteSize;
                totalBytes += diff;
                hasChanges = true;
              }
              break;
            } catch (e) {
              // 静默处理：文件大小校准失败不影响主流程
            }
          }
        }

        if (hasChanges) {
          onProgress({
            progress: totalBytes > 0 ? currentReceivedBytes / totalBytes : 0,
            receivedBytes: currentReceivedBytes,
            totalBytes: totalBytes
          });
        }
      };
      calibrateSizes();

      // 初始进度发送
      onProgress({
        progress: totalBytes > 0 ? currentReceivedBytes / totalBytes : 0,
        receivedBytes: currentReceivedBytes,
        totalBytes: totalBytes
      });

      // 2. 第二步：下载缺失文件
      const failedAssets: string[] = [];
      const downloadWithFallback = async (asset: any) => {
        const urls = getDownloadUrl(asset.id);
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          // 静默切换：主源失败时自动切换到备源
          let lastFileReceived = 0;
          try {
            await RNFS.downloadFile({
              fromUrl: url,
              toFile: getLocalPathHelper(asset.category, asset.filename),
              progressDivider: 5,
              progress: (res) => {
                const delta = res.bytesWritten - lastFileReceived;
                lastFileReceived = res.bytesWritten;
                currentReceivedBytes += delta;

                const rawProgress = totalBytes > 0 ? currentReceivedBytes / totalBytes : 0;
                onProgress({
                  progress: Math.min(0.999, rawProgress),
                  receivedBytes: Math.min(currentReceivedBytes, totalBytes),
                  totalBytes: totalBytes
                });
              }
            }).promise;
            return true;
          } catch (e) {
            // 静默处理：所有源都失败，记录到错误统计
          }
        }
        return false;
      };

      const MAX_CONCURRENT = 4;
      const downloadQueue = [...filesToDownload];
      const activeDownloads: Promise<void>[] = [];
      
      const processNext = async (): Promise<void> => {
        while (downloadQueue.length > 0) {
          const asset = downloadQueue.shift();
          if (!asset) break;
          
          const localPath = getLocalPathHelper(asset.category, asset.filename);
          const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
          
          if (!(await RNFS.exists(dirPath))) {
            await RNFS.mkdir(dirPath);
          }

          const success = await downloadWithFallback(asset);
          if (!success) {
            failedAssets.push(asset.id);
          }
        }
      };

      for (let i = 0; i < Math.min(MAX_CONCURRENT, filesToDownload.length); i++) {
        activeDownloads.push(processNext());
      }

      await Promise.all(activeDownloads);
      
      // 3. Step 3: All complete, force 100%
      onProgress({
        progress: 1,
        receivedBytes: totalBytes,
        totalBytes: totalBytes
      });

      // 静默处理：失败资产已记录到failedAssets数组
    } catch (e) {
      console.error('--- [Validation Error] ---', e);
    } finally { 
      await this.markAsReady(); 
    } 
  }, 
 
  /**
   * Get local audio path (for player use)
   */
  async getLocalPath(id: string) { 
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const path = getLocalPathHelper(asset.category, asset.filename);
    if (await RNFS.exists(path)) return path;
    return null;
  },

  /**
   * Download a single audio file (with retry mechanism)
   */
  async downloadAudio(id: string, urls?: string[], retries = 3): Promise<string | null> {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const isDeepSea = id.includes('deep_sea') || asset.filename.includes('deep_sea');
    const localPath = getLocalPathHelper(asset.category, asset.filename);
    const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
    
    const targetUrls = urls && urls.length > 0 ? urls : getDownloadUrl(id);
    // 静默处理：开始下载音频文件
    for (let u = 0; u < targetUrls.length; u++) {
      const url = targetUrls[u];
      for (let i = 0; i < retries; i++) {
        try {
          if (!(await RNFS.exists(dirPath))) {
            await RNFS.mkdir(dirPath);
          }
          
          await RNFS.downloadFile({
            fromUrl: url,
            toFile: localPath,
            connectionTimeout: 15000,
            readTimeout: 30000,
          }).promise;
          
          if (await RNFS.exists(localPath)) {
            // 静默处理：音频文件下载成功
            return localPath;
          }
        } catch (e) {
          console.error(`[DownloadService] Download failed (Attempt ${i + 1}) ${id}:`, e);
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
          }
        }
      }
      if (u === 0 && targetUrls.length > 1) {
        console.warn('[DownloadService] Primary failed, switching to secondary', { id, url });
      }
    }
    return null;
  }
}; 

export default DownloadService;
