import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useAudio } from '../context/AudioContext';

/**
 * QuickPresets - 8-BAND EQ 快速预设面板
 *
 * 增益契约（与原生层 android/.../AudioLevelModule.kt 对齐）：
 *   updateEqGain(index, gain) → AudioLevelModule.setTrackBandGain(0, index, gain)
 *   gain ∈ [-1, +1]：0 = 平响(0dB)，+1 = +12dB，-1 = -12dB
 *   因此预设 dB 曲线 → gain = clamp(db / 12, -1, 1)
 *
 * 注意：每次应用必须【完整写入 8 个频段】——
 * updateEqGain 内部 50ms 防抖会把整个 eqGains 数组推给原生层，
 * 只写部分频段会把其它频段的陈旧值一起推下去。
 */

// 一个快速预设 = 8 频段 dB 曲线（频段对应 EQ_FREQUENCIES：60/150/400/1k/2.5k/5k/10k/16kHz）
interface QuickEqPreset {
  id: string;
  gainsDb: number[]; // 8 个值，范围 [-12, 12]
}

const QUICK_EQ_PRESETS: QuickEqPreset[] = [
  // 默认：全频段平响
  { id: 'flat', gainsDb: [0, 0, 0, 0, 0, 0, 0, 0] },
  // 低音：增强低频能量，衰减极高频
  { id: 'bass', gainsDb: [4, 3, 1.5, 0, 0, 0, -1, -2] },
  // 人声：突出中频，压低两端
  { id: 'vocal', gainsDb: [-1, -0.5, 2, 2.5, 2, 0.5, -1, -1.5] },
  // 高音：增强高频空气感
  { id: 'treble', gainsDb: [-2, -1, 0, 1, 1.5, 2.5, 3.5, 3] },
  // 睡眠：低频包裹 + 大幅削减高频（参考 SCENE_EQ_PRESETS.deepSleep）
  { id: 'sleep', gainsDb: [3, 2.5, 1, 0, -1, -2, -4, -6] },
  // 专注：轻提中高频（参考 SCENE_EQ_PRESETS.alpha）
  { id: 'focus', gainsDb: [0, 0, 0, 0, 1.5, 2.5, 1.5, 0] },
];

// dB → 原生增益（-1 ~ +1）
const dbToGain = (db: number) => Math.max(-1, Math.min(1, db / 12));

const QuickPresets: React.FC = () => {
  const { t } = useTranslation();
  const { updateEqGain } = useAudio();
  const [activeId, setActiveId] = useState<string>('flat');

  const handleSelect = useCallback(
    (preset: QuickEqPreset) => {
      ReactNativeHapticFeedback.trigger('selection', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
      // 完整写入 8 段，保证防抖发出的数组是完整预设曲线
      preset.gainsDb.forEach((db, index) => {
        updateEqGain(index, dbToGain(db));
      });
      setActiveId(preset.id);
    },
    [updateEqGain]
  );

  return (
    <View style={styles.container}>
      {QUICK_EQ_PRESETS.map((preset) => {
        const active = preset.id === activeId;
        return (
          <TouchableOpacity
            key={preset.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => handleSelect(preset)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {t(`player.quickPresets.${preset.id}`, { defaultValue: preset.id })}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: '#6C5DD3',
    borderColor: '#6C5DD3',
  },
  label: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default QuickPresets;
