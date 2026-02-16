import React, { useMemo, useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { useAudio } from '../context/AudioContext';
import AnimatedFloatingButton from '../components/AnimatedFloatingButton';
import { SoundscapeBottomSheet } from '../components/SoundscapeBottomSheet';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

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

  // 获取目标场景
  const targetSceneId = currentBaseSceneId || route.params?.sceneId || SCENES[0].id;
  const targetScene = useMemo(() => 
    SCENES.find(s => s.id === targetSceneId) || SCENES[0]
  , [targetSceneId]);
  const titleSceneId = currentBaseSceneId || targetScene.id;
  const titleScene = useMemo(() => 
    SCENES.find(s => s.id === titleSceneId) || targetScene
  , [titleSceneId, targetScene]);

  const placeholderColor = useMemo(() => {
    if (targetScene.id.includes('ocean') || targetScene.id.includes('deep_sea')) return '#001a33';
    if (targetScene.id.includes('forest')) return '#1a2e1a';
    return '#121212';
  }, [targetScene.id]);

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

  useEffect(() => {
    const initPage = async () => {
      // 内容同步浮现 (或稍晚)
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      const currentPlayingId = AudioService.getCurrentScene()?.id;
      
      // 保存最后播放的场景 ID，用于首页高亮记忆
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
      // 状态同步检查：退出页面时立即停止所有互动音效
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

  const handleBack = () => {
    triggerHaptic();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  const openSoundscapeSheet = () => {
    triggerHaptic();
    setIsSoundscapeVisible(true);
  };

  const closeSoundscapeSheet = () => {
    setIsSoundscapeVisible(false);
  };

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
      <View key={scene.id} style={[styles.page, { backgroundColor: '#121212' }]}>
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
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backButton}
            >
              <Icon name="chevron-down" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text key={titleSceneId} style={styles.sceneTitle}>
            {t(`scenes.${titleScene.id}.title`, { defaultValue: titleScene.title })}
          </Text>

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
                  onPress={() => {
                    triggerHaptic();
                    toggleAmbience(ambient, 'Floating Icon');
                  }}
                />
              );
            })}
          </View>

          {/* 底部控制区 - 统一布局：标题 + 播放按钮 */}
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
      {/* 实际项目中这里通常配合 PagerView 使用 */}
      {renderScenePage(targetScene, 0)}
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    width: width,
    minHeight: height,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    minHeight: height,
    resizeMode: 'cover',
    zIndex: 0,
  },
  backgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    minHeight: height,
    zIndex: 0,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1,
  },
  mainContainer: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 2,
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
    zIndex: 3,
  },
  sceneTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 14,
    textAlign: 'center',
    width: '100%',
  },
  scenePickerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  playButton: {
    width: 80,
    minHeight: 80,
    borderRadius: 40,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  playButtonDisabled: {
    opacity: 0.7,
  },
});

export default ImmersivePlayerNew;
