import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { useAudio } from '../context/AudioContext';
import AnimatedFloatingButton from '../components/AnimatedFloatingButton';

const { width, height } = Dimensions.get('window');

const ImmersivePlayerNew: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentBaseSceneId,
    activeSmallSceneIds,
    toggleAmbience,
    isPlaying,
  } = useAudio();

  // 获取所有基础场景（用于 Pager 轮播）
  const displayScenes = useMemo(() => {
    return SCENES.filter(s => s.isBaseScene);
  }, []);

  const renderScenePage = (scene: Scene, index: number) => {
    if (!scene) return <View key={`empty-${index}`} style={styles.page} />;

    // 固定的 8 个交互按钮数据
    const globalAmbientScenes = SMALL_SCENE_IDS.map(id =>
      SCENES.find(s => s.id === id)
    ).filter(Boolean) as Scene[];

    return (
      <View key={scene.id} style={styles.page}>
        <SafeAreaView style={styles.overlay}>
          {/* 顶部占位 */}
          <View style={styles.headerPlaceholder} />

          {/* 交互按钮容器 */}
          <View style={styles.floatingIconsContainer} pointerEvents="box-none">
            {globalAmbientScenes.map((ambient, idx) => {
              // 💡 重点：确保 isActive 直接读取自 Context 的 activeSmallSceneIds，实时响应 AudioService 状态变化
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
                  onPress={() => toggleAmbience(ambient, 'Floating Icon')}
                />
              );
            })}
          </View>

          {/* 底部控制区（示例） */}
          <View style={styles.bottomSection}>
            <Text style={styles.sceneTitle}>{t(scene.title)}</Text>
            {/* 这里原先可能有播放按钮等逻辑 */}
          </View>
        </SafeAreaView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 实际项目中这里通常配合 PagerView 使用 */}
      {displayScenes.map((scene, index) => {
        if (scene.id === currentBaseSceneId) {
            return renderScenePage(scene, index);
        }
        return null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    width: width,
    height: height,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerPlaceholder: {
    height: 80,
  },
  floatingIconsContainer: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 20,
  },
  bottomSection: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  sceneTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

export default ImmersivePlayerNew;