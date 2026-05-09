import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  InteractionManager,
  Easing,
  Alert,
  findNodeHandle,
  ActivityIndicator,
  ImageBackground,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import AudioService from '../services/AudioService';
import { RainDrop } from '../components/RainDrop';
import { SCENES, Scene, SceneCategory } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useAudio } from '../context/AudioContext';
import Icon from 'react-native-vector-icons/Ionicons';
import NoiseLabIcon from '../components/NoiseLabIcon';
import { ScrollView } from 'react-native-gesture-handler';
import { Typography } from '../theme/Typography';
import { useTranslation } from 'react-i18next';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResourceDownloader } from '../hooks/useResourceDownloader';
import { sceneRoamManager } from '../services/SceneRoamManager';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_WIDTH = SCREEN_WIDTH - 40;
const BUTTON_SIZE = 80;

// 【智能缩略图源选择器 - 优雅语义化版】
// 返回值：
//   - 有效图片源 (number 或 {uri}) → 显示真实图片
//   - null → 使用语义化占位块（磨砂色块 + Icon）
const getThumbnailSource = (item: Scene, isResourceReady: boolean): any => {
  if (!item.backgroundSource) {
    console.log(`[Thumbnail] ${item.id}: 无 backgroundSource → 占位块`);
    return null;
  }

  const bgSource = item.backgroundSource;

  // require() 格式的静态资源（数字类型）→ 直接使用
  if (typeof bgSource === 'number') {
    console.log(`[Thumbnail] ${item.id}: 静态资源 (require) ✅`);
    return bgSource;
  }

  // file:// 路径格式 → 仅当资源确认已下载时使用
  if (isResourceReady && bgSource?.uri && bgSource.uri.startsWith('file://')) {
    console.log(`[Thumbnail] ${item.id}: 本地路径 ${bgSource.uri} (isResourceReady=${isResourceReady})`);
    return bgSource;
  }

  console.log(`[Thumbnail] ${item.id}: 条件不满足 (isResourceReady=${isResourceReady}, uri=${bgSource?.uri?.substring(0, 50)}...) → 占位块`);
  // 其他情况：返回 null，触发语义化占位块
  return null;
};

// 【语义化 Icon 映射】
const CATEGORY_ICONS: Record<string, string> = {
  'Oriental': '🏯',
  'WesternChurch': '⛪',
  'Nature': '🌿',
  'Healing': '💜',
  'Brainwave': '🧠',
  'Life': '🏠',
};

const getCategoryIcon = (category: string): string => {
  return CATEGORY_ICONS[category] || '🎵';
};

// 【主题色映射】
const CATEGORY_COLORS: Record<string, string> = {
  'Oriental': 'rgba(200, 180, 140, 0.12)',
  'WesternChurch': 'rgba(180, 190, 210, 0.12)',
  'Nature': 'rgba(100, 160, 120, 0.12)',
  'Healing': 'rgba(160, 130, 200, 0.12)',
  'Brainwave': 'rgba(100, 150, 200, 0.12)',
  'Life': 'rgba(200, 160, 130, 0.12)',
};

const getCategoryColor = (category: string): string => {
  return CATEGORY_COLORS[category] || 'rgba(255, 255, 255, 0.08)';
};

