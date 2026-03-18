import { NativeModules } from 'react-native';

const { CrashReport } = NativeModules;

/**
 * 统一的异常报告接口
 */
export const CrashReportUtil = {
  /**
   * 手动上报异常信息
   * @param message 异常描述字符串
   */
  logException: (message: string) => {
    if (CrashReport && CrashReport.logException) {
      CrashReport.logException(message);
    } else {
      console.warn('CrashReport NativeModule not found');
    }
  },

  /**
   * 设置用户 ID，方便在后台追踪特定用户的崩溃
   * @param userId 用户唯一标识
   */
  setUserId: (userId: string) => {
    if (CrashReport && CrashReport.setUserId) {
      CrashReport.setUserId(userId);
    } else {
      console.warn('CrashReport NativeModule not found');
    }
  },
};
