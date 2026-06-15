// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import * as RNFS from '@dr.pogodin/react-native-fs';
import { DownloaderServiceInstance } from './DownloaderService';
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

let boostPrioritySceneId: string | null = null;
let onProgressCallback: ((sceneId: string, progress: number) => void) | null = null;
let onCompleteCallback: ((sceneId: string) => void) | null = null;
let onFileDownloadedCallback: ((assetId: string) => void) | null = null;

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

const encodeFilename = (filename: string): string => {
  return filename.split('/').map(part => encodeURIComponent(part)).join('/');
};

const getDownloadUrls = (filename: string): string[] => {
  const encoded = encodeFilename(filename);
  
  // 【2025年最新修复】所有文件路径已在 audioAssets.ts 中完整定义
  // 直接使用 filename，无需添加任何前缀
  // 路径示例: base/xxx.m4a, fx/xxx.m4a, zen/xxx.mp3, noise reduction/xxx.mp3
  
  // 【国内最稳 GitHub Proxy 加速源优先级
  return [
    `${GHPROXY_NET_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${MIRROR_GHPROXY_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${KK_GITHUB_URL}sunislee/sound-therapy-assets/main/${encoded}`,
    `${JSDDELIVR_URL}${encoded}`,
  ];
};

export const DownloadService = {
  async isResourceReady(): Promise<boolean> {
    return Promise.resolve(true);
  },

  async markAsReady() {
    return Promise.resolve();
  },

  async clearReadyFlag() {
    return Promise.resolve();
  },

  async forceSkipCheckAndEnter() {
    console.log('[App-Download] 🔓 强制跳过校验，直接进入App');
    await Promise.resolve();
  },

  async silentBackgroundDownload(): Promise<{success: number; failed: number}> {
    console.log(`[App-Download] 🚨🚨🚨 [SILENT_DOWNLOAD_START] 启动后台静默下载... 🚨🚨🚨`);
    
    // 【优化】定义核心场景优先级（首页推荐的前 8 个场景）
    const PRIORITY_SCENES = [
      'nature_ocean',        // 海洋
      'nature_forest',       // 森林
      'nature_deep_sea',     // 深海呼吸
      'nature_misty_forest', // 雾林
      'healing_zen_bowl',    // 禅音钵
      'oriental_zen_monastery', // 东方禅意·寺院
      'life_rain_boat',      // 雨天小船
      'brainwave_alpha',     // α脑波
    ];
    
    const CONST_TOTAL_SIZE = GLOBAL_TOTAL_SIZE > 0 ? GLOBAL_TOTAL_SIZE : ASSET_LIST.reduce((sum, a) => sum + a.expectedSize, 0);
    const fileStatusMap = new Map<string, FileStatus>();
    const allFilesToDownload: any[] = [];
    let completedBytes = 0;

    // ════════════════════════════════════════════════════════════
    // 🔥 第一阶段：构建下载队列
    // ════════════════════════════════════════════════════════════
    console.log(`[App-Download] 🔍 [BUILD_QUEUE] 遍历 ASSET_LIST，共 ${ASSET_LIST.length} 个资产...`);
    
    for (const asset of ASSET_LIST) {
      const manifestItem = AUDIO_MANIFEST.find(a => a.id === asset.id);
      if (!manifestItem) {
        console.log(`[App-Download] ⚠️ [BUILD_QUEUE] 跳过 ${asset.id}: 未找到 manifestItem`);
        continue;
      }

      const expectedSize = asset.expectedSize;
      const localPath = getLocalPathHelper(manifestItem.category, manifestItem.filename);

      // 检查本地文件是否存在且大小足够
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

      // 白噪音强制最高优先级（秒下）
      const isWhiteNoise = asset.id === 'interactive_white_noise';
      const basePriority = isWhiteNoise ? 999 : PRIORITY_SCENES.indexOf(asset.id);
      
      allFilesToDownload.push({ 
        asset, 
        manifestItem, 
        localPath, 
        expectedSize,
        priority: basePriority
      });
      fileStatusMap.set(asset.id, { assetId: asset.id, expectedSize, maxConfirmedBytes: 0, status: 'pending' });
    }

    console.log(`[App-Download] 📦 [BUILD_QUEUE] 完成！共 ${allFilesToDownload.length} 个文件待下载`);

    // ════════════════════════════════════════════════════════════
    // 🔥 第二阶段：按优先级排序
    // ════════════════════════════════════════════════════════════
    const sortWithBoost = () => {
      allFilesToDownload.sort((a, b) => {
        // 【动态插队】被用户点击的场景永远排第一
        if (boostPrioritySceneId === a.asset.id) return -1;
        if (boostPrioritySceneId === b.asset.id) return 1;
        // 核心场景（priority >= 0）排前面
        if (a.priority >= 0 && b.priority < 0) return -1;
        if (a.priority < 0 && b.priority >= 0) return 1;
        // 都是核心场景或都不是，按 priority 升序
        return a.priority - b.priority;
      });
      
      console.log(`[App-Download] 📋 [SORT_QUEUE] 下载队列已优化：共 ${allFilesToDownload.length} 个文件`);
      console.log(`[App-Download] 🎯 [SORT_QUEUE] 前 5 个优先下载：${allFilesToDownload.slice(0, 5).map(f => f.asset.id).join(', ')}`);
      if (boostPrioritySceneId) {
        console.log(`[App-Download] ⚡ [SORT_QUEUE] 当前插队场景: ${boostPrioritySceneId}`);
      }
    };
    
    sortWithBoost();

    if (allFilesToDownload.length === 0) {
      console.log('[App-Download] ✅ 所有资源已存在，无需下载');
      await Promise.resolve();
      return { success: 0, failed: 0 };
    }

    console.log(`[App-Download] 🚀 [START_WORKERS] 启动 ${Math.min(MAX_CONCURRENT_TASKS, allFilesToDownload.length)} 个工作线程...`);

    let successCount = 0;
    let failedCount = 0;
    let nextIndex = 0;

    // ════════════════════════════════════════════════════════════
    // 🔥 第三阶段：下载单个文件
    // ════════════════════════════════════════════════════════════
    const downloadSingleFile = async (): Promise<void> => {
      console.log(`[App-Download] 📡 [WORKER] 工作线程启动`);
      
      while (nextIndex < allFilesToDownload.length) {
        // 【动态插队】每次取任务前重新排序
        if (boostPrioritySceneId && nextIndex < allFilesToDownload.length - 1) {
          sortWithBoost();
        }
        
        const idx = nextIndex++;
        const { asset, manifestItem, localPath, expectedSize } = allFilesToDownload[idx];
        const status = fileStatusMap.get(asset.id)!;
        const tempPath = `${localPath}.tmp`;
        const urls = getDownloadUrls(manifestItem.filename);

        console.log(`[App-Download] 🔥 [WORKER] 开始处理: ${manifestItem.filename}`);
        console.log(`[App-Download] 📂 [WORKER] 本地路径: ${localPath}`);
        console.log(`[App-Download] 🌐 [WORKER] 可用 URLs: ${urls.length} 个源`);
        urls.forEach((url, i) => console.log(`[App-Download] 🌐 [WORKER] URL ${i + 1}: ${url.substring(0, 60)}...`));

        for (let attempt = 0; attempt < MAX_RETRIES_PER_FILE; attempt++) {
          if (attempt > 0) {
            console.log(`[App-Download] 🤫 [RETRY] 静默重试 ${manifestItem.filename} (${attempt + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          status.status = 'downloading';

          for (const url of urls) {
            try {
              console.log(`[App-Download] 🌐 [DOWNLOAD_START] 开始下载: ${manifestItem.filename}`);
              console.log(`[App-Download] 🌐 [DOWNLOAD_START] URL: ${url}`);
              console.log(`[App-Download] 📂 [DOWNLOAD_START] 临时文件: ${tempPath}`);

              const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
              console.log(`[App-Download] 📂 [DOWNLOAD_START] 创建目录: ${dirPath}`);
              await RNFS.mkdir(dirPath);

              const downloadResult = await RNFS.downloadFile({
                fromUrl: url,
                toFile: tempPath,
                connectionTimeout: DOWNLOAD_CONNECTION_TIMEOUT,
                readTimeout: DOWNLOAD_READ_TIMEOUT,
              }).promise;

              console.log(`[App-Download] 📊 [DOWNLOAD_RESULT] 状态码: ${downloadResult.statusCode}`);
              console.log(`[App-Download] 📊 [DOWNLOAD_RESULT] 接收字节: ${downloadResult.bytesWritten || 'N/A'}`);

              if (downloadResult.statusCode === 200 || downloadResult.statusCode === 201) {
                const stat = await RNFS.stat(tempPath);
                console.log(`[App-Download] 📊 [DOWNLOAD_RESULT] 临时文件大小: ${stat.size}`);
                
                if (stat.size >= expectedSize * 0.8) {
                  console.log(`[App-Download] ✅ [DOWNLOAD_RESULT] 文件大小符合要求，移动到最终路径`);
                  await RNFS.moveFile(tempPath, localPath);
                  status.status = 'success';
                  successCount++;
                  
                  // 【进度回调】通知 UI 更新
                  if (onProgressCallback) {
                    onProgressCallback(asset.id, 100);
                  }
                  // 【完成回调】通知自动关闭弹窗
                  if (onCompleteCallback) {
                    try {
                      onCompleteCallback(asset.id);
                    } catch (cbErr: any) {
                      console.error(`[App-Download] ❌ [COMPLETION_CB_ERROR] 完成回调失败: ${cbErr.message}`);
                    }
                  }
                  console.log(`[App-Download] 📡 [PROGRESS_CALLBACK] 已通知 UI: ${asset.id} -> 100%`);
                  
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
              console.error(`[App-Download] ❌❌❌ [DOWNLOAD_ERROR] 错误堆栈: ${err.stack || 'N/A'}`);
              console.error(`[App-Download] ❌❌❌ [DOWNLOAD_ERROR] URL: ${url}`);
            }
          }

          if (status.status === 'success') break;
        }

        if (status.status !== 'success') {
          status.status = 'failed';
          failedCount++;
          console.error(`[App-Download] ❌❌❌ [SILENT_FAILED] 静默最终失败: ${manifestItem.filename} (重试${MAX_RETRIES_PER_FILE}次)`);
        }
      }
      
      console.log(`[App-Download] 📡 [WORKER] 工作线程完成`);
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_TASKS, allFilesToDownload.length) }, () => downloadSingleFile());
    await Promise.all(workers);

    console.log(`[App-Download] 📊 [SILENT_COMPLETE] 静默下载完成: 成功=${successCount}, 失败=${failedCount}`);

    if (failedCount === 0) {
      await Promise.resolve();
    }

    return { success: successCount, failed: failedCount };
  },

  async checkAndDownload(onProgress: (p: DownloadProgress) => void) {
    const CONST_TOTAL_SIZE = GLOBAL_TOTAL_SIZE > 0 ? GLOBAL_TOTAL_SIZE : ASSET_LIST.reduce((sum, a) => sum + a.expectedSize, 0);

    const fileStatusMap = new Map<string, FileStatus>();
    const allFilesToDownload: any[] = []; // 【修复】所有文件（包括背景图）都必须进入核心下载队列
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

      // 【修复】所有文件统一进入下载队列，不再区分核心音频和背景图
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

    console.log(`[App-Download] 📦 需要下载 ${allFilesToDownload.length} 个文件，总大小约 ${(CONST_TOTAL_SIZE / 1024 / 1024).toFixed(1)}MB`);

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

    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

    const downloadSingleFile = async (asset: any): Promise<boolean> => {
      const status = fileStatusMap.get(asset.id);
      if (!status) return false;

      const localPath = getLocalPathHelper(asset.category, asset.filename);
      const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));

      // 【强制建目录】zen/ western/ 等子目录必须提前创建
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

      // 【详细日志追踪】Downloader: [文件名] -> [本地路径]
      console.log(`[App-Download] 📥 Downloader: [${asset.filename}] -> [${localPath}]`);

      const tempPath = `${localPath}.tmp`;
      const urls = getDownloadUrls(asset.filename);

      for (let attempt = 0; attempt < MAX_RETRIES_PER_FILE; attempt++) {
        if (attempt > 0) {
          console.log(`[App-Download] ⚠️ 静默重试 ${asset.filename} (第${attempt + 1}/5次)`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        status.status = 'downloading';

        for (const url of urls) {
          let currentJobId: number | undefined = undefined;

          const stopDownloadSafe = (jobId: number) => {
            try {
              RNFS.stopDownload(jobId);
            } catch (e) {}
          };

          try {
            if (await RNFS.exists(tempPath)) {
              try { await RNFS.unlink(tempPath); } catch (e) {}
            }

            let currentMaxBytes = 0;

            // 【打印完整下载 URL】让用户看到到底是哪个 URL 在 404
            console.log(`[App-Download] 🔗 完整URL: ${url}`);
            console.log(`[App-Download]  开始下载: ${asset.filename} → ${localPath}`);

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
                 // 【关键修复】expectedSize 来自 downloadSingleFile 的参数 asset.expectedSize
                 DownloaderServiceInstance.notify({ resourceId: asset.id, progress: Math.round(res.bytesWritten / asset.expectedSize * 100), status: 'downloading', filename: asset.filename });
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
DownloaderServiceInstance.notify({ resourceId: asset.id, progress: 100, status: 'completed', filename: asset.filename });
status.maxConfirmedBytes = Number(finalStat.size);
                    console.log(`[App-Download] ✅ 完成: ${asset.filename} (实际大小: ${finalStat.size} bytes)`);

                    if (onFileDownloadedCallback) {
                      onFileDownloadedCallback(asset.id);
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
DownloaderServiceInstance.notify({ resourceId: asset.id, progress: 0, status: 'failed', filename: asset.filename });
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

    // 【修复】统一下载所有文件（包括背景图），必须等待全部完成
    console.log(`[App-Download] 🎵 开始下载所有资源文件：${allFilesToDownload.length} 个（含背景图）`);
    await runNext();
    await Promise.allSettled(runningTasks);

    // 清除 UI 更新定时器
    if (uiUpdateTimer) {
      clearInterval(uiUpdateTimer);
    }

    // 最终更新 UI
    updateUI();

    // 重试失败的文件
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

    // 【修复】检查总字节数，确保所有文件（包括背景图）都已下载
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
  },

  async getLocalPath(id: string) {
    const asset = AUDIO_MANIFEST.find(a => a.id === id);
    if (!asset) return null;
    const path = getLocalPathHelper(asset.category, asset.filename);
    if (await RNFS.exists(path)) return path;
    return null;
  },

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
        } catch (e: any) {
          console.error('[DownloadService] downloadAudio 失败:', e?.message || e);
        }

        if (attempt < retries) await new Promise<void>(r => setTimeout(r, 1500));
      }
    }

    return null;
  },

  prioritizeScene(sceneId: string) {
    console.log(`[DownloadService] ⚡ 场景 ${sceneId} 被提升为最高优先级！`);
    boostPrioritySceneId = sceneId;
  },

  setProgressCallback(callback: (sceneId: string, progress: number) => void) {
    onProgressCallback = callback;
  },

  setCompleteCallback(callback: (sceneId: string) => void) {
    onCompleteCallback = callback;
  },

  setFileDownloadedCallback(callback: (assetId: string) => void) {
    onFileDownloadedCallback = callback;
  },

  clearBoost() {
    boostPrioritySceneId = null;
  }
};

export default DownloadService;
