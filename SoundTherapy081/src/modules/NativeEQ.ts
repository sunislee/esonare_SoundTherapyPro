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
   * 【虚拟 8 段 EQ】多轨混音模式
   */
  set8BandEQ: (gains: number[]) => {
    // 导入多轨音频服务
    import('../services/MultiTrackAudioService').then(({ set8BandEQ }) => {
      set8BandEQ(gains);
    }).catch(err => {
      console.error('[NativeEQ] 虚拟 8 段 EQ 失败:', err);
    });
  },
};
