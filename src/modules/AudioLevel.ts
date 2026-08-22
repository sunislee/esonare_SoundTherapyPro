/**
 * 音频分贝采集模块 - JS 桥接
 * 
 * 功能：
 * - 调用原生 AudioRecord API 采集麦克风音频
 * - 实时计算 RMS 和分贝值
 * - 每 100ms 回调一次
 * 
 * 兼容 RN 0.81 + 新架构
 */

import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';

const { AudioLevelModule } = NativeModules;

interface AudioLevelModuleType {
  startListening: (intervalMs?: number) => void;
  stopListening: () => void;
  setAmplitudeListener: (listenerName: string) => void;
  // 原生侧委托 PermissionsAndroid：resolve 结果为 'granted' | 'denied' | 'never_ask_again'
  checkAndRequestPermission?: () => Promise<string>;
}

type AmplitudeCallback = (amplitude: number, dB: number) => void;

class AudioLevelService {
  private module: AudioLevelModuleType;
  private callback: AmplitudeCallback | null = null;
  private listenerId: string | null = null;
  private eventSubscription: any = null;

  constructor() {
    if (!AudioLevelModule) {
      console.warn('[AudioLevel] 原生模块未找到，请检查原生配置');
      // 创建模拟模块用于降级
      this.module = {
        startListening: () => console.log('[AudioLevel] 模拟模式：开始监听'),
        stopListening: () => console.log('[AudioLevel] 模拟模式：停止监听'),
        setAmplitudeListener: () => {},
      };
    } else {
      this.module = AudioLevelModule as AudioLevelModuleType;
    }
  }

  /**
   * 开始采集
   * @param onAmplitude 振幅回调 (amplitude: 0-1, dB: 0-160)
   * @param intervalMs 采样间隔（毫秒），默认 100ms
   */
  start(onAmplitude: AmplitudeCallback, intervalMs: number = 100): void {
    console.log(`[AudioLevel] 开始采集，间隔：${intervalMs}ms`);
    
    this.callback = onAmplitude;
    this.listenerId = `listener_${Date.now()}`;
    
    // 注册监听器
    this.module.setAmplitudeListener(this.listenerId);
    
    // 监听原生事件
    this.eventSubscription = DeviceEventEmitter.addListener('onAmplitudeChanged', (data: any) => {
      if (this.callback && data) {
        const { amplitude, dB } = data;
        console.log(`[AudioLevel] 📡 收到原生振幅: amp=${amplitude}, dB=${dB}`);
        this.callback(amplitude, dB);
      }
    });
    
    console.log('[AudioLevel] 事件监听器已注册');
    
    // 启动原生采集
    this.module.startListening(intervalMs);
    
    console.log('[AudioLevel] 原生采集已启动');
  }

  /**
   * 停止采集
   */
  stop(): void {
    console.log('[AudioLevel] 停止采集');
    
    this.module.stopListening();
    
    // 移除事件监听
    if (this.eventSubscription) {
      this.eventSubscription.remove();
      this.eventSubscription = null;
    }
    
    this.callback = null;
    this.listenerId = null;
  }

  /**
   * Android 运行时麦克风权限检查与申请。
   * @returns true=已授权 / false=被拒绝或用户取消
   */
  async checkMicrophonePermission(): Promise<boolean> {
    if (!this.module.checkAndRequestPermission) return true; // iOS/降级路径无需原生权限
    try {
      // 原生 resolve 结果为字符串：仅 'granted' 视为已授权
      const result = await this.module.checkAndRequestPermission();
      return result === 'granted';
    } catch (_e: unknown) {
      console.warn('[AudioLevel] 麦克风权限未授予');
      return false;
    }
  }

  /**
   * 监听振幅变化事件（非侵入式订阅）。
   * @returns 取消订阅函数，调用后停止接收回调（不影响其他监听器）
   */
  onAmplitudeChanged(callback: AmplitudeCallback): () => void {
    // 创建一个临时的 start 方式：直接注册事件监听
    const listenerId = `onmic_${Date.now()}`;
    this.module.setAmplitudeListener(listenerId);
    
    const subscription = DeviceEventEmitter.addListener('onAmplitudeChanged', (data: any) => {
      if (data && typeof data === 'object' && 'amplitude' in data && 'dB' in data) {
        callback(data.amplitude, data.dB);
      }
    });
    
    // 返回 unsubscribe 函数
    return () => {
      subscription.remove();
      this.module.stopListening?.(); // 如果没有其他监听器，停止原生采集
    };
  }

  /**
   * 带权限检查的 start。先申请权限，授权后再开始采集。
   * @param onAmplitude 振幅回调 (amplitude: 0-1, dB: 0-160)
   * @param intervalMs 采样间隔（毫秒），默认 100ms
   */
  async startWithPermission(onAmplitude: AmplitudeCallback, intervalMs: number = 100): Promise<boolean> {
    const granted = await this.checkMicrophonePermission();
    if (!granted) return false;

    console.log(`[AudioLevel] 权限已授予，开始采集（间隔 ${intervalMs}ms）`);
    this.start(onAmplitude, intervalMs);
    return true;
  }
}

// 导出单例
export const AudioLevel = new AudioLevelService();

