import { NativeModules } from 'react-native';

const { AudioLevelModule } = NativeModules;

/**
 * 原生 8 段均衡器桥接模块
 * 封装 Android Equalizer API
 */
export const NativeEQ = {
  /**
   * 初始化专业音频处理器
   */
  initializeProAudio: () => {
    if (AudioLevelModule) {
      AudioLevelModule.initializeProAudio();
      console.log('[NativeEQ] 专业音频处理器初始化完成');
    } else {
      console.warn('[NativeEQ] AudioLevelModule 不可用');
    }
  },

  /**
   * 更新均衡器增益
   * @param index 频段索引 (0-7)
   * @param gain 增益值 (-1.0 到 1.0)
   */
  updateNativeEQ: (index: number, gain: number) => {
    if (AudioLevelModule) {
      // 使用新的多轨增益 API（trackIndex=0 表示全局音轨）
      AudioLevelModule.setTrackBandGain(0, index, gain);
    } else {
      console.warn('[NativeEQ] AudioLevelModule 不可用');
    }
  },

  /**
   * 重置均衡器到默认值 (0dB)
   */
  resetEqualizer: () => {
    if (AudioLevelModule) {
      // 重置所有频段到 0
      for (let i = 0; i < 8; i++) {
        AudioLevelModule.setTrackBandGain(0, i, 0.0);
      }
      console.log('[NativeEQ] 均衡器已重置');
    }
  },

  /**
   * 释放均衡器资源
   */
  release: () => {
    if (AudioLevelModule) {
      AudioLevelModule.release();
      console.log('[NativeEQ] 均衡器已释放');
    }
  },

  /**
   * 【暴力实验】强行设置极端 EQ 预设
   */
  runExtremeTest: () => {
    if (AudioLevelModule) {
      AudioLevelModule.runExtremeTest();
      console.log('[NativeEQ] 🧪 暴力低音测试已触发');
    } else {
      console.warn('[NativeEQ] AudioLevelModule 不可用');
    }
  },
  
  /**
   * 【虚拟 8 段 EQ】使用原生 Equalizer API（影响全局音频，包括 TrackPlayer）
   */
  set8BandEQ: (gains: number[]) => {
    if (AudioLevelModule) {
      // 直接使用原生 Equalizer API，trackIndex=0 表示全局音轨
      gains.forEach((gain, index) => {
        AudioLevelModule.setTrackBandGain(0, index, gain);
      });
      console.log('[NativeEQ] 🎚️ 原生 8 段 EQ 已更新（全局音频）');
    } else {
      console.warn('[NativeEQ] AudioLevelModule 不可用');
    }
  },
};
