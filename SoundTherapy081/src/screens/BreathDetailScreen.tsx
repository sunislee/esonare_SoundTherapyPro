import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Platform,
  Image,
  InteractionManager
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import { useAudio } from '../context/AudioContext';
import AudioService from '../services/AudioService';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';
import { RootStackParamList } from '../navigation/MainNavigator';
import AnimatedFloatingButton from '../components/AnimatedFloatingButton';
import useLFO, { LFOPresets } from '../hooks/useLFO';

const { width, height } = Dimensions.get('window');

const events = [
  Event.PlaybackQueueEnded,
  Event.PlaybackTrackChanged,
  Event.PlaybackState,
];

type BreathDetailRouteProp = RouteProp<RootStackParamList, 'BreathDetail'>;

const BreathDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<BreathDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const { isPlaying } = usePlayerState();
  const { toggleAmbience } = useAudio();
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeSmallSceneIds, setActiveSmallSceneIds] = useState<string[]>(() => {
    const audioService = AudioService.getInstance();
    return audioService.getActiveSmallSceneIds();
  });
  
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;

  const sceneId = route.params?.sceneId || 'nature_deep_sea';
  const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];
  
  // 【LFO 集成】为深海呼吸场景启用 LFO 动态音量调制
  const lfoCallback = useCallback((volume: number) => {
    const audioService = AudioService.getInstance();
    const baseVolume = audioService.getAmbientVolume();
    
    // 公式：最终音量 = 用户设置音量 * LFO 调制因子
    const finalVolume = baseVolume * volume;
    console.log(`[LFO] 音量调制：基础=${baseVolume.toFixed(2)}, LFO=${volume.toFixed(2)}, 最终=${finalVolume.toFixed(2)}`);
    
    // 直接调用 TrackPlayer.setVolume（绕过 AudioService.setVolume 避免循环）
    import('react-native-track-player').then(({ default: TrackPlayer }) => {
      TrackPlayer.setVolume(finalVolume).catch(() => {});
    });
  }, []);
  
  // 【舟上雨 - 空间平移】Pan 回调：LFO 输出 0-1 映射到 Pan -0.25 到 0.25
  // 同时增加微小的音量随机波动（±5%），模拟自然雨势变化
  const panningCallback = useCallback((lfoValue: number) => {
    const audioService = AudioService.getInstance();
    
    // LFO 输出 0-1 → Pan 范围 -0.25 到 0.25
    // 公式：pan = (lfoValue - 0.5) * 0.5
    const panValue = (lfoValue - 0.5) * 0.5;
    
    // 【音量随机波动】极低频率的随机噪声（±5%）
    // 使用简单的伪随机算法，基于时间生成平滑的随机值
    const now = Date.now();
    const randomSeed = Math.sin(now / 5000) * Math.cos(now / 7000); // 超低频组合
    const volumeFluctuation = randomSeed * 0.05; // ±5% 波动
    
    // 基础音量 0.8 + 随机波动 ±5%
    const baseVolume = 0.8;
    const finalVolume = baseVolume * (1 + volumeFluctuation);
    
    console.log(`[Panning] LFO=${lfoValue.toFixed(2)}, Pan=${panValue.toFixed(2)}, Volume=${finalVolume.toFixed(2)}`);
    
    // 设置 Pan（空间平移）
    audioService.setAmbientPan(panValue);
    
    // 设置音量（微小随机波动）
    if (audioService.getBoatRainSound()) {
      audioService.getBoatRainSound().setVolume(finalVolume);
    }
  }, []);
  
  // 【午后书店 - 空间聚焦】Pan 回调：LFO 输出 0-1 映射到 Pan -0.15 到 0.15
  // 同时增加微小的音量随机波动（±3%），模拟咖啡馆/书店环境变化
  const bookstoreCallback = useCallback((lfoValue: number) => {
    const audioService = AudioService.getInstance();
    
    // LFO 输出 0-1 → Pan 范围 -0.15 到 0.15
    // 公式：pan = (lfoValue - 0.5) * 0.3
    const panValue = (lfoValue - 0.5) * 0.3;
    
    // 【音量随机波动】超低频率的随机噪声（±3%）
    // 使用更长周期的双正弦波算法
    const now = Date.now();
    const randomSeed = Math.sin(now / 8000) * Math.cos(now / 11000); // 超低频组合
    const volumeFluctuation = randomSeed * 0.03; // ±3% 波动
    
    // 基础音量 0.7 + 随机波动 ±3%
    const baseVolume = 0.7;
    const finalVolume = baseVolume * (1 + volumeFluctuation);
    
    console.log(`[Bookstore] LFO=${lfoValue.toFixed(2)}, Pan=${panValue.toFixed(2)}, Volume=${finalVolume.toFixed(2)}`);
    
    // 设置 Pan（空间平移）
    audioService.setBookstorePan(panValue);
    
    // 设置音量（微小随机波动）
    if (audioService.getBookstoreSound()) {
      audioService.getBookstoreSound().setVolume(finalVolume);
    }
  }, []);
  
  // 仅在深海呼吸场景启用 LFO
  const shouldEnableLFO = sceneId === 'nature_deep_sea';
  const { start: startLFO, stop: stopLFO } = useLFO(
    shouldEnableLFO ? LFOPresets.deepSeaBreath() : {},
    shouldEnableLFO ? lfoCallback : undefined
  );
  
  // 仅在舟上雨场景启用 Panning
  const shouldEnablePanning = sceneId === 'scene_boat_rain';
  const { start: startPanning, stop: stopPanning } = useLFO(
    shouldEnablePanning ? LFOPresets.boatRainPanning() : {},
    shouldEnablePanning ? panningCallback : undefined
  );
  
  // 仅在书店场景启用 Panning
  const shouldEnableBookstore = sceneId === 'scene_bookstore';
  const { start: startBookstore, stop: stopBookstore } = useLFO(
    shouldEnableBookstore ? LFOPresets.bookstoreFocus() : {},
    shouldEnableBookstore ? bookstoreCallback : undefined
  );

  const placeholderColor = useMemo(() => {
    if (scene.id.includes('ocean') || scene.id.includes('deep_sea')) return '#001a33';
    if (scene.id.includes('forest')) return '#1a2e1a';
    return '#121212';
  }, [scene.id]);

  // 固定的 8 个交互按钮数据
  const globalAmbientScenes = useMemo(() => 
    SMALL_SCENE_IDS.map(id => SCENES.find(s => s.id === id)).filter(Boolean) as Scene[]
  , []);

  useTrackPlayerEvents(events, (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      console.log('[BreathDetail] Playback queue ended');
    }
  });

  useEffect(() => {
    const audioService = AudioService.getInstance();
    const sub = audioService.addSmallScenesListener((ids) => {
      setActiveSmallSceneIds(ids);
    });

    return () => {
      sub();
    };
  }, []);

  useEffect(() => {
    const audioService = AudioService.getInstance();
    
    // 初始进入逻辑 - 优化：不等待音频初始化即渲染页面架构
    const initPage = async () => {
      // 内容稍后浮现
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setIsLoading(true);
      const currentPlayingId = audioService.getCurrentScene()?.id;
      
      // 保存最后播放的场景 ID，用于首页高亮记忆
      AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', scene.id).catch(() => {});

      if (currentPlayingId !== scene.id) {
        console.log(`[BreathDetail] Switching to scene ${scene.id}.`);
        await audioService.switchSoundscape(scene);
      }
      
      // 【舟上雨 - 空间平移】为舟上雨场景启用 Panning LFO
      if (shouldEnablePanning) {
        console.log('[BreathDetail] 为舟上雨场景启用 Panning LFO');
        audioService.enablePanningForScene(scene.id);
        startPanning();
      }
      
      // 【午后书店 - 空间聚焦】为书店场景启用 Panning LFO
      if (shouldEnableBookstore) {
        console.log('[BreathDetail] 为书店场景启用 Panning LFO (45 秒周期)');
        audioService.enableBookstorePanning(scene.id);
        startBookstore();
      }
      
      setIsLoading(false);
    };

    initPage();

    return () => {
      // 状态同步检查：退出页面时立即停止所有互动音效
      console.log('[BreathDetail] Stopping all ambient sounds on exit.');
      audioService.stopAllAmbient();
      
      // 【LFO 集成】退出时停止 LFO
      if (shouldEnableLFO) {
        stopLFO();
        console.log('[BreathDetail] ✅ LFO 已停止');
      }
      
      // 【舟上雨 - 空间平移】退出时停止 Panning
      if (shouldEnablePanning) {
        stopPanning();
        audioService.disablePanning();
        console.log('[BreathDetail] ✅ Panning 已停止');
      }
      
      // 【午后书店 - 空间聚焦】退出时停止 Panning
      if (shouldEnableBookstore) {
        stopBookstore();
        audioService.disableBookstorePanning();
        console.log('[BreathDetail] ✅ 书店 Panning 已停止');
      }
    };
  }, [scene.id, shouldEnableLFO, stopLFO, shouldEnablePanning, stopPanning, shouldEnableBookstore, stopBookstore]);

  const togglePlayback = async () => {
    const audioService = AudioService.getInstance();
    if (isPlaying) {
      await audioService.pause();
    } else {
      await audioService.play();
    }
  };

  const handleToggleAmbience = useCallback(async (ambient: Scene) => {
    const isActive = activeSmallSceneIds.includes(ambient.id);
    const targetState = !isActive;
    const audioService = AudioService.getInstance();
    
    if (targetState) {
      setActiveSmallSceneIds(prev => [...prev, ambient.id]);
    } else {
      setActiveSmallSceneIds(prev => prev.filter(id => id !== ambient.id));
    }
    
    await audioService.toggleAmbience(ambient, targetState);
  }, [activeSmallSceneIds]);

  const handleBack = () => {
    navigation.goBack();
  };

  return (
      <View style={styles.container}>
        {scene.backgroundSource ? (
          <Image source={scene.backgroundSource} style={styles.backgroundImage} />
        ) : (
          <View style={[styles.backgroundFallback, { backgroundColor: placeholderColor }]} />
        )}

        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]} />

      <View style={[styles.mainContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
        {/* Header - 统一使用 chevron-down */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Icon name="chevron-down" size={32} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.sceneTitle}>
          {t(`scenes.${scene.id}.title`, { defaultValue: scene.title })}
        </Text>

        {/* Content - 移除呼吸球，保持中间留白或仅显示互动图标 */}
        <Animated.View style={[styles.content, { opacity: contentFadeAnim }]}>
          {/* 交互按钮容器 - 强制显示互动层 */}
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
                  onPress={() => handleToggleAmbience(ambient)}
                />
              );
            })}
          </View>

          {/* 底部控制区 - 统一布局：标题 + 播放按钮 */}
          <View style={styles.bottomSection}>
            <TouchableOpacity 
              style={styles.playButton} 
              onPress={togglePlayback}
              activeOpacity={0.8}
            >
              <Icon 
                name={isPlaying ? "pause" : "play"} 
                size={40} 
                color="#FFF" 
                style={{ marginLeft: 5 }}
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    height: height,
    resizeMode: 'cover',
  },
  backgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    height: height,
  },
  mainContainer: {
    flex: 1,
    zIndex: 10,
    justifyContent: 'space-between',
  },
  header: {
    height: 60,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingIconsContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    position: 'relative',
    minHeight: 200,
  },
  bottomSection: {
    paddingBottom: 60,
    alignItems: 'center',
    width: '100%',
  },
  sceneTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 12,
    textAlign: 'center',
    width: '100%',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

export default BreathDetailScreen;
