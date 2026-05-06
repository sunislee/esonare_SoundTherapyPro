import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Image,
  ActivityIndicator,
  Modal,
  BackHandler,
} from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { useAudio } from '../context/AudioContext';
import InteractiveButtons from '../components/InteractiveButtons';
import { SoundscapeBottomSheet } from '../components/SoundscapeBottomSheet';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import { Event, useTrackPlayerEvents, State } from 'react-native-track-player';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useBackHandler } from '../hooks/useBackHandler';
import { sceneRoamManager } from '../services/SceneRoamManager';

const { width, height } = Dimensions.get('window');

// ==================== 呼吸动画配置（可按场景分类调整） ====================
interface BreathingConfig {
  duration: number;      // 单程动画时长（毫秒），完整周期 = duration * 2
  maxScale: number;      // 最大缩放值（1.0 为原始大小）
}

// 默认配置：所有场景通用
const DEFAULT_BREATHING_CONFIG: BreathingConfig = {
  duration: 7500,    // 7.5 秒放大 + 7.5 秒缩小 = 15 秒完整周期
  maxScale: 1.08,    // 放大到 108%
};

// 按场景分类的差异化配置（未来可扩展）
const BREATHING_CONFIGS: Record<string, BreathingConfig> = {
  // 自然场景：较慢节奏
  nature: { duration: 9000, maxScale: 1.06 },
  
  // 西方教会场景：中等节奏
  western_church: { duration: 7500, maxScale: 1.08 },
  
  // 生活场景：较快节奏
  life: { duration: 6000, maxScale: 1.05 },
  
  // 疗愈场景：缓慢节奏
  healing: { duration: 10000, maxScale: 1.04 },
  
  // 脑波场景：极慢节奏
  brainwave: { duration: 12000, maxScale: 1.03 },
};

/**
 * 根据场景 ID 获取对应的呼吸动画配置
 */
