import React, { useCallback, memo, useMemo } from 'react';
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
  console.log('[InteractiveButtons] 🔄 Rendered, activeSmallSceneIds:', activeSmallSceneIds);
  const { toggleAmbience } = useAudio();
  const insets = useSafeAreaInsets();
  const triggerHaptic = useCallback(() => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  }, []);
  
  // 【优化】预计算按钮布局数据，避免每次渲染都重新计算
  const buttonLayouts = useMemo(() => {
    return globalAmbientScenes.map((ambient, idx) => ({
      ambient,
      idx,
      isActive: activeSmallSceneIds.includes(ambient.id),
      column: idx % 2,
      row: Math.floor(idx / 2),
    }));
  }, [globalAmbientScenes, activeSmallSceneIds]);
  
  console.log('[InteractiveButtons] buttonLayouts:', buttonLayouts.map(b => ({ id: b.ambient.id, isActive: b.isActive })));
  
  const handlePress = useCallback(async (ambient: Scene, targetState: boolean) => {
    triggerHaptic();
    console.log('[InteractiveButtons] Toggle ambience:', ambient.id, 'isActive:', targetState);

    // 点击时先确保资源已下载（复用HomeScreen的prioritizeScene逻辑）
    import('../services/DownloaderService').then(({ DownloaderServiceInstance }) => {
      console.log(`[InteractiveButtons] 🚀 [handlePress] 触发下载: ${ambient.id}, targetState: ${targetState}`);
      DownloaderServiceInstance.addTaskToQueue(ambient.id);
      DownloaderServiceInstance.startDownload();
    });

    await toggleAmbience(ambient, targetState);
  }, [triggerHaptic, toggleAmbience]);
  
  const renderButton = useCallback((layout: { ambient: Scene; idx: number; isActive: boolean; column: number; row: number }) => {
    return (
      <AnimatedFloatingButton
        key={`floating-${layout.ambient.id}`}
        ambient={layout.ambient}
        isActive={layout.isActive}
        column={layout.column}
        row={layout.row}
        onPress={() => {
          const targetState = !layout.isActive;
          handlePress(layout.ambient, targetState);
        }}
      />
    );
  }, [handlePress]);

  return (
    <View style={[styles.floatingIconsContainer, { height: getDynamicHeight(insets) }]} pointerEvents="box-none">
      {buttonLayouts.map(renderButton)}
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
    return 330; // 小屏 (如 iPhone SE)
  }
  if (totalHeight <= 750) {
    return 360; // 中小屏
  }
  if (totalHeight <= 850) {
    return 390; // 标准屏
  }
  return 430; // 大屏/平板
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
