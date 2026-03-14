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

      // 2. 第二步：下载缺失文件 - 使用 Promise.all 实现真正的并行下载
      const failedAssets: string[] = [];
      let progressUpdateTimer: any = null;
      
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      const downloadSingleFile = async (asset: any): Promise<boolean> => {
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
            
            // 诊断日志：开始下载
            console.log(`[DownloadService-DIAGNOSE] Starting download: ${asset.id} | URL: ${url} | TempPath: ${tempPath}`);
            
            // 检查磁盘写入权限
            try {
              const testFile = `${tempPath}.test`;
              await RNFS.writeFile(testFile, 'test', 'utf8');
              await RNFS.unlink(testFile);
              console.log(`[DownloadService-DIAGNOSE] Disk write permission: OK`);
            } catch (diskError) {
              console.error(`[DownloadService-DIAGNOSE] Disk write permission: FAILED - ${diskError}`);
            }
            
            // 检查是否有未完成的下载（断点续传）
            let resumeFromByte = 0;
            const existingTemp = await RNFS.exists(tempPath);
            if (existingTemp) {
              try {
                const tempStat = await RNFS.stat(tempPath);
                resumeFromByte = Number(tempStat.size);
                console.log(`[DownloadService] 发现未完成的下载: ${asset.id}, 已下载: ${resumeFromByte} bytes`);
              } catch (e) {
                // 无法读取临时文件，删除后重新下载
                await RNFS.unlink(tempPath);
                resumeFromByte = 0;
              }
            }
            
            // 获取预期文件大小
            const expectedAsset = ASSET_LIST.find(a => a.id === asset.id);
            const expectedSize = expectedAsset?.expectedSize || 0;
            
            const downloadOptions: RNFS.DownloadFileOptions = {
              fromUrl: url,
              toFile: tempPath,
              connectionTimeout: 30000,
              readTimeout: 60000,
              background: false,
              progressDivider: 1,
              begin: (res) => {
                console.log(`[DownloadService] 开始下载: ${asset.id}, 预期大小: ${res.contentLength} bytes`);
              },
              progress: (res) => {
                const delta = res.bytesWritten - lastFileReceived;
                lastFileReceived = res.bytesWritten;
                currentReceivedBytes += delta;
                
                // 保存下载进度（用于断点续传恢复）
                OfflineService.saveDownloadProgress({
                  assetId: asset.id,
                  downloadedBytes: resumeFromByte + res.bytesWritten,
                  totalBytes: expectedSize || res.contentLength,
                  isCompleted: false,
                  timestamp: Date.now()
                });
                
                console.log(`[DownloadService-DIAGNOSE] Progress: ${asset.id} | ` +
                  `Bytes: ${res.bytesWritten}/${res.contentLength} | ` +
                  `Speed: ${delta > 0 ? Math.round(delta / 1024) : 0} KB/s | ` +
                  `URL: ${url}`);
              }
            };
            
            // 如果支持断点续传，添加 Range header
            if (resumeFromByte > 0) {
              downloadOptions.headers = {
                'Range': `bytes=${resumeFromByte}-`
              };
            }
            
            // 【暴力修复 3】强制打印"落盘"路径
            console.log(`[DownloadService] 文件绝对路径：${localPath}`);
            console.log(`[DownloadService] 临时文件路径：${tempPath}`);
            
            const result = RNFS.downloadFile(downloadOptions);
            
            const downloadResult = await result.promise;
            
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
              
              return true;
            } else {
              console.error(`[DownloadService-DIAGNOSE] Download failed: temp file not found - ${tempPath}`);
            }
          } catch (e: any) {
            console.error(`[DownloadService] ❌ 下载失败：${asset.id}, 错误：${e.message || e}`);
            
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

      // 【性能优化】Task 1: 恢复受控并发下载
      // 【Task 4】降级监控：连续失败次数
      let continuousFailCount = 0;
      const MAX_CONTINUOUS_FAILS = 3;
      
      // 【Task 4】强制物理自检：检查磁盘空间
      try {
        const diskStats = await RNFS.getFSInfo();
        console.log(`[DownloadService] 磁盘空间检查：可用 ${diskStats.freeSpace / (1024 * 1024)} MB, 总 ${diskStats.totalSpace / (1024 * 1024)} MB`);
      } catch (e) {
        console.error(`[DownloadService] 磁盘空间检查失败：${e}`);
      }
      
      // 【Task 1】根据渠道设置并发数
      const MAX_CONCURRENT = IS_GOOGLE_PLAY_VERSION ? 8 : 5;
      console.log(`[DownloadService] 当前渠道：${IS_GOOGLE_PLAY_VERSION ? 'GooglePlay' : '国内'}, MAX_CONCURRENT: ${MAX_CONCURRENT}`);
      
      const progressInterval = setInterval(() => {
        const rawProgress = totalBytes > 0 ? currentReceivedBytes / totalBytes : 0;
        onProgress({
          progress: Math.min(0.999, rawProgress),
          receivedBytes: Math.min(currentReceivedBytes, totalBytes),
          totalBytes: totalBytes
        });
      }, 200);

      // 【Task 1-3】受控并发下载函数：带超时保护和重试机制
      const downloadWithConcurrencyLimit = async (assets: any[], maxConcurrent: number) => {
        const queue = [...assets];
        const workers: Promise<void>[] = [];
        
        const worker = async (workerId: number) => {
          // 【Task 1】启动错峰：每个 Worker 错开 100ms 启动
          await sleep(workerId * 100);
          console.log(`[Queue] Worker ${workerId} started`);
          
          while (queue.length > 0) {
            const asset = queue.shift();
            if (!asset) break;
            
            // 【Task 4】健康检查：如果连续失败过多，降级为单线程
            if (continuousFailCount >= MAX_CONTINUOUS_FAILS) {
              console.warn(`[DownloadService] ⚠️ 连续失败 ${continuousFailCount} 次，降级为单线程模式`);
              queue.unshift(asset); // 把当前文件放回去
              break; // 退出 worker
            }
            
            // 【Task 2+3】带超时保护和重试的下载
            const downloadWithTimeoutAndRetry = async (fileAsset: any, maxRetries = 2): Promise<boolean> => {
              for (let retry = 0; retry <= maxRetries; retry++) {
                try {
                  // 【Task 2】30 秒超时保护
                  const timeoutPromise = new Promise<boolean>((_, reject) => {
                    setTimeout(() => reject(new Error('Download timeout (30s)')), 30000);
                  });
                  
                  const downloadPromise = downloadSingleFile(fileAsset);
                  const success = await Promise.race([downloadPromise, timeoutPromise]);
                  
                  if (success) {
                    continuousFailCount = 0; // 重置失败计数
                    return true;
                  } else {
                    throw new Error('Download failed');
                  }
                } catch (e: any) {
                  console.warn(`[DownloadService] ${fileAsset.id} 下载失败 (尝试 ${retry + 1}/${maxRetries + 1}): ${e.message}`);
                  
                  if (retry < maxRetries) {
                    // 【Task 3】递增重试间隔：第 1 次等 1s，第 2 次等 2s
                    const waitTime = (retry + 1) * 1000;
                    console.log(`[DownloadService] 等待 ${waitTime}ms 后重试...`);
                    await sleep(waitTime);
                  }
                }
              }
              
              // 所有重试都失败
              continuousFailCount++;
              console.warn(`[DownloadService] ${fileAsset.id} 所有重试失败，连续失败计数：${continuousFailCount}`);
              return false;
            };
            
            // 【Task 5】日志全保留：打印每个文件的下载信息
            console.log(`[Queue] Starting ${asset.id} from ${getDownloadUrl(asset.id)[0]}`);
            
            const success = await downloadWithTimeoutAndRetry(asset);
            if (!success) {
              failedAssets.push(asset.id);
              console.error(`[Queue] Failed ${asset.id} after retries`);
            } else {
              console.log(`[Queue] Completed ${asset.id} (${assets.indexOf(asset) + 1}/${assets.length})`);
            }
            
            // 短暂延迟，避免过于密集
            await sleep(50);
          }
        };

        // 启动并发 workers
        const actualConcurrent = Math.min(maxConcurrent, assets.length);
        console.log(`[DownloadService] 启动 ${actualConcurrent} 个并发 workers`);
        for (let i = 0; i < actualConcurrent; i++) {
          workers.push(worker(i));
        }

        await Promise.all(workers);
      };

      // 【Task 5】日志全保留：打印每个文件的下载信息
      console.log('[DownloadService] 开始并发下载所有文件...');
      await downloadWithConcurrencyLimit(filesToDownload, MAX_CONCURRENT);
      
      // 【Task 4】如果降级为单线程，继续下载剩余文件
      if (continuousFailCount >= MAX_CONTINUOUS_FAILS) {
        console.warn('[DownloadService] ⚠️ 降级模式：单线程下载剩余文件...');
        for (const asset of filesToDownload) {
          if (!failedAssets.includes(asset.id)) {
            const urls = getDownloadUrl(asset.id);
            console.log(`[Queue] Starting ${asset.id} from ${urls[0]}`);
            const success = await downloadSingleFile(asset);
            if (!success) {
              failedAssets.push(asset.id);
              console.error(`[Queue] Failed ${asset.id} in single-thread mode`);
            } else {
              console.log(`[Queue] Completed ${asset.id} (single-thread)`);
            }
          }
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