function getBreathingConfig(sceneId: string): BreathingConfig {
  // 匹配场景分类前缀
  for (const [prefix, config] of Object.entries(BREATHING_CONFIGS)) {
    if (sceneId.startsWith(prefix)) {
      return config;
    }
  }
  return DEFAULT_BREATHING_CONFIG;
}
// ========================================================================

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
  const [isRoaming, setIsRoaming] = useState(false);
  const [bgLoadTimeout, setBgLoadTimeout] = useState(false);
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const bgScaleAnim = useRef(new Animated.Value(1.0)).current;
  const pendingSceneIdRef = useRef<string | null>(null);
  const bgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    currentBaseSceneId,
    toggleAmbience,
    activeSmallSceneIds,
  } = useAudio();

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  // DO NOT TOUCH: Stable logic for scene switching - 获取目标场景
  // 【关键修复】优先使用 route params，确保每次点击都触发场景切换
  const routeSceneId = route.params?.sceneId;
  const targetSceneId = routeSceneId || currentBaseSceneId || SCENES[0].id;
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

  // 背景图呼吸感缩放动画 - 使用可配置参数
  useEffect(() => {
    const config = getBreathingConfig(targetScene.id);
    console.log('[BreathingAnim] Starting for scene:', targetScene.id, 
      '| Duration:', config.duration, 'ms | MaxScale:', config.maxScale);
    
    // 重置动画状态
    bgScaleAnim.setValue(1.0);
    
    const breathingLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bgScaleAnim, {
          toValue: config.maxScale,
          duration: config.duration,
          useNativeDriver: true,
        }),
        Animated.timing(bgScaleAnim, {
          toValue: 1.0,
          duration: config.duration,
          useNativeDriver: true,
        }),
      ])
    );
    
    // 添加监听器确认数值变化
    const listenerId = bgScaleAnim.addListener(({ value }) => {
      console.log(`[BreathingAnim] Scale=${value.toFixed(4)}`);
    });
    
    breathingLoop.start(() => {
      console.log('[BreathingAnim] Animation completed');
    });
    
    return () => {
      console.log('[BreathingAnim] Stopping for scene:', targetScene.id);
      breathingLoop.stop();
      bgScaleAnim.removeListener(listenerId);
    };
  }, [targetScene.id]);  // 场景切换时重新触发动画

  // DO NOT TOUCH: Stable logic for scene switching - 路由参数变化时重新初始化播放器
  useEffect(() => {
    const sceneIdFromRoute = route.params?.sceneId;
    if (sceneIdFromRoute && sceneIdFromRoute !== currentBaseSceneId) {
      console.log(`[ImmersivePlayer] Route param changed -> ${sceneIdFromRoute}, reloading scene.`);
      const audioService = AudioService.getInstance();
      
      // 防御性检查：确保 AudioService 已准备好
      if (!audioService.isReady()) {
        console.warn('[ImmersivePlayer] ⚠️ AudioService 未准备好，延迟重试');
        const retryTimer = setTimeout(() => {
          if (audioService.isReady()) {
            audioService.switchSoundscape(SCENES.find(s => s.id === sceneIdFromRoute) || SCENES[0]);
          } else {
            console.error('[ImmersivePlayer] ❌ AudioService 初始化超时，跳过场景切换');
          }
        }, 500);
        return () => clearTimeout(retryTimer);
      }
      
      audioService.switchSoundscape(SCENES.find(s => s.id === sceneIdFromRoute) || SCENES[0]);
    }
  }, [route.params?.sceneId]);

  useTrackPlayerEvents(events, (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      console.log('[ImmersivePlayer] Playback queue ended');
    }
  });

  // 页面获得焦点时刷新播控状态
  useFocusEffect(
    useCallback(() => {
      console.log('[ImmersivePlayer] Page focused, checking playback status...');
      
      // 检查当前播放状态并刷新通知
      if (isPlaying && targetScene) {
        console.log('[ImmersivePlayer] Refreshing notification for scene:', targetScene.id);
        import('../services/NotificationService').then(({ NotificationService }) => {
          NotificationService.updateNotification(targetScene, State.Playing);
        }).catch(error => {
          console.error('[ImmersivePlayer] Failed to refresh notification:', error);
        });
      }
      
      return () => {
        // 清理逻辑
      };
    }, [isPlaying, targetScene])
  );

  useEffect(() => {
    const audioService = AudioService.getInstance();
    
    // 防御性检查：确保 AudioService 已准备好
    if (!audioService.isReady()) {
      console.warn('[ImmersivePlayer] ⚠️ AudioService 未准备好，跳过加载监听器');
      return;
    }
    
    const unsubscribeLoading = audioService.addLoadingListener(({ loading, id }) => {
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


  // 【已禁用】背景图加载超时机制 - 因 backgroundSource 每次渲染都创建新引用，导致 3 秒后误隐藏
  // 改用 Image 的 onError 处理加载失败
  useEffect(() => {
    setBgLoadTimeout(false);
  }, [targetScene.id]);

  // DO NOT TOUCH: Stable logic for scene switching - 页面初始化
  useEffect(() => {
    const audioService = AudioService.getInstance();
    
    // 防御性检查：确保 AudioService 已准备好
    if (!audioService.isReady()) {
      console.warn('[ImmersivePlayer] ⚠️ AudioService 未准备好，延迟初始化');
      const retryTimer = setTimeout(() => {
        if (audioService.isReady()) {
          initPage(audioService);
        } else {
          console.error('[ImmersivePlayer] ❌ AudioService 初始化超时，跳过页面初始化');
        }
      }, 500);
      return () => clearTimeout(retryTimer);
    }
    
    const initPage = async (service: typeof audioService) => {
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      const currentPlayingId = service.getCurrentScene()?.id;
      AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', targetScene.id).catch(() => {});

      if (currentPlayingId === targetScene.id) {
        console.log(`[ImmersivePlayer] Scene ${targetScene.id} is already playing.`);
      } else {
        console.log(`[ImmersivePlayer] Switching to scene ${targetScene.id}.`);
        await service.switchSoundscape(targetScene);
      }
    };

    initPage(audioService);

    return () => {
      console.log('[ImmersivePlayer] Stopping all ambient sounds on exit.');
      if (audioService.isReady()) {
        audioService.stopAllAmbient();
      }
    };
  }, [targetScene.id]);

  const togglePlayback = async () => {
    triggerHaptic();
    const audioService = AudioService.getInstance();
    
    // 防御性检查：确保 AudioService 已准备好
    if (!audioService.isReady()) {
      console.log('[ImmersivePlayer] ⏳ AudioService 未准备好，触发初始化...');
      setIsLoading(true);
      try {
        await audioService.setupPlayer();
        let waitCount = 0;
        while (!audioService.isReady() && waitCount < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        if (!audioService.isReady()) {
          console.warn('[ImmersivePlayer] ⚠️ 初始化超时');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.error('[ImmersivePlayer] ❌ 初始化失败:', e);
        setIsLoading(false);
        return;
      }
    }
    
    if (isPlaying) {
      await audioService.pause();
    } else {
      setIsLoading(true);
      try {
        await audioService.play();
      } catch (e) {
        console.error('[ImmersivePlayer] ❌ 播放失败:', e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const openSoundscapeSheet = () => {
    triggerHaptic();
    setIsSoundscapeVisible(true);
  };

  const closeSoundscapeSheet = () => {
    setIsSoundscapeVisible(false);
  };

  const toggleRoaming = useCallback(() => {
    triggerHaptic();
    if (isRoaming) {
      sceneRoamManager.stopRoaming();
      setIsRoaming(false);
      console.log('[ImmersivePlayer] 漫游模式已关闭');
    } else {
      const category = targetScene.category;
      sceneRoamManager.startRoaming(category);
      sceneRoamManager.recordPlayedScene(targetScene.id);
      setIsRoaming(true);
      console.log(`[ImmersivePlayer] 漫游模式已开启: ${category}`);
    }
  }, [isRoaming, targetScene]);

  // DO NOT TOUCH: Stable logic for scene switching - 场景选择处理
  const handleSelectSoundscape = async (scene: Scene) => {
    if (scene.id === currentBaseSceneId) {
      setIsSoundscapeVisible(false);
      return;
    }
    setIsSoundscapeVisible(false);
    console.log(`Target ID: ${scene.id}, Current UI ID: ${currentBaseSceneId ?? 'null'}`);
    pendingSceneIdRef.current = scene.id;
    
    // 如果处于漫游模式，更新漫游分类和记录
    if (isRoaming) {
      sceneRoamManager.stopRoaming();
      sceneRoamManager.startRoaming(scene.category);
      sceneRoamManager.recordPlayedScene(scene.id);
    }
    
    const audioService = AudioService.getInstance();
    try {
      await audioService.switchSoundscape(scene);
    } catch (error) {
      pendingSceneIdRef.current = null;
      throw error;
    }
  };

  const displayScenes = useMemo(() => SCENES.filter(s => s.isBaseScene), []);
  const globalAmbientScenes = useMemo(() => 
    SMALL_SCENE_IDS.map(id => SCENES.find(s => s.id === id)).filter(Boolean) as Scene[]
  , []);

  console.log('[ImmersivePlayer] Rendered, activeSmallSceneIds:', activeSmallSceneIds);

  const renderScenePage = (scene: Scene, index: number) => {
    if (!scene) return <View key={`empty-${index}`} style={styles.page} />;

    return (
      <View key={scene.id} style={[styles.page, { backgroundColor: '#121212' }]}>
        {/* 背景图：使用 fade 过渡避免翻转，3秒超时显示占位图 */}
        {scene.backgroundSource && !bgLoadTimeout ? (
          <Animated.Image
            source={scene.backgroundSource}
            style={[
              styles.backgroundImage,
              { transform: [{ scale: bgScaleAnim }] }
            ]}
            fadeDuration={0}
            onLoad={() => {
              if (bgTimeoutRef.current) {
                clearTimeout(bgTimeoutRef.current);
                bgTimeoutRef.current = null;
              }
            }}
          />
        ) : (
          <View style={[styles.backgroundFallback, { backgroundColor: placeholderColor }]} />
        )}

        <View style={styles.backgroundOverlay} />

        <View style={[styles.mainContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <Icon name="chevron-down" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>

          <Text key={titleSceneId} style={styles.sceneTitle} numberOfLines={1} adjustsFontSizeToFit>
            {t(`scenes.${titleScene.id}.title`, { defaultValue: titleScene.title })}
          </Text>

          {/* 交互按钮 */}
          <InteractiveButtons
            globalAmbientScenes={globalAmbientScenes}
            activeSmallSceneIds={activeSmallSceneIds}
          />

          {/* 底部控制：场景切换按钮提升 zIndex */}
          <View style={styles.bottomSection}>
            {/* 紫色胶囊漫游开关 */}
            <TouchableOpacity
              style={[styles.roamCapsule, isRoaming && styles.roamCapsuleActive]}
              onPress={toggleRoaming}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon 
                name={isRoaming ? "shuffle" : "shuffle-outline"} 
                size={18} 
                color={isRoaming ? "#FFF" : "rgba(255,255,255,0.6)"} 
              />
              <Text style={[styles.roamText, isRoaming && styles.roamTextActive]}>
                {isRoaming ? t('player.roaming') : t('player.roam')}
              </Text>
            </TouchableOpacity>

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
                  style={{ marginLeft: 5 }}
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
  page: { width, minHeight: height, overflow: 'hidden' },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width,
    minHeight: height,
    resizeMode: 'cover',
    zIndex: 0,
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
    paddingTop: 12,
    paddingBottom: 60,
    paddingHorizontal: 24,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    zIndex: 3, // 确保按钮在最上层
    gap: 12, // 按钮间距统一控制
  },
  sceneTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  scenePickerButton: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
  },
  roamCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(108, 93, 211, 0.3)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 93, 211, 0.5)',
  },
  roamCapsuleActive: {
    backgroundColor: '#6C5DD3',
    borderColor: '#6C5DD3',
  },
  roamText: {
    marginLeft: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  roamTextActive: {
    color: '#FFF',
    fontWeight: '600',
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