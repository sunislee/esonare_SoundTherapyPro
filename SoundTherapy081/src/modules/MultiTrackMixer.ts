/**
 * 多轨混音器 - TypeScript 桥接层
 * 
 * 功能：
 * - 8 路音轨 × 8 频段 = 64 个独立增益控制点
 * - Anti-Clipping 自动归一化
 * - 对数平滑插值
 */

import { NativeModules } from 'react-native';

const { MultiTrackMixer } = NativeModules;

export interface TrackBandGain {
  trackIndex: number;  // 0-7: 音轨索引
  bandIndex: number;   // 0-7: 频段索引
  gain: number;        // -1.0 ~ 1.0
}

export interface MultiTrackGainResult {
  masterGain: number;   // 归一化后的主增益
  totalEnergy: number;  // 总能量
  isClipping: boolean;  // 是否触发防爆音
}

class MultiTrackMixerModule {
  private isInitialized = false;
  
  /**
   * 初始化混音引擎
   */
  async initialize(): Promise<void> {
    try {
      await MultiTrackMixer.initialize();
      this.isInitialized = true;
      console.log('[MultiTrackMixer] ✅ 混音引擎初始化成功');
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 设置某路音轨的某个频段增益
   */
  setTrackBandGain(trackIndex: number, bandIndex: number, gain: number): void {
    if (!this.isInitialized) {
      console.warn('[MultiTrackMixer] ⚠️ 引擎未初始化');
      return;
    }
    
    if (trackIndex < 0 || trackIndex > 7 || bandIndex < 0 || bandIndex > 7) {
      console.warn('[MultiTrackMixer] ⚠️ 参数超出范围:', { trackIndex, bandIndex });
      return;
    }
    
    if (gain < -1.0 || gain > 1.0) {
      console.warn('[MultiTrackMixer] ⚠️ 增益超出范围:', gain);
      gain = Math.max(-1.0, Math.min(1.0, gain));
    }
    
    MultiTrackMixer.setTrackBandGain(trackIndex, bandIndex, gain);
  }
  
  /**
   * 批量设置多路音轨增益（带 Anti-Clipping）
   */
  async setMultiTrackGains(gains: TrackBandGain[]): Promise<MultiTrackGainResult> {
    try {
      // 应用所有增益
      gains.forEach(({ trackIndex, bandIndex, gain }) => {
        this.setTrackBandGain(trackIndex, bandIndex, gain);
      });
      
      // 触发 Anti-Clipping 归一化
      const result = await MultiTrackMixer.setMultiTrackGains();
      
      console.log('[MultiTrackMixer] 🎛️ 多轨增益设置完成:', {
        masterGain: result.masterGain.toFixed(2),
        totalEnergy: result.totalEnergy.toFixed(2),
        isClipping: result.isClipping
      });
      
      return result;
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 设置多轨增益失败:', error);
      throw error;
    }
  }
  
  /**
   * 播放某路音轨
   */
  async playTrack(trackIndex: number, uri: string): Promise<void> {
    try {
      await MultiTrackMixer.playTrack(trackIndex, uri);
      console.log('[MultiTrackMixer] ▶️ 播放音轨:', trackIndex);
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 播放失败:', error);
      throw error;
    }
  }
  
  /**
   * 暂停某路音轨
   */
  async pauseTrack(trackIndex: number): Promise<void> {
    try {
      await MultiTrackMixer.pauseTrack(trackIndex);
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 暂停失败:', error);
    }
  }
  
  /**
   * 停止某路音轨
   */
  async stopTrack(trackIndex: number): Promise<void> {
    try {
      await MultiTrackMixer.stopTrack(trackIndex);
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 停止失败:', error);
    }
  }
  
  /**
   * 设置主音量
   */
  async setMasterVolume(volume: number): Promise<void> {
    try {
      await MultiTrackMixer.setMasterVolume(volume);
      console.log('[MultiTrackMixer] 🔊 主音量:', volume.toFixed(2));
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 设置主音量失败:', error);
    }
  }
  
  /**
   * 释放资源
   */
  async release(): Promise<void> {
    try {
      await MultiTrackMixer.release();
      this.isInitialized = false;
      console.log('[MultiTrackMixer] 🧹 资源已释放');
    } catch (error) {
      console.error('[MultiTrackMixer] ❌ 释放失败:', error);
    }
  }
  
  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// 导出单例
export const multiTrackMixer = new MultiTrackMixerModule();

export default multiTrackMixer;
