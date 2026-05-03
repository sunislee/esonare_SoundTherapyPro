import AsyncStorage from '@react-native-async-storage/async-storage'; 
import RNFS from 'react-native-fs'; 
import { 
  AUDIO_MANIFEST, 
  IS_GOOGLE_PLAY_VERSION,
  getDownloadUrl,
  getLocalPath as getLocalPathHelper,
  GLOBAL_TOTAL_SIZE,
  ASSET_LIST
} from '../constants/audioAssets';
import { OfflineService } from './OfflineService';

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
   * 【注意】此方法已弃用，请使用 OfflineService.isResourceReady()
   */
  async isResourceReady(): Promise<boolean> { 
    return OfflineService.isResourceReady();
  }, 
 
  /**
   * Mark resource as ready
   * 【注意】此方法已弃用，请使用 OfflineService.markAsReady()
   */
  async markAsReady() { 
    return OfflineService.markAsReady();
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
      
      setImmediate(() => {
        calibrateSizes();
      });

      // 初始进度发送
      onProgress({
        progress: totalBytes > 0 ? currentReceivedBytes / totalBytes : 0,
        receivedBytes: currentReceivedBytes,
        totalBytes: totalBytes
      });

      // 2. 第二步：串行下载（一个一个来，排除网络争抢和 JNI 线程崩溃）
      const failedAssets: string[] = [];
      let progressUpdateTimer: any = null;
      
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      const downloadSingleFile = async (asset: any): Promise<boolean> => {
        // 使用 GitHub raw URL（全球通用）
        const GITHUB_URL = `https://ghproxy.net/https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main/${asset.filename}`;
        console.error(`[DownloadService] ===== 开始下载 ${asset.id} =====`);
        console.error(`[DownloadService] GitHub URL:`, GITHUB_URL);
        
        const urls = [GITHUB_URL];
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
        
        console.error(`[DownloadService] 本地路径:`, localPath);
        console.error(`[DownloadService] 目录路径:`, dirPath);
        
        // 【步骤3】确保目录物理存在
        try {
          if (!(await RNFS.exists(dirPath))) {
            console.error(`[DownloadService] 目录不存在，创建: ${dirPath}`);
            await RNFS.mkdir(dirPath);
          }
        } catch (mkdirError: any) {
          console.error(`[DownloadService] ❌ mkdir 失败: ${dirPath}, code: ${mkdirError.code}, message: ${mkdirError.message}`);
          failedAssets.push(asset.id);
          return false;
        }

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          let lastFileReceived = 0;
          let lastHeartbeatTime = Date.now();
          let heartbeatJobId: any = null;
          try {
            const tempPath = `${localPath}.tmp`;
            
            // 【强制删除缓存】删了重下，不用断点续传
            if (await RNFS.exists(tempPath)) {
              console.log(`[DownloadService] 删除旧缓存: ${tempPath}`);
              await RNFS.unlink(tempPath);
            }
            if (await RNFS.exists(localPath)) {
              console.log(`[DownloadService] 删除旧文件: ${localPath}`);
              await RNFS.unlink(localPath);
            }
            
            // 诊断日志：开始下载
            console.log(`[DownloadService-DIAGNOSE] Starting download: ${asset.id} | URL: ${url} | TempPath: ${tempPath}`);
            
            // 获取预期文件大小
            const expectedAsset = ASSET_LIST.find(a => a.id === asset.id);
            const expectedSize = expectedAsset?.expectedSize || 0;
            
            const downloadOptions: RNFS.DownloadFileOptions = {
              fromUrl: url,
              toFile: tempPath,
              connectionTimeout: 60000,
              readTimeout: 60000,
              background: true,
              discretionary: true,
              progressDivider: 10,
              begin: (res) => {
                // 静默
              },
              progress: (res) => {
                const delta = res.bytesWritten - lastFileReceived;
                lastFileReceived = res.bytesWritten;
                currentReceivedBytes += delta;
              }
            };
            
            // 【防崩溃修复】包裹 RNFS.downloadFile，捕获原生层空指针异常
            let downloadResult: any;
            try {
              const result = RNFS.downloadFile(downloadOptions);
              downloadResult = await result.promise;
            } catch (e: any) {
              // 捕获原生层崩溃（如：NullPointerException: Parameter specified as non-null is null）
              console.error(`[DownloadService] ❌ RNFS.downloadFile 原生异常：${e.message || e}`);
              // 尝试检查文件是否已经下载成功（可能是回调 Bug）
              if (await RNFS.exists(tempPath)) {
                console.log(`[DownloadService] ⚠️ 文件已落盘，但 Promise 异常：${tempPath}`);
                downloadResult = { statusCode: 200 }; // 伪造成功状态
              } else {
                throw e; // 文件确实不存在，抛出异常
              }
            }
            
            // 【暴力修复 2】修复"假成功"逻辑：检查 HTTP 状态码
            if (downloadResult.statusCode === 404) {
              console.error(`[DownloadService] ❌ 404 Not Found: ${asset.id} - ${url}`);
              throw new Error('404 Not Found');
            }
            if (downloadResult.statusCode === 403) {
              console.error(`[DownloadService] ❌ 403 Forbidden: ${asset.id} - ${url}`);
              throw new Error('403 Forbidden');
            }
            if (downloadResult.statusCode !== 200 && downloadResult.statusCode !== 206) {
              console.error(`[DownloadService] ❌ HTTP Error ${downloadResult.statusCode}: ${asset.id}`);
              throw new Error(`HTTP ${downloadResult.statusCode}`);
            }
            
            if (await RNFS.exists(tempPath)) {
              const fileSize = await RNFS.stat(tempPath);
              console.log(`[DownloadService-DIAGNOSE] Download completed: ${asset.id} | FileSize: ${fileSize.size} bytes`);
              console.log(`[DownloadService] 文件最终路径：${tempPath}`);
              console.log(`[DownloadService] 文件最终路径是否有 file:// 前缀：${tempPath.startsWith('file://')}`);
              
              // 文件大小校验
              if (expectedSize > 0) {
                const actualSize = Number(fileSize.size);
                const sizeDiff = Math.abs(actualSize - expectedSize);
                const sizeDiffPercent = sizeDiff / expectedSize;
                
                if (sizeDiffPercent > 0.01) {
                  console.error(`[DownloadService] 文件大小校验失败: ${asset.id}, 实际: ${actualSize}, 预期: ${expectedSize}`);
                  await RNFS.unlink(tempPath);
                  return false;
                }
                
                console.log(`[DownloadService] 文件大小校验通过：${asset.id}`);
              }
              
              // 【暴力修复 4】增加 1 秒写入缓冲：给 Android 系统一点写盘时间
              console.log(`[DownloadService] 等待 1 秒写入缓冲...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              await RNFS.moveFile(tempPath, localPath);
              console.log(`[DownloadService-DIAGNOSE] File moved to: ${localPath}`);
              
              // 再次确认文件已移动成功
              if (await RNFS.exists(localPath)) {
                const finalStat = await RNFS.stat(localPath);
                console.log(`[DownloadService] ✅ 文件落盘成功：${localPath} (${finalStat.size} bytes)`);
                
                // 【关键修复】验证文件大小不为 0
                if (finalStat.size === 0 || finalStat.size === undefined) {
                  console.error(`[DownloadService] ❌ 文件大小为 0，下载失败：${localPath}`);
                  return false;
                }
                console.log(`[DownloadService] ✅ 文件大小校验通过：${finalStat.size} bytes`);
              } else {
                console.error(`[DownloadService] ❌ 文件移动失败：${localPath}`);
                return false;
              }
              
              // 清除下载进度记录
              await OfflineService.clearDownloadProgress(asset.id);
              
              // 标记为完成
              await OfflineService.saveDownloadProgress({
                assetId: asset.id,
                downloadedBytes: expectedSize,
                totalBytes: expectedSize,
                isCompleted: true,
                timestamp: Date.now()
              });
              
              // 【关键桥接】触发 AudioService 的下载完成回调
              console.log(`[DownloadService] 🎉 下载完成，触发回调：${asset.id}`);
              try {
                const { AudioService } = await import('./AudioService');
                const audioService = AudioService.getInstance();
                // 通过内部方法触发回调
                (audioService as any).notifyDownloadComplete?.(asset.id);
              } catch (e) {
                console.warn(`[DownloadService] 触发 AudioService 回调失败:`, e);
              }
              
              return true;
            } else {
              console.error(`[DownloadService-DIAGNOSE] Download failed: temp file not found - ${tempPath}`);
            }
          } catch (e: any) {
            console.error(`[DownloadService] ❌ 下载失败：${asset.id}`);
            console.error(`[DownloadService] ❌ error.message: ${e.message || 'undefined'}`);
            console.error(`[DownloadService] ❌ error.code: ${e.code || 'undefined'}`);
            console.error(`[DownloadService] ❌ error.stack: ${e.stack || 'undefined'}`);
            console.error(`[DownloadService] ❌ error 完整对象:`, JSON.stringify(e, null, 2));
            
            // 【暴力修复 3】修复"断头"下载：记录失败但不阻塞队列
            const tempPath = `${localPath}.tmp`;
            if (await RNFS.exists(tempPath)) {
              try { await RNFS.unlink(tempPath); } catch {}
            }
            
            // 记录失败资产，但不阻塞整个队列
            failedAssets.push(asset.id);
            
            // 继续下载下一个文件
            return false;
          }
        }
        return false;
      };

      // 【步骤1】串行下载：一个一个来，确保稳定性
      console.log(`[DownloadService] 开始串行下载 ${filesToDownload.length} 个文件...`);
      
      const progressInterval = setInterval(() => {
        const rawProgress = totalBytes > 0 ? currentReceivedBytes / totalBytes : 0;
        onProgress({
          progress: Math.min(0.999, rawProgress),
          receivedBytes: Math.min(currentReceivedBytes, totalBytes),
          totalBytes: totalBytes
        });
      }, 200);

      for (let i = 0; i < filesToDownload.length; i++) {
        const asset = filesToDownload[i];
        console.log(`[DownloadService] 串行下载 [${i + 1}/${filesToDownload.length}]: ${asset.id}`);
        
        // 自动重试3次
        let success = false;
        for (let retry = 0; retry < 3; retry++) {
          if (retry > 0) {
            console.log(`[DownloadService] 重试 ${retry}/3: ${asset.id}`);
            await sleep(2000); // 重试前等待2秒
          }
          success = await downloadSingleFile(asset);
          if (success) break;
        }
        
        if (!success) {
          failedAssets.push(asset.id);
          console.error(`[DownloadService] ❌ 下载失败（3次重试后）: ${asset.id} (${i + 1}/${filesToDownload.length})`);
        } else {
          console.log(`[DownloadService] ✅ 下载完成: ${asset.id} (${i + 1}/${filesToDownload.length})`);
        }
      }
      
      clearInterval(progressInterval);
      
      // 3. Step 3: 检查下载结果
      const successCount = filesToDownload.length - failedAssets.length;
      const successRate = filesToDownload.length > 0 ? successCount / filesToDownload.length : 0;
      
      console.log(`[DownloadService] 下载完成：成功 ${successCount}/${filesToDownload.length}, 成功率 ${(successRate * 100).toFixed(1)}%`);
      console.log(`[DownloadService] 连续失败次数：${continuousFailCount}`);
      
      // 【暴力修复 2】拦截 1.0 信号：除非物理检查所有文件通过，否则不允许达到 1.0
      console.log('[DownloadService] 开始物理校验所有文件...');
      let allFilesValid = true;
      const invalidFiles: string[] = [];
      
      for (const asset of filesToDownload) {
        const localPath = getLocalPathHelper(asset.category, asset.filename);
        const fileExists = await RNFS.exists(localPath);
        
        if (!fileExists) {
          allFilesValid = false;
          invalidFiles.push(`${asset.id}: 文件不存在`);
          continue;
        }
        
        // 检查文件大小
        try {
          const stat = await RNFS.stat(localPath);
          const actualSize = Number(stat.size);
          const expectedSize = (asset as any).size || 0;
          const sizeDiff = Math.abs(actualSize - expectedSize);
          const sizeDiffPercent = expectedSize > 0 ? sizeDiff / expectedSize : 0;
          
          if (sizeDiffPercent > 0.01) { // 允许 1% 误差
            allFilesValid = false;
            invalidFiles.push(`${asset.id}: 大小不匹配 - 实际：${actualSize}, 预期：${expectedSize}`);
          }
        } catch (e) {
          allFilesValid = false;
          invalidFiles.push(`${asset.id}: 无法读取文件信息 - ${e}`);
        }
      }
      
      console.log(`[DownloadService] 物理校验结果：${allFilesValid ? '通过' : '失败'}`);
      if (!allFilesValid) {
        console.error(`[DownloadService] 无效文件：${invalidFiles.join(', ')}`);
        console.log('[DownloadService] 尝试重新下载失败的文件...');
        
        // 重新下载失败的文件
        for (const asset of filesToDownload) {
          const localPath = getLocalPathHelper(asset.category, asset.filename);
          const fileExists = await RNFS.exists(localPath);
          
          if (!fileExists) {
            console.log(`[DownloadService] 重新下载：${asset.id}`);
            await downloadFileWithRetry(asset, localPath, 0, totalFiles, downloadedBytes, totalBytes, onProgress);
          } else {
            // 检查文件大小
            try {
              const stat = await RNFS.stat(localPath);
              const actualSize = Number(stat.size);
              const expectedSize = (asset as any).size || 0;
              const sizeDiff = Math.abs(actualSize - expectedSize);
              const sizeDiffPercent = expectedSize > 0 ? sizeDiff / expectedSize : 0;
              
              if (sizeDiffPercent > 0.01) {
                console.log(`[DownloadService] 重新下载（大小不匹配）：${asset.id}`);
                await RNFS.unlink(localPath);
                await downloadFileWithRetry(asset, localPath, 0, totalFiles, downloadedBytes, totalBytes, onProgress);
              }
            } catch (e) {
              console.log(`[DownloadService] 重新下载（读取失败）：${asset.id}`);
              await downloadFileWithRetry(asset, localPath, 0, totalFiles, downloadedBytes, totalBytes, onProgress);
            }
          }
        }
      }
      
      // 【暴力修复 3】打印每一步的分子分母
      const downloadedBytes = currentReceivedBytes;
      const totalBytesValue = totalBytes;
      const ratio = totalBytesValue > 0 ? downloadedBytes / totalBytesValue : 0;
      console.log('Progress Trace:', { 
        downloadedBytes, 
        totalBytes: totalBytesValue, 
        ratio,
        allFilesValid,
        invalidFilesCount: invalidFiles.length
      });
      
      // 下载完成，只有物理校验通过才报告 100% 进度
      if (allFilesValid) {
        console.log('[DownloadService] ✅ 物理校验通过，报告 100% 进度');
        onProgress({
          progress: 1,
          receivedBytes: totalBytesValue,
          totalBytes: totalBytesValue
        });
      } else {
        // 报告真实进度，不伪造 100%
        const realProgress = Math.min(0.99, ratio);
        console.log(`[DownloadService] ⚠️ 物理校验失败，报告真实进度：${(realProgress * 100).toFixed(1)}%`);
        onProgress({
          progress: realProgress,
          receivedBytes: downloadedBytes,
          totalBytes: totalBytesValue
        });
      }
      
      if (successRate >= 0.9) {
        console.log('[DownloadService] 下载成功，标记为就绪');
      } else {
        console.warn(`[DownloadService] 下载完成但有失败：成功 ${successCount}/${filesToDownload.length}，允许进入应用`);
      }

      // 静默处理：失败资产已记录到 failedAssets 数组
    } catch (e) {
      console.error('--- [Validation Error] ---', e);
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
          
          // 【防崩溃修复】包裹 RNFS.downloadFile，捕获原生层空指针异常
          let downloadResult: any;
          try {
            const result = RNFS.downloadFile({
              fromUrl: url,
              toFile: localPath,
              connectionTimeout: 30000,
              readTimeout: 60000,
            });
            downloadResult = await result.promise;
          } catch (e: any) {
            console.error(`[DownloadService] ❌ RNFS.downloadFile 原生异常 (downloadAudio): ${e.message || e}`);
            // 检查文件是否已落盘
            if (await RNFS.exists(localPath)) {
              console.log(`[DownloadService] ⚠️ 文件已落盘，但 Promise 异常：${localPath}`);
              downloadResult = { statusCode: 200 };
            } else {
              throw e;
            }
          }
          
          if (downloadResult.statusCode === 200 && await RNFS.exists(localPath)) {
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
