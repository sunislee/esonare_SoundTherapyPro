import { NativeModules } from 'react-native';

const { AudioLevelModule } = NativeModules;

/**
 * 原生 8 段均衡器桥接模块
 * 封装 Android Equalizer API
 */
export const NativeEQ = {
  /**
   * 初始化均衡器
   * @param audioSessionId 音频会话 ID
   */
  initEqualizer: (audioSessionId: number) => {
    if (AudioLevelModule) {
      AudioLevelModule.initEqualizer(audioSessionId);
      console.log('[NativeEQ] 均衡器初始化，SessionID:', audioSessionId);
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
      AudioLevelModule.updateNativeEQ(index, gain);
    } else {
      console.warn('[NativeEQ] AudioLevelModule 不可用');
    }
  },

  /**
   * 重置均衡器到默认值 (0dB)
   */
  resetEqualizer: () => {
    if (AudioLevelModule) {
      AudioLevelModule.resetEqualizer();
      console.log('[NativeEQ] 均衡器已重置');
    }
  },

  /**
   * 释放均衡器资源
   */
  releaseEqualizer: () => {
    if (AudioLevelModule) {
      AudioLevelModule.releaseEqualizer();
      console.log('[NativeEQ] 均衡器已释放');
    }
  },
};
