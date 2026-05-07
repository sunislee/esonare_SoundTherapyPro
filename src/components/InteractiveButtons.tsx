import React, { useCallback, memo } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { Scene } from '../constants/scenes';
import AnimatedFloatingButton from './AnimatedFloatingButton';
import AudioService from '../services/AudioService';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useAudio } from '../context/AudioContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InteractiveButtonsProps {
  globalAmbientScenes: Scene[];
  activeSmallSceneIds: string[];
}

const InteractiveButtons: React.FC<InteractiveButtonsProps> = ({
  globalAmbientScenes,
  activeSmallSceneIds,
}) => {
  const { toggleAmbience } = useAudio();
  const insets = useSafeAreaInsets();
  const triggerHaptic = useCallback(() => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  }, []);

  const renderButton = useCallback((ambient: Scene, idx: number) => {
    const isActive = activeSmallSceneIds.includes(ambient.id);
    const column = idx % 2;
    const row = Math.floor(idx / 2);
    return (
      <AnimatedFloatingButton
        key={`floating-${ambient.id}`}
        ambient={ambient}
        isActive={isActive}
        column={column}
        row={row}
        onPress={async () => {
          triggerHaptic();
          // 计算目标状态
          const targetState = !activeSmallSceneIds.includes(ambient.id);
          console.log('[InteractiveButtons] Toggle ambience:', ambient.id, 'isActive:', targetState);
          // 通过 AudioContext 切换交互音
          await toggleAmbience(ambient, targetState);
        }}
      />
    );
  }, [globalAmbientScenes, triggerHaptic, activeSmallSceneIds, toggleAmbience]);

  return (
    <View style={[styles.floatingIconsContainer, { height: getDynamicHeight(insets) }]} pointerEvents="box-none">
      {globalAmbientScenes.map(renderButton)}
    </View>
  );
};

/**
 * 根据屏幕尺寸动态计算 InteractiveButtons 高度
 * 小屏压缩至 200-250px，确保底部控制区不被遮挡
 */
function getDynamicHeight(insets: { top: number; bottom: number }): number {
  const { height } = Dimensions.get('window');
  const totalHeight = height - insets.top - insets.bottom;
  
  if (totalHeight <= 680) {
    return 200; // 小屏 (如 iPhone SE)
  }
  if (totalHeight <= 750) {
    return 230; // 中小屏
  }
  if (totalHeight <= 850) {
    return 260; // 标准屏
  }
  return 300; // 大屏/平板
}

const { width } = Dimensions.get('window');
const CONTAINER_WIDTH = width - 40;

const styles = StyleSheet.create({
  floatingIconsContainer: {
    position: 'relative',
    width: CONTAINER_WIDTH,
  },
});

export default memo(InteractiveButtons);