// 抽离 SceneItem 组件
const SceneItem = React.memo(({ 
  item, isPlaying, currentBaseSceneId, togglePlayback, navigation, 
  isFocused, scrollOffset, scrollViewRef, isResourceReady,
  globalProgress,  // { progress, status, isPriority }
  onBoostPriority,  // (sceneId) => void
  stateVersion  // 【关键】强制刷新计数器
}: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);
  const [itemY, setItemY] = useState<number | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const viewRef = useRef<View>(null);
  const { t } = useTranslation();

  const [refreshKey, setRefreshKey] = useState(0);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // ════════════════════════════════════════
  // 【🔥🔥🔥 终极修复】直接从 AudioService 单例获取真实状态
  // ════════════════════════════════════════
  
  // 【修复点 2】单例获取：直接使用顶部导入的 AudioService，无需 require
  const directState = useMemo(() => {
    try {
      // 【修复点 1】废弃 isReady() 强校验：只要 getInstance() 能拿到实例就直接读取
      const service = AudioService.getInstance();
      
      if (service) {
        // 直接读取内存属性，不依赖 isReady() 检查
        const realIsPlaying = service.isActuallyPlaying;
        const realSceneId = service.getCurrentBaseSceneId();
        
        console.log(`[SceneItem] ✅ [useMemo] 成功获取状态: isActuallyPlaying=${realIsPlaying}, sceneId=${realSceneId}`);
        
        return {
          isPlaying: realIsPlaying,
          sceneId: realSceneId,
          success: true,
        };
      } else {
        console.warn('[SceneItem] ⚠️ [useMap] AudioService.getInstance() 返回 null');
      }
    } catch (e) {
      // 【修复点 5】日志哨兵：详细报错日志
      console.error('[SceneItem] ❌ [useMap] 获取状态失败:', e?.message || e);
      console.error('[SceneItem] ❌ [useMap] 错误堆栈:', e?.stack);
    }
    
    // 失败时返回标记
    return { isPlaying: null, sceneId: null, success: false };
  }, [stateVersion]);  // ← 每次版本号变化都重新计算

  // 【修复点 3】强化"状态自愈"逻辑：
  // 如果 directState 成功拿到布尔值 → 100% 信任它，完全覆盖 props 的旧状态！
  const finalPlaying = directState.success ? directState.isPlaying : isPlaying;
  const finalSceneId = directState.success ? directState.sceneId : currentBaseSceneId;

  useEffect(() => {
    if (isResourceReady) {
      setRefreshKey(k => k + 1);
      setImageLoadFailed(false);
    }
  }, [isResourceReady]);

  // 【重构】使用全局进度状态（从 HomeScreen 传入）
  const downloadProgress = globalProgress?.progress || 0;
  const downloadStatus = globalProgress?.status || (isResourceReady ? 'ready' : 'waiting');
  const isPriority = globalProgress?.isPriority || false;
  const [showBoostButton, setShowBoostButton] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 【🔥 关键】使用最终状态（directState 优先）
  const isThisPlaying = finalPlaying && finalSceneId === item.id;

  // 【调试日志】追踪列表项播放状态（显示完整状态来源）
  console.log(`[SceneItem] 🔍 [${item.name}] props=${isPlaying}, direct=${directState.isPlaying}, success=${directState.success}, final=${finalPlaying}, sceneId=${finalSceneId}, isThis=${isThisPlaying}, v=${stateVersion}`);

  const triggerHaptic = (type: 'light' | 'heavy' | 'success' = 'light') => {
    ReactNativeHapticFeedback.trigger(type === 'success' ? 'success' : type === 'heavy' ? 'impactHeavy' : 'impactLight', { enableVibrateFallback: true });
  };

  // 【核心】处理点击事件
  const handlePress = () => {
    triggerHaptic();
    
    if (isResourceReady) {
      // 资源就绪 → 直接导航
      if (item.id.includes('breath')) navigation.navigate('BreathDetail', { sceneId: item.id });
      else navigation.navigate('ImmersivePlayer', { sceneId: item.id });
    } else if (showBoostButton && !isPriority) {
      // 点击"优先下载"按钮 → 触发插队
      handleBoostDownload();
    } else {
      // 资源未就绪 → 显示"优先下载"选项
      setShowBoostButton(true);
      triggerHaptic('heavy');
    }
  };

  // 【核心】触发优先下载（插队）- 调用全局回调
  const handleBoostDownload = () => {
    console.log(`[HomeScreen] ⚡ 用户触发优先下载: ${item.id}`);
    
    setShowBoostButton(false);
    triggerHaptic('heavy');
    
    // 调用父组件的回调（全局状态管理）
    if (onBoostPriority) {
      onBoostPriority(item.id);
    }
  };

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isFocused && !hasAnimated && itemY !== null) {
      const isVisible = scrollOffset + SCREEN_HEIGHT > itemY + 20 && scrollOffset < itemY + 110;
      if (isVisible) {
        setHasAnimated(true);
        Animated.sequence([
          Animated.timing(highlightAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start();
      }
    }
  }, [isFocused, hasAnimated, itemY, scrollOffset]);

  const highlightScale = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const highlightOpacity = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });

  return (
    <View
      ref={viewRef}
      style={styles.cardWrapper}
      key={`scene-${item.id}-${refreshKey}`}
      onLayout={() => {
        if (viewRef.current && scrollViewRef.current) {
          const scrollNode = findNodeHandle(scrollViewRef.current);
          if (scrollNode) {
            viewRef.current.measureLayout(scrollNode, (_x, y) => setItemY(y), () => {});
          }
        }
      }}
    >
      <Animated.View style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.cardClip}>
          {isFocused && (
            <Animated.View 
              pointerEvents="none" 
              style={[styles.memoryHighlight, { opacity: highlightOpacity, transform: [{ scale: highlightScale }] }]} 
            />
          )}
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.card, isPressed && styles.cardPressed]}
            onPressIn={() => {
              setIsPressed(true);
              Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
            }}
            onPressOut={() => {
              setIsPressed(false);
              Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
            }}
            onPress={() => {
              handlePress();
            }}
          >
            <View style={styles.cardInner}>
              <View style={[styles.cardBg, { backgroundColor: 'rgba(30, 30, 30, 0.6)' }]} />
              
              {/* 【左侧缩略图 - 优雅语义化版】 */}
              {(() => {
                const thumbSource = getThumbnailSource(item, isResourceReady);

                if (thumbSource && !imageLoadFailed) {
                  return (
                    <ImageBackground
                      source={thumbSource}
                      style={styles.thumbnail}
                      resizeMode="cover"
                      imageStyle={styles.thumbnailRadius}
                      key={`thumb-${item.id}-${isResourceReady ? 'ready' : 'pending'}-${refreshKey}`}
                      onError={(e) => {
                        console.error(`[Thumbnail] ❌ ${item.id} 图片加载失败:`, e?.nativeEvent?.error);
                        setImageLoadFailed(true);
                      }}
                      onLoad={() => {
                        console.log(`[Thumbnail] ✅ ${item.id} 图片加载成功`);
                      }}
                    />
                  );
                }

                if (imageLoadFailed) {
                  console.log(`[Thumbnail] ⚠️ ${item.id}: 图片加载失败，降级显示占位块`);
                }

                return (
                  <View style={[styles.thumbnailPlaceholder, { backgroundColor: getCategoryColor(item.category) }]}>
                    <Text style={styles.placeholderIcon}>{getCategoryIcon(item.category)}</Text>
                  </View>
                );
              })()}
              
              {/* 【中间信息区】 */}
              <View style={[styles.cardText, isResourceReady && styles.cardTextCentered]}>
                <Text
                  style={[
                    styles.cardTitle,
                    isThisPlaying && styles.cardTitleActive,
                    !isThisPlaying && isResourceReady && styles.cardTitleInactive,
                    !isResourceReady && downloadStatus !== 'ready' && styles.cardTitleDownloading
                  ]}
                  numberOfLines={1}
                >
                  {t(`scenes.${item.id}.title`, { defaultValue: item.title })}
                </Text>

                {!isResourceReady && (
                  <>
                    {downloadStatus !== 'ready' ? (
                      <Text style={styles.cardStatusText} numberOfLines={1}>
                        {isPriority
                          ? `${Math.round(downloadProgress)}% - Downloading`
                          : showBoostButton
                            ? 'Waiting in Queue'
                            : `${downloadProgress}% - Queued`
                        }
                      </Text>
                    ) : (
                      <Text style={styles.cardReadyText} numberOfLines={1}>
                        Ready to Play ✨
                      </Text>
                    )}
                  </>
                )}
              </View>
              
              {/* 【右侧操作区】 */}
              <View style={styles.cardRightArea}>
                {(isResourceReady || downloadStatus === 'ready') ? (
                  <TouchableOpacity 
                    style={[styles.cardPlayButton, isThisPlaying && styles.cardPauseButton]} 
                    onPress={() => { triggerHaptic(); togglePlayback(item); }}
                  >
                    <Text style={[styles.cardPlayIcon, isThisPlaying && styles.cardPauseIcon]}>{isThisPlaying ? '||' : '▶'}</Text>
                  </TouchableOpacity>
                ) : showBoostButton && !isPriority ? (
                  <TouchableOpacity 
                    style={styles.boostButton}
                    onPress={handleBoostDownload}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.boostButtonText}>⚡</Text>
                    <Text style={styles.boostButtonLabel}>优先下载</Text>
                  </TouchableOpacity>
                ) : isPriority ? (
                  <View style={styles.downloadingIconContainer}>
                    <ActivityIndicator size="small" color="#6C5DD3" />
                    <Text style={styles.downloadingPercent}>{Math.round(downloadProgress)}%</Text>
                  </View>
                ) : (
                  <View style={styles.queuedIconContainer}>
                    <Text style={styles.queuedIcon}>⬇</Text>
                  </View>
                )}
              </View>
              
              {/* 【进度条（仅下载中且未就绪时显示）】 */}
              {!isResourceReady && isPriority && (
                <View style={styles.cardProgressBar}>
                  <View style={styles.progressBarBg}>
                    <Animated.View 
                      style={[styles.progressBarFill, { width: `${Math.min(downloadProgress, 100)}%` }]} 
                    />
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
});

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPlaying, currentBaseSceneId, togglePlayback } = useAudio();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  // 【关键】状态版本计数器 - 强制 SceneItem 重渲染
  const [stateVersion, setStateVersion] = useState(0);
  
  // 【🔥🔥🔥 关键修复】监听 AudioService 发射的全局事件，强制刷新列表状态
  useEffect(() => {
    console.log('[HomeScreen] 📡 [DeviceEventEmitter] 注册 audioStateChanged 监听器');
    
    const subscription = DeviceEventEmitter.addListener('audioStateChanged', (event) => {
      console.log(`[HomeScreen] ✅ [DeviceEventEmitter] 收到事件: isPlaying=${event.isActuallyPlaying}, sceneId=${event.currentBaseSceneId}, timestamp=${event.timestamp}`);
      
      // 【关键】立即递增版本号 → 强制所有 SceneItem 重新执行 useMemo
      setStateVersion(v => v + 1);
    });
    
    return () => {
      console.log('[HomeScreen] 📡 [DeviceEventEmitter] 移除 audioStateChanged 监听器');
      subscription.remove();
    };
  }, []);
  
  // 【🔥 根本性修复】直接从 AudioService 获取真实播放状态（绕过 Context 传播问题）
  const [realIsPlaying, setRealIsPlaying] = useState<boolean | null>(null); // null=使用 Context
  const [realBaseSceneId, setRealBaseSceneId] = useState<string | null>(null); // null=使用 Context
  
  // 【最终使用的播放状态】：真实状态优先，否则使用 Context
  const effectiveIsPlaying = realIsPlaying ?? isPlaying;
  const effectiveBaseSceneId = realBaseSceneId ?? currentBaseSceneId;
  
  // 【监听播放状态变化 → 递增版本号 → 强制刷新所有列表项】
  useEffect(() => {
    console.log(`[HomeScreen] 🔄 [状态监控] isPlaying=${isPlaying}, currentBaseSceneId=${currentBaseSceneId}, 触发版本更新: ${stateVersion + 1}`);
    setStateVersion(v => v + 1);
  }, [isPlaying, currentBaseSceneId]);
  
  // 【🔥 关键】页面获得焦点时，直接从 AudioService 获取真实状态
  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] 🎯 [焦点同步] 页面获得焦点，开始同步真实状态...');
      
      const syncRealState = () => {
        try {
          const { AudioService: AS } = require('../services/AudioService');
          const audioService = AS.getInstance();
          
          if (audioService.isReady()) {
            const actualPlaying = audioService.isActuallyPlaying;
            const actualSceneId = audioService.getCurrentBaseSceneId();
            
            console.log(`[HomeScreen] ✅ [焦点同步] 真实状态: isActuallyPlaying=${actualPlaying}, sceneId=${actualSceneId}`);
            
            // 更新真实状态（触发重渲染）
            setRealIsPlaying(actualPlaying);
            setRealBaseSceneId(actualSceneId);
            setStateVersion(v => v + 1);
          } else {
            console.log('[HomeScreen] ⚠️ [焦点同步] AudioService 未准备好');
          }
        } catch (e) {
          console.error('[HomeScreen] ❌ [焦点同步] 失败:', e);
        }
      };
      
      // 立即执行一次
      syncRealState();
      
      // 延迟再执行一次（确保异步操作完成）
      const timeoutId = setTimeout(syncRealState, 300);
      
      return () => {
        clearTimeout(timeoutId);
        // 离开页面时清除真实状态，回退到 Context
        setRealIsPlaying(null);
        setRealBaseSceneId(null);
      };
    }, [])
  );

  const [userName, setUserName] = useState('');
  const [slogan, setSlogan] = useState('');
  const greetingFadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [downloadedSceneIds, setDownloadedSceneIds] = useState<Set<string>>(new Set());
  const [shufflingCategory, setShufflingCategory] = useState<SceneCategory | null>(null);
  const shuffleAnimRef = useRef(new Animated.Value(0)).current;
  
  // 【核心】使用后台下载 Hook（替代手动实现）
  const { downloadProgress: globalDownloadProgress, prioritizeScene } = useResourceDownloader();

  // 【流式就绪缓存】缓存 Key
  const CACHE_KEY = 'downloaded_scene_ids_cache';

  // 检查已下载的场景资源 - 带缓存优化
  useEffect(() => {
    let isMounted = true;
    
    const checkDownloadedScenes = async () => {
      const { getLocalPath, AUDIO_MANIFEST } = await import('../constants/audioAssets');
      const { SCENES, getSceneBackground } = await import('../constants/scenes');
      const RNFS = await import('react-native-fs');
      const readyIds = new Set<string>();

      for (const asset of AUDIO_MANIFEST) {
        const localPath = getLocalPath(asset.category, asset.filename);
        const cleanPath = localPath.replace('file://', '');
        const exists = await RNFS.exists(cleanPath);

        if (exists) {
          readyIds.add(asset.id);
        }
      }

      const fullyReadyIds = new Set<string>();

      for (const scene of SCENES) {
        if (!scene.isBaseScene) continue;

        const audioReady = readyIds.has(scene.id);
        if (!audioReady) continue;

        const bgSource = getSceneBackground(scene.id, scene.category);
        if (!bgSource) {
          fullyReadyIds.add(scene.id);
          continue;
        }

        let bgReady = true;
        if (bgSource.uri && bgSource.uri.startsWith('file://')) {
          const bgCleanPath = bgSource.uri.replace('file://', '');
          bgReady = await RNFS.exists(bgCleanPath);

          if (!bgReady) {
            console.log(`[HomeScreen] ⚠️ ${scene.id}: 音频✅ 但背景图缺失 (${bgCleanPath})`);
          }
        }

        if (bgReady) {
          fullyReadyIds.add(scene.id);
          console.log(`[HomeScreen] ✅ ${scene.id}: 音频+背景图都已就绪`);
        }
      }

      if (isMounted) {
        setDownloadedSceneIds(fullyReadyIds);

        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify([...fullyReadyIds]));
          console.log(`[HomeScreen] ✅ 缓存已更新: ${fullyReadyIds.size} 个完全就绪的场景`);
        } catch (e) {
          console.warn('[HomeScreen] ⚠️ 缓存保存失败:', e);
        }
      }
    };

    // 【秒亮策略】1. 先读缓存，立即显示 UI
    const loadCacheFirst = async () => {
      try {
        const cachedData = await AsyncStorage.getItem(CACHE_KEY);
        if (cachedData && isMounted) {
          const cachedIds = JSON.parse(cachedData);
          const cachedSet = new Set<string>(cachedIds);
          if (cachedSet.size > 0) {
            console.log(`[HomeScreen] ⚡ 秒亮！从缓存加载: ${cachedSet.size} 个场景`);
            setDownloadedSceneIds(cachedSet);
          }
        }
      } catch (e) {
        console.warn('[HomeScreen] ⚠️ 缓存读取失败:', e);
      }

      // 【后台校验】2. 异步检查实际文件，更新状态
      checkDownloadedScenes();
    };
    
    loadCacheFirst();

    // 【事件驱动】监听单个文件下载完成，立即刷新缩略图
    import('../services/DownloadService').then(({ DownloadService }) => {
      if (!isMounted) return;

      DownloadService.setFileDownloadedCallback((assetId: string) => {
        console.log(`[HomeScreen] 🎉 收到文件下载完成事件: ${assetId}`);

        // 延迟 500ms 确保文件完全落盘后再检查
        setTimeout(() => {
          if (isMounted) {
            checkDownloadedScenes();
          }
        }, 500);
      });
    });

    // 定期刷新（降低频率到 10 秒，减少 IO）
    const interval = setInterval(checkDownloadedScenes, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);

      import('../services/DownloadService').then(({ DownloadService }) => {
        DownloadService.setFileDownloadedCallback(null);
      }).catch(() => {});
    };
  }, []);

  // 【核心修改】初始化 Pan 坐标，设在底部中央
  const pan = useRef(new Animated.ValueXY({ 
    x: SCREEN_WIDTH / 2 - BUTTON_SIZE / 2, 
    y: SCREEN_HEIGHT - 260 
  })).current;

  useBackHandler(true, navigation);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('LAST_VIEWED_SCENE_ID').then(id => id && setFocusedSceneId(id));
      return () => setFocusedSceneId(null);
    }, [])
  );

  const CATEGORY_PRIORITY = ['Oriental', 'WesternChurch', 'Healing', 'Nature', 'Life', 'Brainwave'];
  const groupedScenes = useMemo(() => {
    return CATEGORY_PRIORITY.map(cat => ({
      title: cat,
      label: t(`categories.${cat.toLowerCase()}`),
      baseScenes: SCENES.filter(s => s.category === cat && s.isBaseScene),
    }));
  }, [t, i18n.language]);

  useEffect(() => {
    AsyncStorage.getItem('USER_NAME').then(name => setUserName(name || ''));
    const slogans = [t('slogans.journey'), t('slogans.peace'), t('slogans.silence')];
    setSlogan(slogans[Math.floor(Math.random() * slogans.length)]);
    Animated.timing(greetingFadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [t]);

  const handleShuffle = useCallback((category: SceneCategory) => {
    console.log(`[HomeScreen] 🔘 [handleShuffle] 按钮被点击! category=${category}, shufflingCategory=${shufflingCategory}`);
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true });
    
    if (shufflingCategory === category) {
      console.log(`[HomeScreen] 🛑 停止分类漫游: ${category}`);
      sceneRoamManager.stopRoaming();
      setShufflingCategory(null);
      Animated.timing(shuffleAnimRef, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      
      // 【🔁 Loop 实验】停止漫游 → 恢复单场景循环 (RepeatMode.Track)
      const audioService = AudioService.getInstance();
      audioService.applyLoopMode(false);
      return;
    }

    const scenesInCategory = SCENES.filter(s => s.isBaseScene && s.category === category);
    const readyScenes = scenesInCategory.filter(s => downloadedSceneIds.has(s.id));

    if (readyScenes.length === 0) {
      console.warn(`[HomeScreen] ⚠️ 分类 ${category} 没有已下载场景`);
      return;
    }

    const randomScene = readyScenes[Math.floor(Math.random() * readyScenes.length)];
    
    console.log(`[HomeScreen] 🎲 启动分类漫游: ${category} -> ${randomScene.id}`);
    
    sceneRoamManager.startRoaming(category);
    sceneRoamManager.recordPlayedScene(randomScene.id);
    setShufflingCategory(category);
    
    Animated.timing(shuffleAnimRef, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    
    const audioService = AudioService.getInstance();
    
    // 【🔁 Loop 实验】启动漫游 → 关闭循环 (RepeatMode.Off)
    audioService.applyLoopMode(true);
    
    audioService.switchSoundscape(randomScene).catch(e => {
      console.error('[HomeScreen] ❌ 切换场景失败:', e);
      sceneRoamManager.stopRoaming();
      setShufflingCategory(null);
    });
  }, [shufflingCategory, downloadedSceneIds, shuffleAnimRef]);

  // 【核心修改】PanResponder 逻辑：去掉了回弹跳变，增加 flattenOffset
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.extractOffset(); // 锁定当前位置为起点
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gestureState) => {
        pan.flattenOffset(); // 合并偏移量

        // 如果是点击（移动距离极小）
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          navigation.navigate('NoiseRoom');
          return;
        }

        // 计算吸附目标
        const targetX = pan.x._value < (SCREEN_WIDTH / 2 - BUTTON_SIZE / 2) ? 20 : (SCREEN_WIDTH - BUTTON_SIZE - 20);
        const minY = insets.top + 20;
        const maxY = SCREEN_HEIGHT - BUTTON_SIZE - 120;
        const targetY = Math.min(Math.max(pan.y._value, minY), maxY);

        // 丝滑吸附动画，不回弹
        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 7,
          tension: 40,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.gradientBackground}>
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollOffset(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
            <Icon name="leaf-outline" size={40} color="rgba(255,255,255,0.4)" style={styles.headerIcon} />
            <Text style={styles.title}>{t('appTitle')}</Text>
            <Animated.View style={{ opacity: greetingFadeAnim }}>
              <Text style={styles.subtitle}>
                {t('greetings.hello')}{userName ? `, ${userName}` : ''}. {slogan}
              </Text>
            </Animated.View>
          </View>

          {groupedScenes.map((group) => {
            const isShuffling = shufflingCategory === group.title;
            return (
            <View key={group.title} style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{group.label}</Text>
                <TouchableOpacity
                  onPress={() => handleShuffle(group.title)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Animated.View style={{ transform: [{ rotate: shuffleAnimRef.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg']
                  }) }] }}>
                    <Icon 
                      name={isShuffling ? "shuffle" : "shuffle-outline"} 
                      size={20} 
                      color={isShuffling ? "#6C5DD3" : "rgba(255,255,255,0.5)"} 
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
              {group.baseScenes.map((scene: Scene) => (
                <SceneItem 
                  key={scene.id} item={scene} isPlaying={effectiveIsPlaying} 
                  currentBaseSceneId={effectiveBaseSceneId} togglePlayback={togglePlayback} 
                  navigation={navigation} isFocused={focusedSceneId === scene.id}
                  scrollOffset={scrollOffset} scrollViewRef={scrollViewRef}
                  isResourceReady={downloadedSceneIds.has(scene.id)}
                  globalProgress={globalDownloadProgress.get(scene.id)}
                  onBoostPriority={(sceneId: string) => {
                    // 【全局】触发优先下载（使用 Hook）
                    prioritizeScene(sceneId);
                  }}
                  stateVersion={stateVersion}  // 【关键】强制刷新
                />
              ))}
            </View>
            );
          })}
        </ScrollView>
        
        {/* 【核心修改】简化的悬浮按钮：只用 Transform 控制 */}
        <Animated.View
          style={[styles.noiseContainer, { transform: pan.getTranslateTransform() }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity 
            style={styles.noiseCancelHexagon} 
            activeOpacity={0.8}
            onPress={() => {
              navigation.navigate('NoiseRoom');
            }}
          >
            <NoiseLabIcon size={40} />
          </TouchableOpacity>
          <Text style={styles.noiseCancelLabel}>{t('home_noise_lab')}</Text>
          <Text style={styles.noiseCancelDesc}>{t('home_noise_desc')}</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080912' },
  gradientBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: '#080912' },
  scrollContent: { paddingBottom: 120, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  headerIcon: { marginBottom: 10 },
  title: { fontSize: 32, color: '#fff', fontWeight: '700', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', marginTop: 8 },
  section: { width: '100%', alignItems: 'center', marginBottom: 40 },
  sectionHeaderRow: {
    width: ITEM_WIDTH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 22, color: '#fff', fontWeight: '700' },
  cardWrapper: { width: ITEM_WIDTH, height: 100, marginBottom: 16 },
  cardContainer: { width: ITEM_WIDTH, height: 100 },
  cardClip: { width: ITEM_WIDTH, height: 100, overflow: 'hidden', borderRadius: 16 },
  memoryHighlight: { position: 'absolute', top: 8, bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', zIndex: 3 },
  card: { width: ITEM_WIDTH, height: 100, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(30, 30, 30, 0.6)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  cardPressed: { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(40, 40, 40, 0.7)' },
  cardInner: { flex: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  cardBg: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },

  // 【左侧缩略图】
  thumbnail: { width: 64, height: 64, borderRadius: 12, marginRight: 14, overflow: 'hidden' },
  thumbnailRadius: { borderRadius: 12 },
  
  // 【语义化占位块 - 磨砂质感 + Icon】
  thumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  placeholderIcon: {
    fontSize: 26,
    opacity: 0.5,
  },

  // 【中间信息】
  cardText: { flex: 1, marginRight: 10 },
  cardTextCentered: { justifyContent: 'center' },
  cardTitle: { fontSize: 18, color: '#fff', fontWeight: '700', letterSpacing: 0.3 },
  cardTitleDownloading: { color: 'rgba(255,255,255,0.4)' },
  cardSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  cardDownloadingBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  cardDownloadingText: { fontSize: 20 },

  // 【右侧操作区】
  cardRightArea: { justifyContent: 'center', alignItems: 'center' },
  cardPlayButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  cardPlayIcon: { fontSize: 18, color: '#333', marginLeft: 2 },
  cardPauseButton: { backgroundColor: '#6C5DD3' },
  cardPauseIcon: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  
  // 悬浮按钮容器
  noiseContainer: {
    position: 'absolute',
    left: 0, // 初始偏移靠 pan 控制
    top: 0,
    width: BUTTON_SIZE,
    alignItems: 'center',
    zIndex: 10000,
  },
  noiseCancelHexagon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 8,
    shadowColor: '#4A90E2',
    shadowRadius: 10,
    shadowOpacity: 0.6,
  },
  noiseCancelLabel: { marginTop: 8, fontSize: 11, color: '#fff', fontWeight: '600', textAlign: 'center' },
  noiseCancelDesc: { marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 8 },

  // 【重构】卡片内嵌式下载状态样式
  priorityBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: '#FFD700',
    shadowRadius: 4,
    shadowOpacity: 0.5,
    elevation: 5,
  },
  priorityBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  cardStatusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    fontWeight: '500',
  },
  cardTitleActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cardTitleInactive: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '600',
  },
  cardReadyText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '600',
  },
  
  // 【优先下载按钮】
  boostButton: {
    backgroundColor: '#6C5DD3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#6C5DD3',
    shadowRadius: 6,
    shadowOpacity: 0.4,
    elevation: 6,
  },
  boostButtonText: {
    fontSize: 16,
    marginRight: 4,
  },
  boostButtonLabel: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  
  // 【下载中图标】
  downloadingIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108,93,211,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  downloadingPercent: {
    fontSize: 11,
    color: '#6C5DD3',
    marginLeft: 6,
    fontWeight: '700',
  },
  
  // 【等待图标】
  queuedIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queuedIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  
  // 【卡片底部进度条】
  cardProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  progressBarBg: {
    flex: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6C5DD3',
  },
});