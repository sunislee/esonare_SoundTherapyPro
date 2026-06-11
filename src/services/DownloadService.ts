import RNFS from 'react-native-fs';
import pLimit from 'p-limit';
import {
  AUDIO_MANIFEST,
  IS_GOOGLE_PLAY_VERSION,
  getLocalPath as getLocalPathHelper,
  GLOBAL_TOTAL_SIZE,
  ASSET_LIST,
  JSDDELIVR_URL,
  STATICALLY_URL,
  GITHUB_URL,
  GHPROXY_NET_URL,
  MIRROR_GHPROXY_URL,
  KK_GITHUB_URL,
} from '../constants/audioAssets';

const DOWNLOAD_CONNECTION_TIMEOUT = 8000;
const DOWNLOAD_READ_TIMEOUT = 15000;
const DOWNLOAD_STALL_TIMEOUT = 10000;
const UI_UPDATE_INTERVAL_MS = 2000;
const MAX_RETRIES_PER_FILE = 5;
const MAX_CONCURRENT_TASKS = 6;

export interface DownloadProgress {
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  statusText?: string;
}

interface FileStatus {
  assetId: string;
  expectedSize: number;
  maxConfirmedBytes: number;
  status: 'pending' | 'downloading' | 'success' | 'failed';
}

class DownloadServiceImpl {
  private boostPrioritySceneId: string | null = null;
  private onProgressCallback: ((sceneId: string, progress: number) => void) | null = null;
  private onCompleteCallback: ((sceneId: string) => void) | null = null;
  private onFileDownloadedCallback: ((assetId: string) => void) | null = null;

  /**
   * 清理所有回调引用，防止内存泄漏
   */
  clearCallbacks(): void {
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
    this.onFileDownloadedCallback = null;
    console.log('[DownloadService] 🧹 回调已清理');
  }

