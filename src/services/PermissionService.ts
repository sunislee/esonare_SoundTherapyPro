/**
 * 权限管理服务（兼容 RN 0.81 + Android 15 16KB Page Size）
 * 
 * 功能：
 * - 麦克风权限检查与申请（手动触发，非静默）
 * - 权限状态持久化
 * - 合规性提示 UI
 */

import { PermissionsAndroid, Platform, Linking } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'undetermined';

export interface PermissionResult {
  status: PermissionStatus;
  granted: boolean;
  message?: string;
}

/**
 * 检查并申请麦克风权限
 * 注意：必须在用户交互时手动调用（如点击按钮）
 */
export const requestMicrophonePermission = async (): Promise<PermissionResult> => {
  try {
    console.log('[Permission] 检查麦克风权限...');

    if (Platform.OS !== 'android') {
      return {
        status: 'granted',
        granted: true,
      };
    }

    // 检查当前权限状态
    const currentStatus = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    if (currentStatus) {
      console.log('[Permission] 麦克风权限已授予');
      return {
        status: 'granted',
        granted: true,
      };
    }

    // 申请权限
    console.log('[Permission] 申请麦克风权限...');
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: '麦克风权限申请',
        message: '心声冥想需要访问麦克风以分析环境噪音，为您提供智能降噪模式。\n\n我们不会录制或上传任何音频内容，所有分析均在本地完成。',
        buttonPositive: '允许',
        buttonNegative: '拒绝',
        buttonNeutral: '稍后决定',
      }
    );

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      console.log('[Permission] 麦克风权限已授予');
      return {
        status: 'granted',
        granted: true,
      };
    } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      console.log('[Permission] 麦克风权限被永久拒绝');
      return {
        status: 'blocked',
        granted: false,
        message: '权限已被永久拒绝，请在系统设置中手动开启',
      };
    } else {
      console.log('[Permission] 麦克风权限被拒绝');
      return {
        status: 'denied',
        granted: false,
        message: '需要麦克风权限才能使用智能场景识别功能',
      };
    }
  } catch (error) {
    console.error('[Permission] 权限申请失败:', error);
    return {
      status: 'undetermined',
      granted: false,
      message: '权限申请过程中发生错误',
    };
  }
};

/**
 * 仅检查权限状态（不申请）
 */
export const checkMicrophonePermission = async (): Promise<PermissionStatus> => {
  try {
    if (Platform.OS !== 'android') {
      return 'granted';
    }

    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    return hasPermission ? 'granted' : 'undetermined';
  } catch (error) {
    console.error('[Permission] 权限检查失败:', error);
    return 'undetermined';
  }
};

/**
 * 打开应用设置页面（用于处理"不再询问"的情况）
 */
export const openAppSettings = async (): Promise<void> => {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.error('[Permission] 打开设置失败:', error);
  }
};
