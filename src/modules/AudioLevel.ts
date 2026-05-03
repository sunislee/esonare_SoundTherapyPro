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
  startListening: (intervalMs: number) => void;
  stopListening: () => void;
  setAmplitudeListener: (listenerName: string) => void;
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
}

// 导出单例
export const AudioLevel = new AudioLevelService();

