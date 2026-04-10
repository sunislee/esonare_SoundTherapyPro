import { NativeModules, NativeEventEmitter } from 'react-native';

const { AudioLevelModule } = NativeModules;

/**
 * AudioLevel 模块桥接层
 * 
 * 提供原生音频采集的 JS 接口：
 * - start(): 开始采集
 * - stop(): 停止采集
 * - addListener(): 监听分贝数据（100ms 更新一次）
 */
export interface AudioLevelEvent {
  type: 'dB' | 'error';
  message: string;
  dB: number; // 0-100 的分贝值
}

export type AudioLevelListener = (event: AudioLevelEvent) => void;

export const AudioLevel = {
  /**
   * 开始采集音频分贝数据
   */
  start() {
    if (AudioLevelModule) {
      console.log('[AudioLevel] 开始采集音频');
      AudioLevelModule.start();
    } else {
      console.warn('[AudioLevel] 原生模块未找到');
    }
  },

  /**
   * 停止采集音频分贝数据
   */
  stop() {
    if (AudioLevelModule) {
      console.log('[AudioLevel] 停止采集音频');
      AudioLevelModule.stop();
    }
  },

  /**
   * 监听音频分贝更新事件
   * @param listener 回调函数，接收 AudioLevelEvent
   * @returns 取消订阅函数
   */
  addListener(listener: AudioLevelListener) {
    const emitter = new NativeEventEmitter(AudioLevelModule);
    const subscription = emitter.addListener('onAudioLevelUpdate', listener);
    
    return () => {
      subscription.remove();
    };
  },
};

export default AudioLevel;
