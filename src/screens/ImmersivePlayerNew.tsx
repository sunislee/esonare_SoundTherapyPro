import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Image,
  StatusBar,
  ActivityIndicator,
  Modal,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { useAudio } from '../context/AudioContext';
import AnimatedFloatingButton from '../components/AnimatedFloatingButton';
import { SoundscapeBottomSheet } from '../components/SoundscapeBottomSheet';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useBackHandler } from '../hooks/useBackHandler';

const { width, height } = Dimensions.get('window');

const events = [
  Event.PlaybackQueueEnded,
  Event.PlaybackTrackChanged,
  Event.PlaybackState,
];

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;

const ImmersivePlayerNew: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isPlaying } = usePlayerState();

  const [isLoading, setIsLoading] = useState(false);
  const [isSoundscapeVisible, setIsSoundscapeVisible] = useState(false);
  const [isExitModalVisible, setIsExitModalVisible] = useState(false);
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const pendingSceneIdRef = useRef<string | null>(null);

  const {
    currentBaseSceneId,
    activeSmallSceneIds,
    toggleAmbience,
  } = useAudio();

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  // DO NOT TOUCH: Stable logic for scene switching - 获取目标场景
  const targetSceneId = currentBaseSceneId || route.params?.sceneId || SCENES[0].id;
  const targetScene = useMemo(() => 
    SCENES.find(s => s.id === targetSceneId) || SCENES[0]
  , [targetSceneId]);
  const titleSceneId = currentBaseSceneId || targetScene.id;
  const titleScene = useMemo(() => 
    SCENES.find(s => s.id === titleSceneId) || targetScene
  , [titleSceneId, targetScene]);

  // 条件分支返回逻辑
  const handleBackPress = () => {
    triggerHaptic();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true; // 已消费事件
    }
    // 已在主页，无页面可退 → 弹出退出确认
    setIsExitModalVisible(true);
    return true;
  };

  const confirmExit = () => {
    setIsExitModalVisible(false);
    navigation.navigate('MainTabs');
  };
  const cancelExit = () => setIsExitModalVisible(false);

  // 注册系统返回键拦截，并在卸载时移除
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => sub.remove();
    }, [handleBackPress])
  );

  // DO NOT TOUCH: Stable logic for scene switching - 背景颜色计算
  const placeholderColor = useMemo(() => {
    if (targetScene.id.includes('ocean') || targetScene.id.includes('deep_sea')) return '#001a33';
    if (targetScene.id.includes('forest')) return '#1a2e1a';
    return '#121212';
  }, [targetScene.id]);

  // DO NOT TOUCH: Stable logic for scene switching - 路由参数变化时重新初始化播放器
  useEffect(() => {
    const sceneIdFromRoute = route.params?.sceneId;
    if (sceneIdFromRoute && sceneIdFromRoute !== currentBaseSceneId) {
      console.log(`[ImmersivePlayer] Route param changed -> ${sceneIdFromRoute}, reloading scene.`);
      AudioService.switchSoundscape(SCENES.find(s => s.id === sceneIdFromRoute) || SCENES[0]);
    }
  }, [route.params?.sceneId]);

  useTrackPlayerEvents(events, (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      console.log('[ImmersivePlayer] Playback queue ended');
    }
  });

  useEffect(() => {
    const unsubscribeLoading = AudioService.addLoadingListener(({ loading, id }) => {
      setIsLoading(loading);
      if (!loading && pendingSceneIdRef.current && id === pendingSceneIdRef.current) {
        setIsSoundscapeVisible(false);
        pendingSceneIdRef.current = null;
      }
    });
    return () => {
      unsubscribeLoading();
    };
  }, []);

  // DO NOT TOUCH: Stable logic for scene switching - 页面初始化
  useEffect(() => {
    const initPage = async () => {
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      const currentPlayingId = AudioService.getCurrentScene()?.id;
      AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', targetScene.id).catch(() => {});

      if (currentPlayingId === targetScene.id) {
        console.log(`[ImmersivePlayer] Scene ${targetScene.id} is already playing.`);
      } else {
        console.log(`[ImmersivePlayer] Switching to scene ${targetScene.id}.`);
        await AudioService.switchSoundscape(targetScene);
      }
    };

    initPage();

    return () => {
      console.log('[ImmersivePlayer] Stopping all ambient sounds on exit.');
      AudioService.stopAllAmbient();
    };
  }, [targetScene.id]);

  const togglePlayback = async () => {
    triggerHaptic();
    if (isPlaying) {
      await AudioService.pause();
    } else {
      await AudioService.play();
    }
  };

  const openSoundscapeSheet = () => {
    triggerHaptic();
    setIsSoundscapeVisible(true);
  };

  const closeSoundscapeSheet = () => {
    setIsSoundscapeVisible(false);
  };

  // DO NOT TOUCH: Stable logic for scene switching - 场景选择处理
  const handleSelectSoundscape = async (scene: Scene) => {
    if (scene.id === currentBaseSceneId) {
      setIsSoundscapeVisible(false);
      return;
    }
    setIsSoundscapeVisible(false);
    console.log(`Target ID: ${scene.id}, Current UI ID: ${currentBaseSceneId ?? 'null'}`);
    pendingSceneIdRef.current = scene.id;
    try {
      await AudioService.switchSoundscape(scene);
    } catch (error) {
      pendingSceneIdRef.current = null;
      throw error;
    }
  };

  const displayScenes = useMemo(() => SCENES.filter(s => s.isBaseScene), []);

  const renderScenePage = (scene: Scene, index: number) => {
    if (!scene) return <View key={`empty-${index}`} style={styles.page} />;

    const globalAmbientScenes = SMALL_SCENE_IDS.map(id =>
      SCENES.find(s => s.id === id)
    ).filter(Boolean) as Scene[];

    return (
      <View key={scene.id} style={[styles.page, { backgroundColor: '#121212' }]}>
        {/* 背景图：提升 zIndex 避免被 overlay 遮挡 */}
        {scene.backgroundSource ? (
          <Image source={scene.backgroundSource} style={styles.backgroundImage} />
        ) : (
          <View style={[styles.backgroundFallback, { backgroundColor: placeholderColor }]} />
        )}

        <View style={styles.backgroundOverlay} />

        <View style={[styles.mainContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <Icon name="chevron-down" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>

          <Text key={titleSceneId} style={styles.sceneTitle}>
            {t(`scenes.${titleScene.id}.title`, { defaultValue: titleScene.title })}
          </Text>

          {/* 交互按钮 */}
          <View style={styles.floatingIconsContainer} pointerEvents="box-none">
            {globalAmbientScenes.map((ambient, idx) => {
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
                    toggleAmbience(ambient, 'Floating Icon');
                  }}
                />
              );
            })}
          </View>

          {/* 底部控制：场景切换按钮提升 zIndex */}
          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={styles.scenePickerButton}
              onPress={openSoundscapeSheet}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="grid-outline" size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.playButton, isLoading && styles.playButtonDisabled]} 
              onPress={togglePlayback}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Icon 
                  name={isPlaying ? "pause" : "play"} 
                  size={40} 
                  color="#FFF" 
                  style={!isPlaying && { marginLeft: 5 }}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentFadeAnim }]}>
      {renderScenePage(targetScene, 0)}

      {/* 二次确认退出弹窗 */}
      <Modal transparent visible={isExitModalVisible} animationType="fade" onRequestClose={cancelExit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>确定要退出吗？</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={cancelExit}>
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={confirmExit}>
                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SoundscapeBottomSheet
        visible={isSoundscapeVisible}
        soundscapes={displayScenes}
        selectedId={currentBaseSceneId || targetScene.id}
        onClose={closeSoundscapeSheet}
        onSelect={handleSelectSoundscape}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  page: { width, minHeight: height },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width,
    minHeight: height,
    resizeMode: 'cover',
    zIndex: 0, // 背景层最底
  },
  backgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    width,
    minHeight: height,
    zIndex: 0,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1, // 遮罩中间层
  },
  mainContainer: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 2, // 内容层最上
  },
  header: {
    minHeight: 60,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingIconsContainer: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 20,
  },
  bottomSection: {
    paddingBottom: 60,
    paddingHorizontal: 24,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    zIndex: 3, // 确保按钮在最上层
  },
  sceneTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  scenePickerButton: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },

  // 二次确认弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonPrimary: { backgroundColor: '#6C5DD3' },
  modalButtonText: { color: '#fff', fontSize: 16 },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '600' },
});

export default ImmersivePlayerNew;