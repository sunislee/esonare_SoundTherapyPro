import React, { useCallback, memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Scene } from '../constants/scenes';
import AnimatedFloatingButton from './AnimatedFloatingButton';
import AudioService from '../services/AudioService';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useAudio } from '../context/AudioContext';

interface InteractiveButtonsProps {
  globalAmbientScenes: Scene[];
  activeSmallSceneIds: string[];
}

const InteractiveButtons: React.FC<InteractiveButtonsProps> = ({
  globalAmbientScenes,
  activeSmallSceneIds,
}) => {
  const { toggleAmbience } = useAudio();
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
