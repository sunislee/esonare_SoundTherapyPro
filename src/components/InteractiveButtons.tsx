import React, { useCallback, memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Scene } from '../constants/scenes';
import AnimatedFloatingButton from './AnimatedFloatingButton';
import AudioService from '../services/AudioService';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface InteractiveButtonsProps {
  globalAmbientScenes: Scene[];
  activeSmallSceneIds: string[];
  setActiveSmallSceneIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const InteractiveButtons: React.FC<InteractiveButtonsProps> = ({
  globalAmbientScenes,
  activeSmallSceneIds,
  setActiveSmallSceneIds,
}) => {
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
        onPress={() => {
          triggerHaptic();
          // UI 立即响应：先更新本地状态
          setActiveSmallSceneIds(prev => {
            const newActive = prev.includes(ambient.id)
              ? prev.filter(id => id !== ambient.id)
              : [...prev, ambient.id];
            console.log('[InteractiveButtons] Toggle ambience:', ambient.id, 'isActive:', !prev.includes(ambient.id), 'newActive:', newActive);
            return newActive;
          });
          // 异步执行音频操作，不阻塞 UI
          setImmediate(() => {
            AudioService.toggleAmbience(ambient);
          });
        }}
      />
    );
  }, [globalAmbientScenes, triggerHaptic, setActiveSmallSceneIds, activeSmallSceneIds]);

  return (
    <View style={styles.floatingIconsContainer} pointerEvents="box-none">
      {globalAmbientScenes.map(renderButton)}
    </View>
  );
};

const { width } = Dimensions.get('window');
const CONTAINER_WIDTH = width - 40;

const styles = StyleSheet.create({
  floatingIconsContainer: {
    position: 'relative',
    width: CONTAINER_WIDTH,
    height: 300,
  },
});

export default memo(InteractiveButtons);