  async isResourceReady(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async markAsReady() {
    return Promise.resolve();
  }

  async clearReadyFlag() {
    return Promise.resolve();
  }

  async forceSkipCheckAndEnter() {
    console.log('[App-Download] 🔓 强制跳过校验，直接进入App');
    await Promise.resolve();
  }

  async silentBackgroundDownload(): Promise<{success: number; failed: number}> {
    console.log(`[App-Download] 🚨🚨🚨 [SILENT_DOWNLOAD_START] 启动后台静默下载... 🚨🚨🚨`);
    
    const PRIORITY_SCENES = [
      'nature_ocean',
      'nature_forest',
      'nature_deep_sea',
      'nature_misty_forest',
      'healing_zen_bowl',
      'oriental_zen_monastery',
      'life_rain_boat',
      'brainwave_alpha',
    ];
    
    const CONST_TOTAL_SIZE = GLOBAL_TOTAL_SIZE > 0 ? GLOBAL_TOTAL_SIZE : ASSET_LIST.reduce((sum, a) => sum + a.expectedSize, 0);
    const fileStatusMap = new Map<string, FileStatus>();
    const allFilesToDownload: any[] = [];
    let completedBytes = 0;

    console.log(`[App-Download] 🔍 [BUILD_QUEUE] 遍历 ASSET_LIST，共 ${ASSET_LIST.length} 个资产...`);
    
    for (const asset of ASSET_LIST) {
      const manifestItem = AUDIO_MANIFEST.find(a => a.id === asset.id);
      if (!manifestItem) {
        console.log(`[App-Download] ⚠️ [BUILD_QUEUE] 跳过 ${asset.id}: 未找到 manifestItem`);
        continue;
      }

      const expectedSize = asset.expectedSize;
      const localPath = getLocalPathHelper(manifestItem.category, manifestItem.filename);

      if (await RNFS.exists(localPath)) {
        try {
          const stat = await RNFS.stat(localPath);
          if (stat.size >= expectedSize * 0.9) {
            console.log(`[App-Download] ✅ [BUILD_QUEUE] 跳过已下载: ${manifestItem.filename} (${stat.size}/${expectedSize})`);
            completedBytes += stat.size;
            continue;
          } else {
            console.log(`[App-Download] ⚠️ [BUILD_QUEUE] 文件不完整: ${manifestItem.filename} (${stat.size}/${expectedSize})`);
          }
        } catch (e) {
          console.error(`[App-Download] ❌ [BUILD_QUEUE] 检查文件失败: ${localPath}`, e);
        }
      } else {
        console.log(`[App-Download] 🆕 [BUILD_QUEUE] 新文件待下载: ${manifestItem.filename} → ${localPath}`);
      }

      allFilesToDownload.push({ 
        asset, 
        manifestItem, 
        localPath, 
        expectedSize,
        priority: PRIORITY_SCENES.indexOf(asset.id)
      });
      fileStatusMap.set(asset.id, { assetId: asset.id, expectedSize, maxConfirmedBytes: 0, status: 'pending' });
    }

    console.log(`[App-Download] 📦 [BUILD_QUEUE] 完成！共 ${allFilesToDownload.length} 个文件待下载`);

    const sortWithBoost = () => {
      allFilesToDownload.sort((a, b) => {
        if (this.boostPrioritySceneId === a.asset.id) return -1;
        if (this.boostPrioritySceneId === b.asset.id) return 1;
        if (a.priority >= 0 && b.priority < 0) return -1;
        if (a.priority < 0 && b.priority >= 0) return 1;
        return a.priority - b.priority;
      });
      
      console.log(`[App-Download] 📋 [SORT_QUEUE] 下载队列已优化：共 ${allFilesToDownload.length} 个文件`);
      if (this.boostPrioritySceneId) {
        console.log(`[App-Download] ⚡ [SORT_QUEUE] 当前插队场景: ${this.boostPrioritySceneId}`);
      }
    };
    
    sortWithBoost();

    // 🔥 临时文件清理：防止残留 .tmp 文件干扰下次校验
    console.log(`[App-Download] 🧹 [CLEANUP_TMP] 开始清理残留临时文件...`);
    for (const asset of ASSET_LIST) {
      const manifestItem = AUDIO_MANIFEST.find(a => a.id === asset.id);
      if (manifestItem) {
        const localPath = getLocalPathHelper(manifestItem.category, manifestItem.filename);
        const tempPath = `${localPath}.tmp`;
        try {
          if (await RNFS.exists(tempPath)) {
            await RNFS.unlink(tempPath);
            console.log(`[App-Download] 🧹 [CLEANUP_TMP] 已清理: ${manifestItem.filename}`);
          }
        } catch (e) {
          console.error(`[App-Download] ❌ [CLEANUP_TMP] 清理失败: ${tempPath}`, e);
        }
      }
    }
    console.log(`[App-Download] ✅ [CLEANUP_TMP] 临时文件清理完成`);

    if (allFilesToDownload.length === 0) {
      console.log('[App-Download] ✅ 所有资源已存在，无需下载');
      return { success: 0, failed: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    // 🔥 使用 p-limit 实现并发控制（最多4个并发任务）
    const limit = pLimit(4);

    const downloadSingleFile = async (item: any): Promise<void> => {
      console.log(`[App-Download] 📡 [WORKER_LIMITED] 启动（并发受限）: ${item.manifestItem.filename}`);
      
      const { asset, manifestItem, localPath, expectedSize } = item;
      const status = fileStatusMap.get(asset.id)!;
      const tempPath = `${localPath}.tmp`;
      const urls = getDownloadUrls(manifestItem.filename);

      console.log(`[App-Download] 🔥 [WORKER_LIMITED] 开始处理: ${manifestItem.filename}`);
      console.log(`[App-Download] 📂 [WORKER_LIMITED] 本地路径: ${localPath}`);

      for (let attempt = 0; attempt < MAX_RETRIES_PER_FILE; attempt++) {
        if (attempt > 0) {
          console.log(`[App-Download] 🤫 [RETRY] 静默重试 ${manifestItem.filename} (${attempt + 1}/5)`);
          await new Promise<void>(resolve => setTimeout(resolve as unknown as () => void, 5000));
        }

        status.status = 'downloading';

        for (const url of urls) {
          try {
            console.log(`[App-Download] 🌐 [DOWNLOAD_START] 开始下载: ${manifestItem.filename}`);
            console.log(`[App-Download] 🌐 [DOWNLOAD_START] URL: ${url}`);

            const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
            await RNFS.mkdir(dirPath);

            const downloadResult = await RNFS.downloadFile({
              fromUrl: url,
              toFile: tempPath,
              connectionTimeout: DOWNLOAD_CONNECTION_TIMEOUT,
              readTimeout: DOWNLOAD_READ_TIMEOUT,
              background: false,
              discretionary: false,
              progressDivider: 5,
              progress: (res) => {
                if (status.status === 'downloading') {
                  status.maxConfirmedBytes = res.bytesWritten || 0;
                }
              },
            }).promise;

             console.log(`[App-Download] 📊 [DOWNLOAD_RESULT] 状态码: ${downloadResult.statusCode}`);

             if (downloadResult.statusCode === 200 || downloadResult.statusCode === 201) {
              const stat = await RNFS.stat(tempPath);
              console.log(`[App-Download] 📊 [DOWNLOAD_RESULT] 临时文件大小: ${stat.size}`);
              
              if (stat.size >= expectedSize * 0.8) {
                console.log(`[App-Download] ✅ [DOWNLOAD_RESULT] 文件大小符合要求，移动到最终路径`);
                await RNFS.moveFile(tempPath, localPath);
                status.status = 'success';
                successCount++;
                
                if (this.onProgressCallback) {
                  this.onProgressCallback(asset.id, 100);
                }
                if (this.onCompleteCallback) {
                  try {
                    this.onCompleteCallback(asset.id);
                  } catch (cbErr: any) {
                    console.error(`[App-Download] ❌ [COMPLETION_CB_ERROR] 完成回调失败: ${cbErr.message}`);
                  }
                }
                
                // 移除单文件完成时的 clearCallbacks，避免中断批量任务进度
                
                console.log(`[App-Download] ✅✅✅ [SILENT_COMPLETE] 静默完成: ${manifestItem.filename}`);
                break;
              } else {
                console.log(`[App-Download] ⚠️ [DOWNLOAD_RESULT] 文件大小不足: ${stat.size} < ${expectedSize * 0.8}`);
                await RNFS.unlink(tempPath);
              }
            } else {
              console.log(`[App-Download] ⚠️ [DOWNLOAD_RESULT] 状态码不是 200/201: ${downloadResult.statusCode}`);
            }
          } catch (err: any) {
            console.error(`[App-Download] ❌❌❌ [DOWNLOAD_ERROR] 下载失败: ${manifestItem.filename}`);
            console.error(`[App-Download] ❌❌❌ [DOWNLOAD_ERROR] 错误消息: ${err.message || err}`);
          }
        }

        if (status.status === 'success') break;
      }

      if (status.status !== 'success') {
        status.status = 'failed';
        failedCount++;
        // 移除单文件失败时的 clearCallbacks，避免中断批量任务进度
      }
      
      console.log(`[App-Download] 📡 [WORKER_LIMITED] 完成: ${manifestItem.filename}`);
    };

    // 🔥 使用 p-limit 包装所有下载任务
    const downloadPromises = allFilesToDownload.map(item => 
      limit(() => downloadSingleFile(item))
    );
    await Promise.all(downloadPromises);

    console.log(`[App-Download] 📊 [SILENT_COMPLETE] 静默下载完成: 成功=${successCount}, 失败=${failedCount}`);

    return { success: successCount, failed: failedCount };
  }

  async checkAndDownload(onProgress: (p: DownloadProgress) => void) {
    const CONST_TOTAL_SIZE = GLOBAL_TOTAL_SIZE > 0 ? GLOBAL_TOTAL_SIZE : ASSET_LIST.reduce((sum, a) => sum + a.expectedSize, 0);

    const fileStatusMap = new Map<string, FileStatus>();
    const allFilesToDownload: any[] = [];
    let completedBytes = 0;

    for (const asset of ASSET_LIST) {
      const manifestItem = AUDIO_MANIFEST.find(a => a.id === asset.id);
      if (!manifestItem) continue;

      const expectedSize = asset.expectedSize;
      const localPath = getLocalPathHelper(manifestItem.category, manifestItem.filename);

      if (await RNFS.exists(localPath)) {
        try {
          const stat = await RNFS.stat(localPath);
          const actualSize = Number(stat.size);
          if (actualSize > 0) {
            completedBytes += actualSize;
            fileStatusMap.set(asset.id, {
              assetId: asset.id,
              expectedSize,
              maxConfirmedBytes: actualSize,
              status: 'success',
            });
            console.log(`[App-Download] ✅ 已存在: ${manifestItem.filename} (${actualSize} bytes)`);
            continue;
          }
        } catch (e) {}
      }

      allFilesToDownload.push({ ...manifestItem, expectedSize });
      
      fileStatusMap.set(asset.id, {
        assetId: asset.id,
        expectedSize,
        maxConfirmedBytes: 0,
        status: 'pending',
      });
    }

    let lastDisplayedProgress = CONST_TOTAL_SIZE > 0 ? completedBytes / CONST_TOTAL_SIZE : 0;
    onProgress({
      progress: lastDisplayedProgress,
      receivedBytes: completedBytes,
      totalBytes: CONST_TOTAL_SIZE,
      statusText: '正在为您开启疗愈之旅...',
    });

    if (allFilesToDownload.length === 0) {
      console.log(`[App-Download] ✅ 所有资源已存在，总大小: ${completedBytes} bytes`);
      onProgress({ progress: 1, receivedBytes: CONST_TOTAL_SIZE, totalBytes: CONST_TOTAL_SIZE, statusText: '欢迎来到心声冥想' });
      return { failedAssets: [], success: true };
    }

    console.log(`[App-Download] 📦 需要下载 ${allFilesToDownload.length} 个文件`);

    let uiUpdateTimer: ReturnType<typeof setInterval> | null = null;

    const updateUI = () => {
      let totalReceived = 0;

      for (const [, status] of fileStatusMap) {
        if (status.status === 'success') {
          totalReceived += status.expectedSize;
        } else if (status.status === 'downloading') {
          totalReceived += status.maxConfirmedBytes;
        }
      }

      const calculatedProgress = CONST_TOTAL_SIZE > 0 ? totalReceived / CONST_TOTAL_SIZE : 0;
      const safeProgress = Math.max(lastDisplayedProgress, calculatedProgress);
      lastDisplayedProgress = safeProgress;

      onProgress({
        progress: safeProgress,
        receivedBytes: Math.min(totalReceived, CONST_TOTAL_SIZE),
        totalBytes: CONST_TOTAL_SIZE,
        statusText: '正在为您开启疗愈之旅...',
      });
    };

    uiUpdateTimer = setInterval(updateUI, UI_UPDATE_INTERVAL_MS);

    const downloadSingleFile = async (asset: any): Promise<boolean> => {
      const status = fileStatusMap.get(asset.id);
      if (!status) return false;

      const localPath = getLocalPathHelper(asset.category, asset.filename);
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));

      try {
        const dirExists = await RNFS.exists(dirPath);
        console.log(`[App-Download] 📁 检查目录: ${dirPath} (存在: ${dirExists})`);
        if (!dirExists) {
          await RNFS.mkdir(dirPath);
          console.log(`[App-Download] ✅ 已创建目录: ${dirPath}`);
        }
      } catch (e: any) {
        console.error(`[App-Download] ❌ 创建目录失败: ${dirPath} - ${e.message}`);
        return false;
      }

      const tempPath = `${localPath}.tmp`;
      const urls = getDownloadUrls(asset.filename);

      for (let attempt = 0; attempt < MAX_RETRIES_PER_FILE; attempt++) {
        if (attempt > 0) {
          console.log(`[App-Download] ⚠️ 静默重试 ${asset.filename} (第${attempt + 1}/5次)`);
          await new Promise<void>(resolve => setTimeout(resolve as unknown as () => void, 5000));
        }

        status.status = 'downloading';

        for (const url of urls) {
          let currentJobId: number | undefined = undefined;

          try {
            if (await RNFS.exists(tempPath)) {
              try { await RNFS.unlink(tempPath); } catch (e) {}
            }

            let currentMaxBytes = 0;

            const downloadJob = RNFS.downloadFile({
              fromUrl: url,
              toFile: tempPath,
              connectionTimeout: DOWNLOAD_CONNECTION_TIMEOUT,
              readTimeout: DOWNLOAD_READ_TIMEOUT,
              background: false,
              discretionary: false,
              progressDivider: 5,
              begin: (res) => {
                currentJobId = res.jobId;
              },
              progress: (res) => {
                if (res.bytesWritten > currentMaxBytes) {
                  currentMaxBytes = res.bytesWritten;
                  status.maxConfirmedBytes = currentMaxBytes;
                }
              }
            });

            const downloadResult = await downloadJob.promise;

            if (downloadResult.statusCode !== 200 && downloadResult.statusCode !== 206) {
              if (await RNFS.exists(tempPath)) {
                try { await RNFS.unlink(tempPath); } catch (e) {}
              }
              continue;
            }

            if (await RNFS.exists(tempPath)) {
              const stat = await RNFS.stat(tempPath);
              const actualSize = Number(stat.size);

              if (actualSize > 0) {
                await RNFS.moveFile(tempPath, localPath);

                if (await RNFS.exists(localPath)) {
                  const finalStat = await RNFS.stat(localPath);
                  if (finalStat.size > 0) {
                    status.status = 'success';
                    status.maxConfirmedBytes = Number(finalStat.size);
                    console.log(`[App-Download] ✅ 完成: ${asset.filename} (实际大小: ${finalStat.size} bytes)`);

                    if (this.onFileDownloadedCallback) {
                      this.onFileDownloadedCallback(asset.id);
                    }

                    return true;
                  }
                }
              }
            }
          } catch (e: any) {
            console.log(`[App-Download] ❌ 下载失败: ${asset.filename} - ${e.message || e}`);
            if (await RNFS.exists(tempPath)) {
              try { await RNFS.unlink(tempPath); } catch (e) {}
            }
          }
        }
      }

      status.status = 'failed';
      console.log(`[App-Download] ❌ 最终失败: ${asset.filename} (重试${MAX_RETRIES_PER_FILE}次后放弃)`);
      return false;
    };

    const downloadQueue = [...allFilesToDownload];
    const runningTasks: Promise<void>[] = [];
    const failedAssets: string[] = [];

    const runNext = async () => {
      while (downloadQueue.length > 0) {
        const asset = downloadQueue.shift()!;
        const task = downloadSingleFile(asset).then(success => {
          if (!success) {
            failedAssets.push(asset.id);
          }
        });
        runningTasks.push(task);
        task.then(() => {
          const idx = runningTasks.indexOf(task);
          if (idx > -1) runningTasks.splice(idx, 1);
        });
        if (runningTasks.length >= MAX_CONCURRENT_TASKS) {
          await Promise.race(runningTasks);
        }
      }
    };

    console.log(`[App-Download] 🎵 开始下载所有资源文件：${allFilesToDownload.length} 个`);
    await runNext();
    await Promise.allSettled(runningTasks);

    if (uiUpdateTimer) {
      clearInterval(uiUpdateTimer);
    }

    updateUI();

    if (failedAssets.length > 0 && failedAssets.length < allFilesToDownload.length) {
      console.log(`[App-Download] ⚠️ 重试 ${failedAssets.length} 个失败文件...`);
      for (const failedId of failedAssets) {
        const asset = allFilesToDownload.find(a => a.id === failedId);
        if (asset) {
          const status = fileStatusMap.get(failedId);
          if (status && status.status === 'failed') {
            status.status = 'pending';
            status.maxConfirmedBytes = 0;
            await downloadSingleFile(asset);
          }
        }
      }

      updateUI();
    }

    const finalFailed: string[] = [];
    let totalSuccessBytes = 0;
    for (const [id, status] of fileStatusMap) {
      if (status.status === 'success') {
        totalSuccessBytes += status.expectedSize;
      } else if (status.status === 'failed') {
        finalFailed.push(id);
      }
    }

    const totalExpectedBytes = ASSET_LIST.reduce((sum, a) => sum + a.expectedSize, 0);
    const completionRate = totalSuccessBytes / totalExpectedBytes;

    console.log(`[App-Download] 📊 下载统计:`);
    console.log(`  - 成功: ${fileStatusMap.size - finalFailed.length}/${fileStatusMap.size} 个文件`);
    console.log(`  - 成功字节: ${(totalSuccessBytes / 1024 / 1024).toFixed(1)}MB / ${(totalExpectedBytes / 1024 / 1024).toFixed(1)}MB`);
    console.log(`  - 完成率: ${(completionRate * 100).toFixed(1)}%`);

    if (finalFailed.length > 0) {
      console.log(`[App-Download] ❌ 失败文件: ${finalFailed.join(', ')}`);
      return { failedAssets: finalFailed, success: false };
    }

    console.log(`[App-Download] ✅ 所有资源下载完成！总大小: ${(totalSuccessBytes / 1024 / 1024).toFixed(1)}MB`);
    return { failedAssets: [], success: true };
  }

  async getLocalPath(id: string) {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const path = getLocalPathHelper(asset.category, asset.filename);
    if (await RNFS.exists(path)) return path;
    return null;
  }

  async downloadAudio(id: string, urls?: string[], retries = 3): Promise<string | null> {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;

    const localPath = getLocalPathHelper(asset.category, asset.filename);
    const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
    const targetUrls = urls && urls.length > 0 ? urls : getDownloadUrls(asset.filename);

    for (let attempt = 1; attempt <= retries; attempt++) {
      for (const url of targetUrls) {
        try {
          if (!(await RNFS.exists(dirPath))) await RNFS.mkdir(dirPath);

          const result = await RNFS.downloadFile({
            fromUrl: url,
            toFile: localPath,
            connectionTimeout: DOWNLOAD_CONNECTION_TIMEOUT,
            readTimeout: DOWNLOAD_READ_TIMEOUT,
          }).promise;

          if (result.statusCode === 200 && await RNFS.exists(localPath)) {
            const stat = await RNFS.stat(localPath);
            if (stat.size > 0) return localPath;
          }
        } catch (e) {}

        if (attempt < retries) await new Promise<void>(r => setTimeout(r, 1500));
      }
    }

    return null;
  }

  prioritizeScene(sceneId: string): void {
    console.log(`[DownloadService] ⚡ 场景 ${sceneId} 被提升为最高优先级！`);
    this.boostPrioritySceneId = sceneId;
  }

  setProgressCallback(callback: (sceneId: string, progress: number) => void): void {
    this.onProgressCallback = callback;
  }

  setCompleteCallback(callback: (sceneId: string) => void): void {
    this.onCompleteCallback = callback;
  }

  setFileDownloadedCallback(callback: (assetId: string) => void): void {
    this.onFileDownloadedCallback = callback;
  }

  clearBoost(): void {
    this.boostPrioritySceneId = null;
  }
}

const encodeFilename = (filename: string): string => {
  return filename.split('/').map(part => encodeURIComponent(part)).join('/');
};

const getDownloadUrls = (filename: string): string[] => {
  const encoded = encodeFilename(filename);
  
  return [
    `${GHPROXY_NET_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${MIRROR_GHPROXY_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${KK_GITHUB_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${JSDDELIVR_URL}${encoded}`,
  ];
};

export const DownloadService = new DownloadServiceImpl();

export default DownloadService;
