/**
 * Headless JS 后台下载任务单元测试（P1-3）
 * 库：react-native-background-actions
 *
 * 关键点：
 * 1) BackgroundActions.start 默认 jest.fn() 不会执行传入的 task；
 *    这里让它真正调用 task()，模块加载副作用才会跑起来。
 * 2) DownloadTask.js 在顶层 import 时即执行副作用（注册 BackgroundActions.start），
 *    故用 jest.resetModules() + require() 每次测试重新加载，保证计数干净。
 */
jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async (task) => {
      await task();
    }),
  },
}));

jest.mock('../../services/DownloaderService', () => ({
  DownloaderServiceInstance: {
    initQueue: jest.fn(),
    startDownload: jest.fn(),
  },
}));

describe('DownloadTask 后台下载（P1-3）', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('C1: 先 initQueue 再 startDownload，成功调用 BackgroundActions.start', async () => {
    const { DownloaderServiceInstance } = require('../../services/DownloaderService');
    const BackgroundActions = require('react-native-background-actions').default;
    (DownloaderServiceInstance.startDownload as jest.Mock).mockResolvedValue(undefined);

    require('../DownloadTask'); // 触发模块副作用：start→task→initQueue+startDownload

    expect(DownloaderServiceInstance.initQueue).toHaveBeenCalledTimes(1);
    expect(DownloaderServiceInstance.startDownload).toHaveBeenCalledTimes(1);
    expect(BackgroundActions.start).toHaveBeenCalledTimes(1);
    const [task, params] = BackgroundActions.start.mock.calls[0];
    expect(params.taskName).toBe('DownloadTask');
    expect(typeof task).toBe('function');
  });

  it('C2: startDownload 抛错 → 被 catch 吞掉，require 不向外 throw', async () => {
    const { DownloaderServiceInstance } = require('../../services/DownloaderService');
    (DownloaderServiceInstance.startDownload as jest.Mock).mockRejectedValue(new Error('boom'));
    // 不应抛出：Headless 环境异常被内部 catch 吞掉，否则系统杀任务
    expect(() => require('../DownloadTask')).not.toThrow();
  });
});

