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
import { SCENE_LFO_CONFIGS, getSceneLFOConfig, LFOEffectType } from '../config/SceneLFOConfig';

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeSmallSceneIds, setActiveSmallSceneIds] = useState<string[]>(() => {
    const audioService = AudioService.getInstance();
    return audioService.getActiveSmallSceneIds();
  });
  
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;

  const sceneId = route.params?.sceneId || 'nature_deep_sea';
  const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];
  
  // ==================== 配置化 LFO 回调生成器 ====================
  // 根据场景配置自动生成对应的 LFO 回调函数
  
  /**
   * 生成音量调制回调（适用于深海呼吸、森林组、流水组等）
   */
  const createVolumeCallback = useCallback((sceneId: string) => {
    const config = getSceneLFOConfig(sceneId);
    const baseVolume = config.baseVolume || 0.75;
    const fluctuation = config.volumeFluctuation || 0.05;
    const period1 = config.randomPeriod1 || 5000;
    const period2 = config.randomPeriod2 || 7000;
    
    return (lfoValue: number) => {
      const audioService = AudioService.getInstance();
      
      // LFO 输出 0-1 映射到音量范围
      const lfoVolume = config.preset === 'deepSeaBreath' 
        ? lfoValue  // 深海呼吸使用完整 LFO 范围
        : 0.5 + (lfoValue - 0.5) * 0.1; // 其他场景使用微小调制
      
      // 随机波动
      const now = Date.now();
      const randomSeed = Math.sin(now / period1) * Math.cos(now / period2);
      const volumeFluctuation = randomSeed * fluctuation;
      
      const finalVolume = baseVolume * lfoVolume * (1 + volumeFluctuation);
      
      console.log(`[LFO-${sceneId}] Volume=${finalVolume.toFixed(2)}`);
      
      // 通过 TrackPlayer 设置主音量
      audioService.setAmbientVolume(finalVolume);
    };
  }, []);
  
  /**
   * 生成空间平移回调（适用于舟上雨、书店、禅意组、脑波组等）
   */
  const createPanningCallback = useCallback((sceneId: string) => {
    const config = getSceneLFOConfig(sceneId);
    const panRange = config.panRange || 0.25;
    const baseVolume = config.baseVolume || 0.75;
    const fluctuation = config.volumeFluctuation || 0.03;
    const period1 = config.randomPeriod1 || 5000;
    const period2 = config.randomPeriod2 || 7000;
    
    return (lfoValue: number) => {
      const audioService = AudioService.getInstance();
      
      // LFO 输出 0-1 映射到 Pan 范围
      const panValue = (lfoValue - 0.5) * panRange * 2;
      
      // 随机音量波动
      const now = Date.now();
      const randomSeed = Math.sin(now / period1) * Math.cos(now / period2);
      const volumeFluctuation = randomSeed * fluctuation;
      const finalVolume = baseVolume * (1 + volumeFluctuation);
      
      console.log(`[LFO-${sceneId}] Pan=${panValue.toFixed(2)}, Volume=${finalVolume.toFixed(2)}`);
      
      // 设置 Pan
      audioService.setExtraSoundPan(sceneId, panValue);
      
      // 设置音量
      audioService.setExtraSoundVolume(sceneId, finalVolume);
    };
  }, []);
  
  // ==================== 场景特定回调（向后兼容） ====================
  
  /** 深海呼吸 - 使用专用 LFO 回调 */
  const lfoCallback = useCallback((lfoValue: number) => {
    const audioService = AudioService.getInstance();
    const baseVolume = audioService.getAmbientVolume();
    const finalVolume = baseVolume * lfoValue;
    console.log(`[DeepSea] Volume=${finalVolume.toFixed(2)}`);
    
    import('react-native-track-player').then(({ default: TrackPlayer }) => {
      TrackPlayer.setVolume(finalVolume).catch(() => {});
    });
  }, []);
  
  /** 舟上雨 - 空间平移回调（向后兼容） */
  const panningCallback = useCallback((lfoValue: number) => {
    const audioService = AudioService.getInstance();
    
    const panValue = (lfoValue - 0.5) * 0.5;
    const now = Date.now();
    const randomSeed = Math.sin(now / 5000) * Math.cos(now / 7000);
    const volumeFluctuation = randomSeed * 0.05;
    const baseVolume = 0.8;
    const finalVolume = baseVolume * (1 + volumeFluctuation);
    
    console.log(`[Panning] LFO=${lfoValue.toFixed(2)}, Pan=${panValue.toFixed(2)}, Volume=${finalVolume.toFixed(2)}`);
    
    audioService.setAmbientPan(panValue);
    
    if (audioService.getBoatRainSound()) {
      audioService.getBoatRainSound().setVolume(finalVolume);
    }
  }, []);
  
  /** 午后书店 - 空间聚焦回调（向后兼容） */
  const bookstoreCallback = useCallback((lfoValue: number) => {
    const audioService = AudioService.getInstance();
    
    const panValue = (lfoValue - 0.5) * 0.3;
    const now = Date.now();
    const randomSeed = Math.sin(now / 8000) * Math.cos(now / 11000);
    const volumeFluctuation = randomSeed * 0.03;
    const baseVolume = 0.7;
    const finalVolume = baseVolume * (1 + volumeFluctuation);
    
    console.log(`[Bookstore] LFO=${lfoValue.toFixed(2)}, Pan=${panValue.toFixed(2)}, Volume=${finalVolume.toFixed(2)}`);
    
    audioService.setBookstorePan(panValue);
    
    if (audioService.getBookstoreSound()) {
      audioService.getBookstoreSound().setVolume(finalVolume);
    }
  }, []);
  
  // ==================== 配置化 LFO 管理 ====================
  // 根据场景配置自动启用对应的 LFO 效果
  
  // 获取当前场景配置
  const sceneConfig = useMemo(() => getSceneLFOConfig(sceneId), [sceneId]);
  
  // 深海呼吸场景（特殊处理）
  const shouldEnableLFO = sceneId === 'nature_deep_sea';
  const { start: startLFO, stop: stopLFO } = useLFO(
    shouldEnableLFO ? LFOPresets.deepSeaBreath() : {},
    shouldEnableLFO ? lfoCallback : undefined
  );
  
  // 舟上雨场景（向后兼容）
  const shouldEnablePanning = sceneId === 'scene_boat_rain';
  const { start: startPanning, stop: stopPanning } = useLFO(
    shouldEnablePanning ? LFOPresets.boatRainPanning() : {},
    shouldEnablePanning ? panningCallback : undefined
  );
  
  // 午后书店场景（向后兼容）
  const shouldEnableBookstore = sceneId === 'scene_bookstore';
  const { start: startBookstore, stop: stopBookstore } = useLFO(
    shouldEnableBookstore ? LFOPresets.bookstoreFocus() : {},
    shouldEnableBookstore ? bookstoreCallback : undefined
  );
  
  // 配置化场景（森林组/禅意组/流水组/脑波组）
  const shouldEnableConfigLFO = sceneConfig.enabled && 
    !['nature_deep_sea', 'scene_boat_rain', 'scene_bookstore'].includes(sceneId);
  
  const configPreset = useMemo(() => {
    if (!shouldEnableConfigLFO) return {};
    
    switch (sceneConfig.preset) {
      case 'forestBreathing':
        return LFOPresets.forestBreathing();
      case 'zenVibration':
        return LFOPresets.zenVibration();
      case 'riverFlow':
        return LFOPresets.riverFlow();
      case 'brainwaveSync':
        return LFOPresets.brainwaveSync();
      default:
        return {};
    }
  }, [shouldEnableConfigLFO, sceneConfig.preset]);
  
  // 根据效果类型选择回调
  const configCallback = useMemo(() => {
    if (!shouldEnableConfigLFO) return undefined;
    
    const hasPanning = sceneConfig.effects.includes(LFOEffectType.PANNING);
    const hasVolume = sceneConfig.effects.includes(LFOEffectType.VOLUME);
    const hasFilter = sceneConfig.effects.includes(LFOEffectType.LOWPASS_FILTER);
    
    if (hasPanning) {
      return createPanningCallback(sceneId);
    } else if (hasFilter) {
      return createForestCallback(sceneId);
    } else if (hasVolume) {
      return createVolumeCallback(sceneId);
    }
    
    return undefined;
  }, [shouldEnableConfigLFO, sceneId, sceneConfig.effects]);
  
  const { start: startConfigLFO, stop: stopConfigLFO } = useLFO(
    configPreset,
    configCallback
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

  // 页面挂载时：预加载所有音频
  useEffect(() => {
    const audioService = AudioService.getInstance();
    console.log('[BreathDetail] 🚀 页面挂载，触发预加载所有场景音频...');
    audioService.preloadAllSounds().catch(console.error);
    
    return () => {
      console.log('[BreathDetail] 🧹 页面卸载，清理资源');
    };
  }, []);

  // 场景切换时的加载逻辑 - 优化：优先复用预加载实例，实现秒开体验
  useEffect(() => {
    const loadScene = async () => {
      setIsLoading(true);
      const audioService = AudioService.getInstance();
      
      try {
        // 【UI 优先】先启动背景动效，掩盖音频加载时间
        console.log('[BreathDetail] 🎬 启动背景动效...');
        
        // 【强制暴露】无论资源是否存在，先显示下载 UI 3 秒
        console.log('[BreathDetail] ⚠️ [强制] 设置下载状态，显示紫色 UI...');
        setIsDownloading(true);
        setDownloadProgress(0);
        
        // 【强制等待】3 秒强制 Loading 延迟，让紫色 UI 显示更清楚
        console.log('[BreathDetail] ⏱️ 启动 3 秒强制 Loading 延迟...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 【音频秒开】优先复用预加载实例
        const sceneId = scene.id;
        const existingSound = audioService.getExtraSound(sceneId);
        
        if (existingSound && existingSound.isLoaded()) {
          console.log('[BreathDetail] ⚡ 复用预加载 Sound，秒开！');
          
          // 隐藏下载 UI
          setIsDownloading(false);
          
          // 立即播放（带渐入）
          await audioService.playSceneWithFade(sceneId, 0.75, 300);
          
          // 然后启动 LFO
          await initializeLFOForScene(sceneId);
          
          setIsLoading(false);
        } else {
          console.log('[BreathDetail] 📥 首次加载 Sound...');
          
          // 【新增】检查资源是否已下载
          const { getLocalPath } = await import('../constants/audioAssets');
          const { AUDIO_MAP } = await import('../constants/audioAssets');
          const audioAsset = AUDIO_MAP[sceneId];
          
          if (audioAsset) {
            const localPath = getLocalPath(audioAsset.category, audioAsset.filename);
            const RNFS = await import('react-native-fs');
            const isDownloaded = await RNFS.exists(localPath);
            
            if (!isDownloaded) {
              console.log('[BreathDetail] ⚠️ 资源未下载，触发下载流程');
              // 下载状态已经在上面设置为 true
              
              // 订阅下载进度
              const { DownloadService } = await import('../services/DownloadService');
              const downloadProgressHandler = (progress: { progress: number }) => {
                setDownloadProgress(Math.round(progress.progress * 100));
              };
              
              try {
                // 触发下载
                console.log('[BreathDetail] 📥 开始下载资源...');
                await DownloadService.checkAndDownload(downloadProgressHandler);
                
                console.log('[BreathDetail] ✅ 下载完成，等待 500ms 落盘');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                setIsDownloading(false);
                console.log('[BreathDetail] 🎉 下载完成，开始播放');
                
                // 下载完成后重新尝试加载
                await audioService.playSceneWithFade(sceneId, 0.75, 300);
                await initializeLFOForScene(sceneId);
              } catch (downloadError) {
                console.error('[BreathDetail] ❌ 下载失败:', downloadError);
                setIsDownloading(false);
                setIsLoading(false);
              }
              
              return; // 下载流程结束，返回
            }
            
            // 【强制暴露】即使资源已下载，也显示一下下载 UI
            console.log('[BreathDetail] ✅ 资源已下载，但仍显示 UI 2 秒');
            await new Promise(resolve => setTimeout(resolve, 2000));
            setIsDownloading(false);
          }
          
          // 兜底：传统加载方式（资源已下载）
          const currentPlayingId = audioService.getCurrentScene()?.id;
          if (currentPlayingId !== scene.id) {
            console.log(`[BreathDetail] Switching to scene ${scene.id}.`);
            await audioService.switchSoundscape(scene);
          }
          
          // ==================== 配置化 LFO 启用逻辑 ====================
          
          // 1. 深海呼吸（特殊处理）
          if (shouldEnableLFO) {
            console.log('[BreathDetail] 🌊 启用深海呼吸 LFO');
            startLFO();
          }
          
          // 2. 舟上雨（向后兼容）
          if (shouldEnablePanning) {
            console.log('[BreathDetail] 🌧️ 为舟上雨启用 Panning LFO');
            audioService.enablePanningForScene(scene.id);
            startPanning();
          }
          
          // 3. 午后书店（向后兼容）
          if (shouldEnableBookstore) {
            console.log('[BreathDetail] 📚 为书店启用 Panning LFO (45 秒周期)');
            audioService.enableBookstorePanning(scene.id);
            startBookstore();
          }
          
          // 4. 配置化场景（森林/禅意/流水/脑波）
          if (shouldEnableConfigLFO) {
            console.log(`[BreathDetail] 🎯 为场景 ${scene.id} 启用配置化 LFO (${sceneConfig.preset})`);
            
            // 加载 ExtraSound
            await audioService.loadExtraSound(scene.id);
            
            // 注册 LFO Disposer
            audioService.registerLFODisposer(scene.id, () => {
              console.log(`[BreathDetail] 🧹 清理场景 ${scene.id} LFO`);
            });
            
            // 启动 LFO
            startConfigLFO();
          }
          
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[BreathDetail] ❌ 加载场景失败:', error);
        setIsLoading(false);
        setIsDownloading(false);
      }
    };

    loadScene();
  }, [
    scene.id,
    sceneId,
    shouldEnableLFO,
    stopLFO,
    shouldEnablePanning,
    stopPanning,
    shouldEnableBookstore,
    stopBookstore,
    shouldEnableConfigLFO,
    stopConfigLFO,
    sceneConfig
  ]);
  
  // 页面卸载时清理资源
  useEffect(() => {
    return () => {
      const audioService = AudioService.getInstance();
      
      // 状态同步检查：退出页面时立即停止所有互动音效
      console.log('[BreathDetail] Stopping all ambient sounds on exit.');
      audioService.stopAllAmbient();
      
      // ==================== 配置化 LFO 清理逻辑 ====================
      
      // 1. 深海呼吸
      if (shouldEnableLFO) {
        stopLFO();
        console.log('[BreathDetail] ✅ 深海呼吸 LFO 已停止');
      }
      
      // 2. 舟上雨（向后兼容）
      if (shouldEnablePanning) {
        stopPanning();
        audioService.disablePanning();
        console.log('[BreathDetail] ✅ 舟上雨 Panning 已停止');
      }
      
      // 3. 午后书店（向后兼容）
      if (shouldEnableBookstore) {
        stopBookstore();
        audioService.disableBookstorePanning();
        console.log('[BreathDetail] ✅ 书店 Panning 已停止');
      }
      
      // 4. 配置化场景
      if (shouldEnableConfigLFO) {
        stopConfigLFO();
        audioService.cleanupScene(sceneId);
        console.log(`[BreathDetail] ✅ 场景 ${sceneId} 已清理`);
      }
    };
  }, [
    shouldEnableLFO,
    stopLFO,
    shouldEnablePanning,
    stopPanning,
    shouldEnableBookstore,
    stopBookstore,
    shouldEnableConfigLFO,
    stopConfigLFO,
    sceneId
  ]);

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

        {/* 【新增】下载进度 UI */}
        {isDownloading && (
          <View style={styles.downloadOverlay}>
            <View style={styles.downloadContent}>
              <Icon name="cloud-download-outline" size={60} color="#6C5DD3" />
              <Text style={styles.downloadText}>正在同步宁静资源...</Text>
              <Text style={styles.downloadProgress}>{downloadProgress}%</Text>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[styles.progressBar, { width: `${downloadProgress}%` }]} 
                />
              </View>
              <Text style={styles.downloadHint}>完成后将自动播放</Text>
            </View>
          </View>
        )}

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
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  downloadContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  downloadText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  downloadProgress: {
    color: '#6C5DD3',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 10,
  },
  progressBarContainer: {
    width: 200,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6C5DD3',
    borderRadius: 3,
  },
  downloadHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 15,
    textAlign: 'center',
  },
});

export default BreathDetailScreen;
