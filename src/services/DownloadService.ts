import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import {
  AUDIO_MANIFEST,
  IS_GOOGLE_PLAY_VERSION,
  getDownloadUrl,
  getLocalPath as getLocalPathHelper,
  GLOBAL_TOTAL_SIZE,
  ASSET_LIST
} from '../constants/audioAssets';

// 核心：版本号必须一致
const RESOURCE_VERSION = '1.0.7'; 
const SOURCE_ID = IS_GOOGLE_PLAY_VERSION ? 'GITHUB' : 'GITEE';
const READY_KEY = `RESOURCE_READY_V_${RESOURCE_VERSION}_${SOURCE_ID}`; 

// 【全局状态】下载任务控制器，用于强制中断
let globalAbortController: AbortController | null = null;
let isDownloading = false;

export interface DownloadProgress {
  progress: number;
  receivedBytes: number;
  totalBytes: number;
}

export const DownloadService = { 
  /**
   * 【暴力重置】清空所有错误状态和下载任务
   */
  reset() {
    console.log('[DownloadService] ====== 强制重置开始 ======');
    
    // 1. 中断当前下载
    if (globalAbortController) {
      console.log('[DownloadService] 中断当前下载任务');
      globalAbortController.abort();
      globalAbortController = null;
    }
    
    // 2. 重置下载状态
    isDownloading = false;
    
    // 3. 清理临时文件
    this.cleanTempFiles();
    
    console.log('[DownloadService] ====== 强制重置完成 ======');
  },

  /**
   * 清理临时文件
   */
  async cleanTempFiles() {
    try {
      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const tempPath = `${localPath}.tmp`;
        if (await RNFS.exists(tempPath)) {
          await RNFS.unlink(tempPath);
          console.log(`[DownloadService] 清理临时文件: ${tempPath}`);
        }
      }
    } catch (e) {
      console.error('[DownloadService] 清理临时文件失败:', e);
    }
  },

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
    // 【防止重复启动】
    if (isDownloading) {
      console.log('[DownloadService] 下载已在进行中，忽略重复调用');
      return;
    }
    
    isDownloading = true;
    globalAbortController = new AbortController();
    
    try {
      // 【网络检查】下载开始前检查网络状态
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected === false) {
        console.error('[DownloadService] 无网络连接，阻止下载任务启动');
        isDownloading = false;
        throw new Error('No Network');
      }

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

      console.log(`[DownloadService] 需要下载 ${filesToDownload.length} 个文件，已有 ${AUDIO_MANIFEST.length - filesToDownload.length} 个文件`);

      // 初始进度发送
      onProgress({
        progress: totalBytes > 0 ? currentReceivedBytes / totalBytes : 0,
        receivedBytes: currentReceivedBytes,
        totalBytes: totalBytes
      });

      // 2. 第二步：下载缺失文件 - 使用 Promise.all 实现真正的并行下载
      const failedAssets: string[] = [];
      
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      const downloadSingleFile = async (asset: any, threadId: number): Promise<boolean> => {
        const urls = getDownloadUrl(asset.id);
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
        
        if (!(await RNFS.exists(dirPath))) {
          await RNFS.mkdir(dirPath);
        }

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          let lastFileReceived = 0;
          try {
            const tempPath = `${localPath}.tmp`;
            
            // 【线程启动日志】
            console.log(`[Thread Start] 线程 ${threadId} 正在请求块数据: ${asset.id} | URL: ${url}`);
            
            // 检查是否被中断
            if (globalAbortController?.signal.aborted) {
              console.log(`[Thread Abort] 线程 ${threadId} 被中断: ${asset.id}`);
              return false;
            }
            
            if (await RNFS.exists(tempPath)) {
              await RNFS.unlink(tempPath);
            }
            
            const result = RNFS.downloadFile({
              fromUrl: url,
              toFile: tempPath,
              connectionTimeout: 30000,
              readTimeout: 60000,
              background: false, // 强制禁用后台下载，确保前台模式
              progressDivider: 1, // 降低进度回调间隔，获取更精确的速度数据
              progress: (res) => {
                const delta = res.bytesWritten - lastFileReceived;
                lastFileReceived = res.bytesWritten;
                currentReceivedBytes += delta;
                
                // 【线程进度日志】
                if (delta > 0) {
                  console.log(`[Thread ${threadId}] ${asset.id} | 速度: ${Math.round(delta / 1024)} KB/s | 进度: ${res.bytesWritten}/${res.contentLength}`);
                }
              }
            });
            
            await result.promise;
            
            if (await RNFS.exists(tempPath)) {
              const fileSize = await RNFS.stat(tempPath);
              console.log(`[Thread ${threadId}] 下载完成: ${asset.id} | 大小: ${fileSize.size} bytes`);
              await RNFS.moveFile(tempPath, localPath);
              return true;
            }
          } catch (e) {
            console.warn(`[Thread ${threadId}] 下载失败，尝试备用源: ${asset.id}`);
            const tempPath = `${localPath}.tmp`;
            if (await RNFS.exists(tempPath)) {
              try { await RNFS.unlink(tempPath); } catch {}
            }
          }
        }
        return false;
      };

      // 根据渠道设置并发数：Google Play 8线程，国内渠道 5线程
      const MAX_CONCURRENT = IS_GOOGLE_PLAY_VERSION ? 8 : 5;
      console.log(`[DownloadService] 启动下载引擎: 渠道=${IS_GOOGLE_PLAY_VERSION ? 'GooglePlay' : '国内'}, 并发数=${MAX_CONCURRENT}`);
      
      const progressInterval = setInterval(() => {
        // 【强制】分母必须使用 GLOBAL_TOTAL_SIZE，禁止使用 totalBytes
        const rawProgress = GLOBAL_TOTAL_SIZE > 0 ? currentReceivedBytes / GLOBAL_TOTAL_SIZE : 0;
        onProgress({
          progress: Math.min(0.999, rawProgress),
          receivedBytes: Math.min(currentReceivedBytes, GLOBAL_TOTAL_SIZE),
          totalBytes: GLOBAL_TOTAL_SIZE
        });
      }, 200);

      const downloadWithConcurrencyLimit = async () => {
        const queue = [...filesToDownload];
        const workers: Promise<void>[] = [];
        
        const worker = async (workerId: number) => {
          // 【线程启动】随机延迟，避免同时请求
          const delay = Math.floor(Math.random() * 300) + 50;
          console.log(`[Worker ${workerId}] 线程启动，延迟 ${delay}ms`);
          await sleep(delay);
          
          while (queue.length > 0) {
            // 检查是否被中断
            if (globalAbortController?.signal.aborted) {
              console.log(`[Worker ${workerId}] 线程被中断，退出`);
              break;
            }
            
            const asset = queue.shift();
            if (!asset) break;
            
            console.log(`[Worker ${workerId}] 开始下载: ${asset.id}`);
            const success = await downloadSingleFile(asset, workerId);
            
            if (!success) {
              failedAssets.push(asset.id);
              console.error(`[Worker ${workerId}] 下载失败: ${asset.id}`);
            }
            
            // 短暂休息，避免过载
            await sleep(50);
          }
          
          console.log(`[Worker ${workerId}] 线程结束`);
        };

        // 启动所有工作线程
        const concurrentCount = Math.min(MAX_CONCURRENT, filesToDownload.length);
        console.log(`[DownloadService] 启动 ${concurrentCount} 个下载线程...`);
        
        for (let i = 0; i < concurrentCount; i++) {
          workers.push(worker(i));
        }

        await Promise.all(workers);
        console.log(`[DownloadService] 所有线程执行完毕`);
      };

      await downloadWithConcurrencyLimit();
      clearInterval(progressInterval);
      
      // 3. Step 3: All complete, force 100%
      onProgress({
        progress: 1,
        receivedBytes: GLOBAL_TOTAL_SIZE,
        totalBytes: GLOBAL_TOTAL_SIZE
      });

      console.log(`[DownloadService] 下载完成，成功: ${filesToDownload.length - failedAssets.length}/${filesToDownload.length}`);
      
      // 静默处理：失败资产已记录到failedAssets数组
    } catch (e) {
      console.error('--- [Validation Error] ---', e);
      throw e; // 重新抛出错误，让调用方处理
    } finally { 
      isDownloading = false;
      globalAbortController = null;
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
            connectionTimeout: 30000,
            readTimeout: 60000,
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
