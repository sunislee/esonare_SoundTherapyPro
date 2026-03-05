import { Platform, PermissionsAndroid, Alert, NativeModules } from 'react-native';

const { NotificationManager } = NativeModules;

export const PermissionService = {
  /**
   * 请求存储权限（下载资源必需）
   */
  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      // Android 13+ (API 33+) 不需要 WRITE_EXTERNAL_STORAGE
      // 但为了兼容性，仍然请求
      if (Platform.Version < 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: '存储权限',
            message: '心声冥想需要存储权限来保存冥想音频资源',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (error) {
      console.error('请求存储权限失败:', error);
      return false;
    }
  },

  /**
   * 检查存储权限状态
   */
  async checkStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      if (Platform.Version < 33) {
        const status = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        return status;
      }
      return true;
    } catch (error) {
      console.error('检查存储权限失败:', error);
      return false;
    }
  },

  /**
   * 请求通知权限
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      // 创建通知通道（Android 8.0+）
      await this.createNotificationChannel();
      
      // Android 13+ 需要 POST_NOTIFICATIONS 权限
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: '通知权限',
            message: '心声冥想需要通知权限来提醒您冥想时间和提供个性化建议',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android 12 及以下版本不需要运行时请求通知权限
        return true;
      }
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return false;
    }
  },

  /**
   * 检查通知权限状态
   */
  async checkNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      if (Platform.Version >= 33) {
        const status = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return status;
      } else {
        return true;
      }
    } catch (error) {
      console.error('检查通知权限失败:', error);
      return false;
    }
  },

  /**
   * 创建通知通道（Android 8.0+）
   */
  async createNotificationChannel() {
    if (Platform.OS !== 'android' || Platform.Version < 26) {
      return;
    }

    try {
      // 使用 NativeModules 调用原生方法创建通知通道
      if (NotificationManager && NotificationManager.createNotificationChannel) {
        await NotificationManager.createNotificationChannel();
        console.log('通知通道创建成功');
      } else {
        console.warn('Native NotificationManager 不可用');
      }
    } catch (error) {
      console.error('创建通知通道失败:', error);
    }
  },

  /**
   * 显示权限被拒绝的提示
   */
  showPermissionDeniedAlert() {
    Alert.alert(
      '权限被拒绝',
      '通知权限被拒绝，您可以在系统设置中手动开启此权限，以便接收冥想提醒和个性化建议。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => {
          // 可以添加跳转到系统设置的逻辑
        }}
      ]
    );
  }
};

export default PermissionService;