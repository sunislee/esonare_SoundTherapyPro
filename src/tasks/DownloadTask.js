/**
 * Headless JS 后台下载任务（P1-3）
 * 运行在独立 JS Context，与前台 DownloaderService 单例不共享，
 * 故必须自己 initQueue 重建队列。复用 startDownload()：
 * 已落盘文件被 FILE_CHECK 跳过，只补下载缺失文件。
 *
 * ⚠️ 字段名必须与 react-native-background-actions@4.x 的真实 API 一致：
 *    taskName / taskTitle / taskDesc（required）/ taskIcon（required，缺省会 IllegalArgumentException）
 *    模板里的 title / message / connectivityRequired 均非合法字段。
 */
import BackgroundActions from 'react-native-background-actions';
import { DownloaderServiceInstance } from '../services/DownloaderService';

const downloadTask = async () => {
  try {
    console.log('[Headless-Download] ⏬ 后台下载任务启动');
    // 1. 从音频清单重建队列（SORTED_RESOURCES 按优先级排序）
    DownloaderServiceInstance.initQueue();
    // 2. 复用现有队列下载：已落盘文件被 FILE_CHECK 跳过，只补下载缺失文件
    await DownloaderServiceInstance.startDownload();
    console.log('[Headless-Download] ✅ 后台下载完成');
  } catch (e) {
    // Headless 环境未捕获异常会直接杀任务，必须结构化处理
    console.error('[Headless-Download] ❌', e);
  }
};

// 注册后台任务（taskName 须与前台通知保持一致）
// 库内部会 AppRegistry.registerHeadlessTask(taskName, ...) + 启动前台服务
BackgroundActions.start(
  downloadTask,
  {
    taskName: 'DownloadTask',
    taskTitle: '正在下载资源…',
    taskDesc: '后台静默下载，完成后自动继续',
    taskIcon: { name: 'ic_notification', type: 'drawable' },
  },
  (error) => {
    console.error('[Headless-Download] ❗ 启动失败:', error);
  }
);

export default downloadTask;
