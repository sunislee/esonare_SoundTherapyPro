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
  ScrollView,
} from 'react-native';

// 【🔥 v3】useSyncExternalStore — 订阅 DeviceEventEmitter，只在真实事件发生时触发重渲染
function useDeviceEventSubscription(eventType: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(eventType, () => setTick(v => v + 1));
    return () => sub.remove();
  }, [eventType]);
  return tick;
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import AudioService from '../services/AudioService';
import { RainDrop } from '../components/RainDrop';
import { SCENES, Scene, SceneCategory, getSceneBackground } from '../constants/scenes';
import { assetMap } from '../constants/assetMap';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useAudio } from '../context/AudioContext';
import Icon from 'react-native-vector-icons/Ionicons';
import NoiseLabIcon from '../components/NoiseLabIcon';
import NoiseLabModal from '../screens/NoiseCancellationExperiment';
// ✅ 使用 React Native 原生 ScrollView（移除 gesture-handler 依赖）
import { Typography } from '../theme/Typography';
import { useTranslation } from 'react-i18next';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeSceneDownloadChanged, getSceneDownloadState, tickScene } from '../utils/SceneDownloadStore';
import { sceneRoamManager } from '../services/SceneRoamManager';
import { checkSceneResourceStatus, getAllSceneStatuses, initializeResources } from '../services/ResourceStatusManager';
import ToastUtil from '../utils/ToastUtil';
import { checkNoiseResourcesReady, getNoiseResourceFiles } from '../services/NoiseResourceChecker';
import { downloadTargetFilesAsync } from './ResourceDownloadScreen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_WIDTH = SCREEN_WIDTH - 40;
const BUTTON_SIZE = 80;

// 【辅助函数】Set 内容比对
const setsAreEqual = (a: Set<string>, b: Set<string>) => 
  a.size === b.size && [...a].every(x => b.has(x));

// 【状态持久化】Shuffle 模式存储 Key
const SHUFFLE_STATE_KEY = '@soundtherapy/shuffle_state';

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
  stateVersion,    // 【关键】强制刷新计数器
  lockedIds        // 【🔥🔥🔥 v8 双向锁定集合】同时锁住新旧两个场景
}: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ════════════════════════════════════════════════════════
  // 【三态定义】
  // 1. Idle / NotStarted: progress = 0, status = 'idle' -> 显示下载按钮
  // 2. Downloading: 0 < progress < 100 -> 显示进度条 + 灰色占位图 + 禁用点击
  // 3. Ready: progress = 100 -> 显示真实缩略图 + 解锁点击
  // ════════════════════════════════════════════════════════
  const downloadProgress = globalProgress?.progress || 0;
  const downloadStatus = globalProgress?.status || 'idle';
  const isPriority = globalProgress?.isPriority || false;
  
  // 【三态判定】
  const isDownloading = downloadStatus === 'downloading' && downloadProgress < 100;
  const isReady = downloadStatus === 'ready' || downloadProgress >= 100;
  const isIdle = !isDownloading && !isReady;
  
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);
   const [itemY, setItemY] = useState<number | null>(null);
   const [hasAnimated, setHasAnimated] = useState(false);
   const viewRef = useRef<View>(null);
   const { t } = useTranslation();

    // 【🔥 v3 修复】背景图就绪事件订阅 — 替代 refreshKey interval。
    // subscribe 在 DeviceManager.subscribe() 时绑定，return unsubscribe() 移除，
    // 每次 SceneItem mount/unmount（滚动回收）安全注册/注销，无内存泄漏。
    const bgReadyTick = useDeviceEventSubscription('backgroundImagesReady');
  
  // 【单例获取播放状态】
  const directState = useMemo(() => {
    try {
      const service = AudioService.getInstance() as any;
      if (service) {
        const realIsPlaying = service.isActuallyPlaying;
        const realSceneId = service.getCurrentBaseSceneId();
        return { isPlaying: realIsPlaying, sceneId: realSceneId, success: true };
      }
    } catch (e: any) {
      console.error('[SceneItem] ❌ [状态获取失败]', e?.message || e);
    }
    return { isPlaying: null, sceneId: null, success: false };
  }, [stateVersion]);
  
  const finalPlaying = directState.success ? directState.isPlaying : isPlaying;
  const finalSceneId = directState.success ? directState.sceneId : (currentBaseSceneId ?? null);
  const isThisPlaying = finalPlaying && finalSceneId === item.id;
  
  // 【状态驱动 UI - 激活态判定】
  const isActive = (() => {
    if (lockedIds && lockedIds.has(item.id)) {
      return true;
    }
    return isThisPlaying;
  })();

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    ReactNativeHapticFeedback.trigger(type === 'heavy' ? 'impactHeavy' : 'impactLight', { enableVibrateFallback: true });
  }, []);

  // 【核心】处理点击事件 - 根据三态决定行为
  const handlePress = useCallback(() => {
    console.log(`[SceneItem] 👆 [handlePress] 点击事件触发: ${item.id}`);
    console.log(`[SceneItem] 📊 当前状态: isReady=${isReady}, isDownloading=${isDownloading}, isIdle=${isIdle}`);
    console.log(`[SceneItem] 📊 downloadProgress: ${downloadProgress}%, status: ${downloadStatus}`);
    console.log(`[SceneItem] 🔧 onBoostPriority 存在: ${!!onBoostPriority}`);
    
    triggerHaptic();
    
    if (isReady) {
      // 【Ready】资源就绪 → 直接导航
      console.log(`[SceneItem] ✅ [handlePress] 资源就绪，导航到播放器: ${item.id}`);
      if (item.id.includes("breath")) navigation.navigate("BreathDetail", { sceneId: item.id });
      else navigation.navigate("ImmersivePlayer", { sceneId: item.id });
    } else {
      // 【Downloading / Idle】触发优先下载
      console.log(`[SceneItem] ⬇️ [handlePress] 触发下载: ${item.id}`);
      if (onBoostPriority) {
        console.log(`[SceneItem] 🚀 [handlePress] 调用 onBoostPriority(${item.id})`);
        onBoostPriority(item.id);
        console.log(`[SceneItem] ✅ [handlePress] onBoostPriority 已调用`);
      } else {
        console.error(`[SceneItem] ❌ [handlePress] onBoostPriority 不存在！`);
      }
      triggerHaptic("heavy");
    }
  }, [item.id, isReady, isDownloading, isIdle, downloadProgress, downloadStatus, onBoostPriority, triggerHaptic, navigation]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);
  
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
  
  // 【缩略图逻辑 - 修复版】优先使用 backgroundSource，避免空 assetMap 导致的缩略图丢失
  const getThumbnailSource = (sceneItem: any, ready: boolean): any => {
    const originalId = sceneItem.id;
    
    // 对于 oriental_ 和 western_church_ 开头的场景，重新获取最新的 backgroundSource
    if (sceneItem.id.startsWith('oriental_') || sceneItem.id.startsWith('western_church_')) {
      const freshBg = getSceneBackground(sceneItem.id, sceneItem.category);
      if (freshBg) return freshBg;
    }
    
    // 【🔥🔥🔨 关键修复】优先使用 scenes.ts 的 getSceneBackground() 返回的 backgroundSource
    if (sceneItem.backgroundSource) {
      const bgSource = sceneItem.backgroundSource;
      
      // 支持三种格式：require() 数字、file:// URI、http URL
      if (typeof bgSource === 'number') return bgSource;
      if (bgSource?.uri?.startsWith('file://')) return bgSource;
      if (bgSource?.uri?.startsWith('http')) return bgSource;
    }
    
    // fallback: 检查 assetMap（如果有的话）
    const sanitizedId = originalId.replace(/^0+/, '');
    const assetMapAny = assetMap as any;
    const lookupKey = assetMapAny[originalId] ? originalId : (assetMapAny[sanitizedId] ? sanitizedId : null);
    
    if (lookupKey && assetMapAny[lookupKey]) {
      console.log(`[SceneItem] ✅ getThumbnailSource: ${sceneItem.id} - 从 assetMap 找到`);
      return assetMapAny[lookupKey];
    }
    
    console.log(`[SceneItem]  getThumbnailSource: ${sceneItem.id} - 无可用缩略图源`);
    return null;
  };

  return (
    <View
      ref={viewRef}
      style={styles.cardWrapper}
      // 【🔥 v3】移除 refreshKey — 改用 onLayout + backgroundImagesReady 事件重建
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
            style={[
              styles.card, 
              isPressed && styles.cardPressed,
              isActive && styles.cardActive
            ]}
            onPressIn={() => {
              setIsPressed(true);
              Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
            }}
            onPressOut={() => {
              setIsPressed(false);
              Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
            }}
            onPress={handlePress}  // 【🔥🔥🔨 关键修复】始终允许点击，不禁用！
          >
            <View style={styles.cardInner}>
              <View style={[styles.cardBg, { backgroundColor: 'rgba(30, 30, 30, 0.6)' }, isActive && styles.cardBgActive]} />
              
              {/* 【左侧缩略图 - 三态驱动】 */}
              {(() => {
                // 【Downloading 态】显示灰色占位图
                if (isDownloading) {
                  return (
                    <View style={[styles.thumbnailPlaceholder, { backgroundColor: 'rgba(100,100,100,0.3)' }]}>
                      <ActivityIndicator size="small" color="#6C5DD3" />
                      <Text style={styles.downloadingPercent}>{Math.round(downloadProgress)}%</Text>
                    </View>
                  );
                }
                
                // 【Idle / Ready 态】显示真实缩略图或语义化占位块
                const thumbSource = getThumbnailSource(item, isReady);
                const hasSource = thumbSource !== null;

                if (hasSource) {
                  return (
                    <ImageBackground
                      source={thumbSource}
                      style={styles.thumbnail}
                      resizeMode="cover"
                      imageStyle={styles.thumbnailRadius}
                      // 【🔥 v3】key 改用 bgReadyTick（useSyncExternalStore 事件计数），
               // 背景图下载完成时 ImageBackground 重建 → RN 重新统计图片尺寸
               key={`thumb-${item.id}-${isReady ? 'ready' : 'pending'}-${bgReadyTick}`}
                    />
                  );
                }

                return (
                  <View style={[styles.thumbnailPlaceholder, { backgroundColor: getCategoryColor(item.category) }]}>
                    <Text style={styles.placeholderIcon}>{getCategoryIcon(item.category)}</Text>
                  </View>
                );
              })()}
              
              {/* 【中间信息区 - 三态驱动】 */}
              <View style={[styles.cardText, isResourceReady && styles.cardTextCentered]}>
                <Text
                  style={[
                    styles.cardTitle,
                    isActive && styles.cardTitleActive,
                    !isActive && styles.cardTitleInactive
                  ]}
                  numberOfLines={1}
                >
                  {t(`scenes.${item.id}.title`, { defaultValue: item.title })}
                </Text>

                {/* 【状态提示 - 必须音频+背景图+缩略图全部就绪】 */}
                {isDownloading ? (
                  <Text style={styles.cardStatusText} numberOfLines={1}>
                    {Math.round(downloadProgress)}% - Downloading
                  </Text>
                ) : isResourceReady ? (
                  <Text style={styles.cardReadyText} numberOfLines={1}>
                    Ready to Play ✨
                  </Text>
                ) : isReady ? (
                  <Text style={[styles.cardStatusText, { color: '#FFA500' }]} numberOfLines={1}>
                    Loading Images...
                  </Text>
                ) : (
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    Waiting to Download
                  </Text>
                )}
              </View>
              
              {/* 【右侧操作区 - 三态驱动】 */}
              <View style={styles.cardRightArea}>
                {/* 【All Ready】播放按钮 */}
                {isResourceReady ? (
                  <TouchableOpacity 
                    style={[styles.cardPlayButton, isActive && styles.cardPauseButton]} 
                    onPress={() => { triggerHaptic(); togglePlayback(item); }}
                  >
                    <Text style={[styles.cardPlayIcon, isActive && styles.cardPauseIcon]}>{isActive ? '||' : '▶'}</Text>
                  </TouchableOpacity>
                ) : isDownloading ? (
                  /* Downloading: 进度条 + 下载图标 */
                  <View style={styles.downloadingIconContainer}>
                    <ActivityIndicator size="small" color="#6C5DD3" />
                    <Text style={styles.downloadingPercent}>{Math.round(downloadProgress)}%</Text>
                  </View>
                ) : isReady ? (
                  /* Audio Ready but Images Loading: 加载图标 */
                  <View style={[styles.downloadingIconContainer]}>
                    <ActivityIndicator size="small" color="#FFA500" />
                    <Text style={[styles.downloadingPercent, { color: '#FFA500' }]}>IMG</Text>
                  </View>
                ) : (
                  /* Idle: 下载图标 */
                  <View style={styles.queuedIconContainer}>
                    <Text style={styles.queuedIcon}>⬇</Text>
                  </View>
                )}
              </View>
              
              {/* 【进度条（仅下载中显示）】 */}
              {isDownloading && (
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
}, (prevProps, nextProps) => {
  const currentItemId = nextProps.item.id || prevProps.item.id;
  const prevLockedToThis = prevProps.lockedIds?.has(currentItemId) || false;
  const nextLockedToThis = nextProps.lockedIds?.has(currentItemId) || false;
  
  // 使用内容比对代替引用比对
  const lockedIdsChanged = !setsAreEqual(prevProps.lockedIds, nextProps.lockedIds);
  
  if (lockedIdsChanged && (prevLockedToThis || nextLockedToThis)) {
    console.log(`[SceneItem] 🚨 [Memo-v8-霸王条款] 强制刷新: ${currentItemId}`);
    return false;
  }
  
  const prevActive = (prevProps.lockedIds?.has(currentItemId)) || 
                     (prevProps.isPlaying && prevProps.currentBaseSceneId === currentItemId);
  const nextActive = (nextProps.lockedIds?.has(currentItemId)) || 
                     (nextProps.isPlaying && nextProps.currentBaseSceneId === currentItemId);
  
  if (prevActive !== nextActive) {
    console.log(`[SceneItem] 🔄 [Memo-v8] 激活状态变化: ${currentItemId}`);
    return false;
  }
  
  if (prevProps.stateVersion !== nextProps.stateVersion) {
    return false;
  }
  
  return true;
});

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPlaying, currentBaseSceneId, togglePlayback } = useAudio();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  // 【Noise Lab Modal 状态】
  const [showNoiseLabModal, setShowNoiseLabModal] = useState(false);

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
  
  // 【🔥 状态版本计数器 - 已在 useState 中定义】

  // 【🔥🔥🔥 新增】监听资源加载状态变化
  const [resourceLoading, setResourceLoading] = useState<{ loading: boolean; message?: string }>({ 
    loading: false, 
    message: undefined 
  });

  useEffect(() => {
    console.log('[HomeScreen] 📡 [addResourceLoadingListener] 注册监听器...');
    
    // ✅ 使用文件顶部已导入的 AudioService
    const audioService = AudioService.getInstance() as any;
    const unsubscribe = audioService.addResourceLoadingListener?.(({ loading, message }: { loading: boolean; message?: string }) => {
      console.log(`[HomeScreen] ✅ [addResourceLoadingListener] 收到通知: loading=${loading}, message=${message}`);
      setResourceLoading({ loading, message });
      
      // 资源加载状态变化时，强制刷新列表（递增版本号）
      if (!loading) {
        setStateVersion(v => v + 1);
      }
    }) || null;
    
    return () => {
      console.log('[HomeScreen] 📡 [addResourceLoadingListener] 移除监听器');
      unsubscribe?.();
    };
  }, []);

  // 【🔥 根本性修复】直接从 AudioService 获取真实播放状态（绕过
  const [realIsPlaying, setRealIsPlaying] = useState<boolean | null>(null); // null=使用 Context
  const [realBaseSceneId, setRealBaseSceneId] = useState<string | null>(null); // null=使用 Context
  
  // 【最终使用的播放状态】：真实状态优先，否则使用 Context
  const effectiveIsPlaying = realIsPlaying ?? isPlaying;
  const effectiveBaseSceneId = realBaseSceneId ?? currentBaseSceneId;
  
  // 【监听播放状态变化 → 递增版本号 → 强制刷新所有列表项】
  useEffect(() => {
    console.log(`[HomeScreen] 🔄 [状态监控] isPlaying=${isPlaying}, currentBaseSceneId=${currentBaseSceneId}, 触发版本更新: ${stateVersion + 1}`);
    setStateVersion(v => v + 1);
  }, [isPlaying, currentBaseSceneId, realIsPlaying, realBaseSceneId]);
  
  // 【🔥 关键】页面获得焦点时，直接从 AudioService 获取真实状态
  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] 🎯 [焦点同步] 页面获得焦点，开始同步真实状态...');
      
      const syncRealState = () => {
        try {
          // ✅ 使用文件顶部已导入的 AudioService（避免动态 require() 问题）
          const audioService = AudioService.getInstance();
          
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
  const [isDataReady, setIsDataReady] = useState(false); // 【数据就绪标志】
  
  // ════════════════════════════════════════════════════════
  // 【🔥🔥🔨 v10】按场景独立 tick — subscribeExternalStore 风格
  // HomeScreen 不再持有全局 downloadProgress Map，改为每个 SceneItem mount 时订阅自己的 tick。
  // prioritizeScene：用户点击 → tickScene(ready) 标记就绪 + 启动静默下载（DownloaderService.startDownload）
  const prioritizeScene = useCallback((sceneId: string) => {
    console.log(`[HomeScreen] ⚡ [prioritizeScene] ${sceneId}`);
    // 【⚡ 即时反馈】先 tick 为 ready，让用户看到 UI 响应（缩略图加载 + 播放按钮）
    tickScene(sceneId, { progress: 100, status: 'ready' });
    
    // 如果该场景的订阅者还没 mount（不在 scroll view），稍后重试
    if (!getSceneDownloadState(sceneId)) {
      setTimeout(() => tickScene(sceneId, { progress: 100, status: 'ready' }), 800);
    }
    
    // 启动静默下载（DownloaderService.startDownload 内部保证幂等）
    import('../services/DownloaderService').then(({ DownloaderServiceInstance }) => {
      console.log(`[HomeScreen] 🚀 [prioritizeScene] 启动静默下载: ${sceneId}`);
      DownloaderServiceInstance.addTaskToQueue(sceneId);
      DownloaderServiceInstance.startDownload();
    });
  }, []);
  
  // ════════════════════════════════════════════════════════
  // 【🔥🔥🔨 v10】按场景独立 tick — subscribeExternalStore 风格
  // 旧实现（bug）：useResourceDownloader 全局 state，任何事件 → React setState → HomeScreen 重渲染 → 所有 SceneItem 重建。
  // 新实现：每个 SceneItem mount 时 subscribeSceneDownloadChanged(sceneId, () => setStateVersion(v=>v+1))，
  //   只有自身 tick+1 才触发重渲染；全局刷新仍靠 stateVersion（播放/焦点同步等事件驱动）。
  // ════════════════════════════════════════════════════════
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  
  // Ref 存储最新值（避免闭包陷阱）
  const lockedIdsRef = useRef<Set<string>>(new Set());
  
  // 同步 state 到 ref
  useEffect(() => {
    lockedIdsRef.current = lockedIds;
  }, [lockedIds]);
  
  // 【🔥 热启动自动下载】组件挂载后1秒自动触发所有基础场景的下载
  useEffect(() => {
    const timer = setTimeout(() => {
      SCENES.filter(s => s.isBaseScene).forEach(scene => {
        console.log(`[HomeScreen] ⚡ [热启动下载] 自动触发: ${scene.id}`);
        prioritizeScene(scene.id);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [prioritizeScene]);

  // 【🔥 v10】每个 SceneItem mount 时订阅自己的 tick，只有自身场景变化才重渲染。
  // ref 存储所有 subscription dispose 函数，卸载时一次性清理（避免闭包陷阱）。
  const sceneSubscriptions = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const subs = new Map(sceneSubscriptions.current);
    SCENES.filter(s => s.isBaseScene).forEach((scene) => {
      if (!subs.has(scene.id)) {
        const dispose = subscribeSceneDownloadChanged(scene.id, () => setStateVersion(v => v + 1));
        subs.set(scene.id, dispose);
      }
    });
    sceneSubscriptions.current = subs;
    return () => {
      subs.forEach((dispose) => { try { dispose(); } catch (_e) {} });
    };
  }, []); // setStateVersion 引用稳定，空依赖 = useEffect 只在 mount/unmount 执行
  
  // 【流式就绪缓存】缓存 Key
  const CACHE_KEY = 'downloaded_scene_ids_cache';
  
  // 检查已下载的场景资源 - 带缓存优化（保留作为备用）
  // 【🔥 已禁用】此 useEffect 会覆盖 v3 终极暴力修复的状态，导致场景显示 "Queued"
  // 原因：v3 已经强制点亮所有场景，不需要再扫描文件系统

  // ════════════════════════════════════════════════════════
  // 【预下载拦截逻辑】悬浮球入口 — 检查四组资源 + 后台静默下载
  // ════════════════════════════════════════════════════════
  const NOISE_LAB_AUDIO_GROUPS = ['wind_noise', 'balanced_noise', 'crowd_noise', 'traffic_noise'] as const;

  /**
   * 检查降噪实验室四组资源是否全部就绪
   */
  const checkAllNoiseResourcesReady = useCallback(async (): Promise<boolean> => {
    try {
      const results = await Promise.all(
        NOISE_LAB_AUDIO_GROUPS.map(group => checkNoiseResourcesReady(group))
      );
      return results.every(r => r === true);
    } catch (error) {
      console.error('[HomeScreen] ❌ checkAllNoiseResourcesReady 异常:', error);
      return false;
    }
  }, []);

  /**
   * 后台静默预下载全部32个文件（四组各8个轨道）
   */
  const silentPreDownloadAll = useCallback(async () => {
    console.log('[HomeScreen] 🚀 [silentPreDownload] 开始后台静默预下载32个文件...');
    
    try {
      // 收集所有需要下载的文件路径
      const allPaths: string[] = [];
      for (const group of NOISE_LAB_AUDIO_GROUPS) {
        const files = getNoiseResourceFiles(group);
        allPaths.push(...files);
      }

      console.log(`[HomeScreen] 📥 [silentPreDownload] 共 ${allPaths.length} 个文件，启动后台下载...`);
      
      // 调用已修复的 downloadTargetFilesAsync（并发3）
      const result = await downloadTargetFilesAsync(allPaths);
      
      console.log(`[HomeScreen] ✅ [silentPreDownload] 完成：成功=${result.successCount}, 失败=${result.errors.length}`);
    } catch (error) {
      console.error('[HomeScreen] ❌ [silentPreDownload] 异常:', error);
    }
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

  // 【状态持久化】严格校验并恢复 Shuffle 模式状态
  const restoreShuffleState = useCallback(async () => {
    console.log('[HomeScreen] 🔄 [持久化] 开始恢复 Shuffle 状态...');
    console.log(`[HomeScreen] 📊 [持久化] 当前状态: isDataReady=${isDataReady}, downloadedSceneIds.size=${downloadedSceneIds.size}`);
    
    try {
      // 【立即读取】不等待任何前置条件
      const savedState = await AsyncStorage.getItem(SHUFFLE_STATE_KEY);
      
      if (!savedState) {
        console.log('[HomeScreen] 📭 [持久化] 无保存的 Shuffle 状态 → 保持默认灰色');
        return;
      }

      console.log(`[HomeScreen] 📦 [持久化] 发现保存的数据: ${savedState.substring(0, 100)}...`);

      let parsedData: { category: string; timestamp: number };
      try {
        parsedData = JSON.parse(savedState);
        console.log(`[HomeScreen] ✅ [持久化] JSON 解析成功: category=${parsedData.category}, timestamp=${parsedData.timestamp}`);
      } catch (parseError) {
        console.warn('[HomeScreen] ❌ [持久化-校验1失败] JSON 解析失败 → 原因：数据格式损坏', parseError);
        await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
        return;
      }

      // 【严格校验1】检查数据结构完整性
      if (!parsedData.category || !parsedData.timestamp || typeof parsedData.timestamp !== 'number') {
        console.warn('[HomeScreen] ❌ [持久化-校验1失败] 数据结构不完整 → 原因：缺少 category 或 timestamp 字段', parsedData);
        await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
        return;
      }

      // 【严格校验2】检查是否过期（1小时）
      const EXPIRY_DURATION = 60 * 60 * 1000; // 1小时
      const elapsedMinutes = Math.round((Date.now() - parsedData.timestamp) / 60000);
      const isExpired = Date.now() - parsedData.timestamp > EXPIRY_DURATION;
      
      if (isExpired) {
        console.warn(`[HomeScreen] ❌ [持久化-校验2失败] 已过期 → 原因：距离上次激活已过 ${elapsedMinutes} 分钟（超过1小时限制）`);
        await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
        return;
      }
      
      console.log(`[HomeScreen] ✅ [持久化-校验2通过] 未过期 (${elapsedMinutes} 分钟前)`);

      // 【严格校验3】验证 category 是否是合法分类名（使用实际的 CATEGORY_PRIORITY）
            const validCategories = CATEGORY_PRIORITY;
            
            if (!validCategories.includes(parsedData.category)) {
              console.warn(`[HomeScreen] ❌ [持久化-校验3失败] 分类名无效 → 原因："${parsedData.category}" 不在合法列表 [${validCategories.join(', ')}] 中`);
              await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
              return;
            }
      
      console.log(`[HomeScreen] ✅ [持久化-校验3通过] 分类名有效: ${parsedData.category}`);

      // 【宽松校验4】检查该分类下是否有基础场景定义（不强制要求已下载）
      const hasScenesInCategory = SCENES.some(s => 
        s.category === parsedData.category && s.isBaseScene
      );

      if (!hasScenesInCategory) {
        console.warn(`[HomeScreen] ❌ [持久化-校验4失败] 场景不存在 → 原因：分类 "${parsedData.category}" 下无任何基础场景定义`);
        await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
        return;
      }
      
      console.log(`[HomeScreen] ✅ [持久化-校验4通过] 该分类下有场景定义`);

      // ✅ 所有校验通过，安全恢复状态
      console.log(`[HomeScreen] 🎉 [持久化] 全部校验通过！开始恢复 Shuffle 状态: ${parsedData.category}`);
      
      const category = parsedData.category as SceneCategory;
      
      sceneRoamManager.startRoaming(category);
      setShufflingCategory(category);
      Animated.timing(shuffleAnimRef, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      
      // 【关键】自动选择一个场景并开始播放（与 handleShuffle 逻辑一致）
      const scenesInCategory = SCENES.filter(s => s.isBaseScene && s.category === category);
      const readyScenes = scenesInCategory.filter(s => downloadedSceneIds.has(s.id));
      
      if (readyScenes.length > 0) {
        const randomScene = readyScenes[Math.floor(Math.random() * readyScenes.length)];
        
        console.log(`[HomeScreen] 🎵 [持久化-自动播放] 恢复后自动开始播放: ${randomScene.id}`);
        console.log(`[HomeScreen] 🎵 [持久化-自动播放] 该分类可用场景数: ${readyScenes.length}`);
        
        sceneRoamManager.recordPlayedScene(randomScene.id);
        
        const audioService = AudioService.getInstance();
        audioService.applyLoopMode(true); // 🔁 Loop 实验：关闭循环
        
        audioService.switchSoundscape(randomScene).catch(e => {
          console.error('[HomeScreen] ❌ [持久化-自动播放] 恢复播放失败:', e);
          sceneRoamManager.stopRoaming();
          setShufflingCategory(null);
          AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
        });
      } else {
        console.warn('[HomeScreen] ⚠️ [持久化-自动播放] 该分类下没有已下载场景，仅恢复 UI 状态');
      }
      
    } catch (error) {
      console.error('[HomeScreen] ❌ [持久化] 恢复 Shuffle 状态异常:', error);
      await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
    }
  }, [isDataReady, downloadedSceneIds]); // 依赖数据就绪状态

  useEffect(() => {
    console.log('[HomeScreen] 🚀 [初始化] HomeScreen 组件挂载，开始初始化...');
    
    AsyncStorage.getItem('USER_NAME').then(name => setUserName(name || ''));
    const slogans = [t('slogans.journey'), t('slogans.peace'), t('slogans.silence')];
    setSlogan(slogans[Math.floor(Math.random() * slogans.length)]);
    Animated.timing(greetingFadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    
    // 【核心】强制将所有 isBaseScene 场景标记为资源就绪
    const baseIds = SCENES.filter(s => s.isBaseScene).map(s => s.id);
    const readyMap: Record<string, boolean> = {};
    baseIds.forEach(id => { readyMap[id] = true; });
    setDownloadedSceneIds(new Set(baseIds));
    
    // 【关键改进】不使用 setTimeout！改为监听 isDataReady 变化
    // 原因：冷启动时 downloadedSceneIds 加载时间不确定（可能 100ms-2000ms）
    // 使用 isDataReady 标志确保数据真正就绪后才恢复
    console.log('[HomeScreen] ⏳ [持久化] 等待 isDataReady=true 后触发恢复逻辑...');
  }, [t]); // 只在 t 变化时执行（语言切换）

  // 【核心】当数据就绪后立即触发 Shuffle 状态恢复
  useEffect(() => {
    if (isDataReady) {
      console.log(`[HomeScreen] ✅ [数据就绪触发] isDataReady=${isDataReady}，开始执行 restoreShuffleState()`);
      restoreShuffleState();
    }
  }, [isDataReady, restoreShuffleState]);

  // 【统一清理函数】彻底清空 Shuffle 状态（供多处调用）
  const clearShuffleState = useCallback(async () => {
    console.log('[HomeScreen] 🧹 [彻底清理] 开始清除所有 Shuffle 相关状态...');
    
    try {
      // 1. 停止漫游引擎
      sceneRoamManager.stopRoaming();
      
      // 2. 清空本地状态
      setShufflingCategory(null);
      
      // 3. 重置动画到默认值
      Animated.timing(shuffleAnimRef, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      
      // 4. 清除持久化存储
      await AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
      
      // 5. 恢复循环模式
      const audioService = AudioService.getInstance();
      audioService.applyLoopMode(false);
      
      console.log('[HomeScreen] ✅ [彻底清理] 所有 Shuffle 状态已清除');
    } catch (error) {
      console.error('[HomeScreen] ❌ [彻底清理] 清除状态异常:', error);
    }
  }, []);

  // ══════════════════════════════════════════════════════════
  // 【方案 A 完美收官 v5】全项状态锁 - 支持手动+自动切换
  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 v8 双向锁定函数】同时锁住新旧两个场景
  // ══════════════════════════════════════════════════════════
  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 锁定时器引用
  
  const lockSceneForTransition = useCallback(
    (newSceneId: string, source: 'manual' | 'auto' | 'trackChanged') => {
      
      console.log(`[HomeScreen] 🔒🔒🔒 [切换锁v8] ${source === 'manual' ? '用户点击' : source === 'auto' ? 'AudioService信号' : 'TrackPlayer事件'} 切换到: ${newSceneId}`);
      
      // 清除之前的定时器（防止快速连续触发）
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = null;
      }
      
      // 获取当前正在播放的场景（旧场景）
      const currentPlayingId = effectiveBaseSceneId || currentBaseSceneId;
      
      // 构建新的锁定集合：包含新场景 + 旧场景（如果存在且不同）
      const newLockedSet = new Set<string>();
      newLockedSet.add(newSceneId); // 新场景：提前变紫
      
      if (currentPlayingId && currentPlayingId !== newSceneId) {
        newLockedSet.add(currentPlayingId); // 旧场景：保持紫色不熄灭！
      }
      
  console.log(`[HomeScreen] 🔒 [切换锁v8] ⚡ 双向锁定：`, Array.from(newLockedSet));
  
// React Native 不支持 flushSync，直接使用 setState
setLockedIds(newLockedSet);
lockedIdsRef.current = newLockedSet;

console.log(`[HomeScreen] ✅ [切换锁v8] 🚀 状态更新完成！`);
    
    // 统一延时释放（4000ms，覆盖全过程）
      lockTimeoutRef.current = setTimeout(() => {
        console.log(`[HomeScreen] 🔓 [切换锁v8] 4000ms 结束，释放所有锁`);
        setLockedIds(new Set());
        lockedIdsRef.current = new Set();
        lockTimeoutRef.current = null;
      }, 4000);
    },
    [effectiveBaseSceneId, currentBaseSceneId]
  );
  
  // 【包装函数】在切换时立即锁定 UI 状态
  const handleTogglePlayback = useCallback(async (scene: Scene) => {
    lockSceneForTransition(scene.id, 'manual');
    
    try {
      await togglePlayback(scene);
    } catch (error) {
      console.error('[AudioService] ❌ [切换锁v8] togglePlayback 失败:', error);
      setLockedIds(new Set());
      lockedIdsRef.current = new Set();
    }
  }, [togglePlayback, lockSceneForTransition]);

  // 【组件卸载时清理定时器】
  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
      }
    };
  }, []);

  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 v8 双向锁定监听】自动漫游切换时立即锁定 UI（只注册一次！）
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    
    // ════════════════════════════════════════
    // 监听 1: TrackPlayer PlaybackActiveTrackChanged
    // ════════════════════════════════════════
    const trackSubscriptionRef = useRef<any>(null);
    let isMounted = true;

    const setupTrackListener = async () => {
      if (!isMounted) return;
      try {
        const TrackPlayer = (await import('react-native-track-player')).default;
        
        trackSubscriptionRef.current = await TrackPlayer.addEventListener(
          'PlaybackActiveTrackChanged',
          (data: any) => {
            console.log(`[HomeScreen] 🎵 [TrackPlayer事件] 活跃轨道变更:`, data);
            
            if (data?.track?.id || data?.nextTrack?.id) {
              const newSceneId = data.track?.id || data.nextTrack?.id;
              
              // 使用 ref 检查当前锁定状态（避免闭包陷阱）
              if (newSceneId && !lockedIdsRef.current.has(newSceneId)) {
                console.log(`[HomeScreen] 🔒 [TrackPlayer事件] 检测到新轨道: ${newSceneId}，立即锁定！`);
                lockSceneForTransition(newSceneId, 'trackChanged');
              } else if (lockedIdsRef.current.has(newSceneId)) {
                console.log(`[HomeScreen] ⏭️ [TrackPlayer事件] 新轨道=${newSceneId} 已在锁定中，跳过重复锁定`);
              }
            }
          }
        );
        
        console.log('[HomeScreen] 👂 [v8 双重监听] 已注册 PlaybackActiveTrackChanged（只注册一次）');
      } catch (error) {
        console.error('[HomeScreen] ❌ [v8 双重监听] 注册 TrackPlayer 监听失败:', error);
      }
    };
    
    setupTrackListener();
    
    // ════════════════════════════════════════
    // 监听 2: AudioService sceneSwitchStart 信号（⚠️ 最高优先级！）
    // ════════════════════════════════════════
    const switchStartSubscription = DeviceEventEmitter.addListener(
      'sceneSwitchStart',
      (data: { nextSceneId: string; source: string }) => {
        console.log(`[HomeScreen] 📡 [AudioService信号] 收到切换开始通知: ${data.nextSceneId}, 来源=${data.source}`);
        
        // 使用 ref 检查当前锁定状态（避免闭包陷阱）
        if (data.nextSceneId && !lockedIdsRef.current.has(data.nextSceneId)) {
          console.log(`[HomeScreen] 🔒 [AudioService信号] 立即锁定新场景: ${data.nextSceneId}`);
          lockSceneForTransition(data.nextSceneId, 'auto');
        } else if (lockedIdsRef.current.has(data.nextSceneId)) {
          console.log(`[HomeScreen] ⏭️ [AudioService信号] 场景=${data.nextSceneId} 已在锁定中，跳过重复锁定`);
        }
      }
    );
    
    console.log('[HomeScreen] 👂 [v8 双重监听] 已注册 sceneSwitchStart（只注册一次）');
    
    // 内存安全：组件卸载时移除所有监听器（只执行一次！）
    return () => {
      isMounted = false;
      if (trackSubscriptionRef.current) {
        trackSubscriptionRef.current.remove();
        console.log("[HomeScreen] 🧹 [v8 双重监听] 已移除 PlaybackActiveTrackChanged");
      }
      
      switchStartSubscription.remove();
      console.log('[HomeScreen] 🧹 [v8 双重监听] 已移除 sceneSwitchStart');
    };
  }, []);  // ← 空依赖项！只在挂载/卸载时执行一次！

  // 【跨页面同步】监听播放页 Shuffle 状态变化
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'shuffleStateChanged',
      (data: { isRoaming: boolean; category: SceneCategory | null }) => {
        console.log(`[HomeScreen] 📡 [跨页同步] 收到播放页通知: isRoaming=${data.isRoaming}, category=${data.category}`);
        
        if (data.isRoaming && data.category) {
          // 播放页开启了漫游 → 同步点亮 HomeScreen 的图标
          setShufflingCategory(data.category);
          Animated.timing(shuffleAnimRef, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          console.log(`[HomeScreen] ✅ [跨页同步] 已更新为激活状态: ${data.category}`);
        } else {
          // 播放页关闭了漫游 → 彻底清空状态（包括 AsyncStorage）
          clearShuffleState();
          console.log('[HomeScreen] ✅ [跨页同步] 已彻底清空 Shuffle 状态');
        }
      }
    );

    console.log('[HomeScreen] 👂 [跨页同步] 已注册 shuffleStateChanged 监听器');
    
    // 【内存安全】组件卸载时移除监听器
    return () => {
      subscription.remove();
      console.log('[HomeScreen] 🧹 [跨页同步] 已移除 shuffleStateChanged 监听器');
    };
  }, [clearShuffleState]);

  const handleShuffle = useCallback((category: SceneCategory) => {
    console.log(`[HomeScreen] 🔘 [handleShuffle] 按钮被点击! category=${category}, shufflingCategory=${shufflingCategory}`);
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true });
    
    if (shufflingCategory === category) {
      console.log(`[HomeScreen] 🛑 停止分类漫游: ${category}`);
      // 使用统一清理函数彻底清空所有状态
      clearShuffleState();
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
    
    // 【状态持久化】保存 Shuffle 状态（带时间戳，1小时后过期）
    const stateToSave = {
      category,
      timestamp: Date.now(),
    };
    
    console.log(`[HomeScreen] 💾 [持久化-保存] 准备保存数据: ${JSON.stringify(stateToSave)}`);
    console.log(`[HomeScreen] 💾 [持久化-保存] 使用 Key: ${SHUFFLE_STATE_KEY}`);
    
    AsyncStorage.setItem(SHUFFLE_STATE_KEY, JSON.stringify(stateToSave)).then(async () => {
      console.log(`[HomeScreen] ✅ [持久化-保存] AsyncStorage.setItem() Promise 已 resolve`);
      
      // 【立即验证】确认数据真的写入了
      try {
        const verifyData = await AsyncStorage.getItem(SHUFFLE_STATE_KEY);
        if (verifyData) {
          const parsed = JSON.parse(verifyData);
          console.log(`[HomeScreen] ✅ [持久化-验证] 保存成功！读取到的数据: category=${parsed.category}, timestamp=${parsed.timestamp}`);
        } else {
          console.error('[HomeScreen] ❌ [持久化-验证] 严重错误：setItem 成功但 getItem 返回 null！');
        }
      } catch (verifyError) {
        console.error('[HomeScreen] ❌ [持久化-验证] 验证读取失败:', verifyError);
      }
    }).catch((saveError) => {
      console.error('[HomeScreen] ❌ [持久化-保存] AsyncStorage.setItem() 失败:', saveError);
    });
    
    const audioService = AudioService.getInstance();
    
    // 【🔁 Loop 实验】启动漫游 → 关闭循环 (RepeatMode.Off)
    audioService.applyLoopMode(true);
    
    audioService.switchSoundscape(randomScene).catch(e => {
      console.error('[HomeScreen] ❌ 切换场景失败:', e);
      sceneRoamManager.stopRoaming();
      setShufflingCategory(null);
      // 【状态持久化】失败时也清除
      AsyncStorage.removeItem(SHUFFLE_STATE_KEY);
    });
  }, [shufflingCategory, downloadedSceneIds, shuffleAnimRef]);

  const handleShufflePress = useCallback((title: string) => {
    console.log(`[HomeScreen] 🔥🔥🔴 [DEBUG] Shuffle 按钮被点击！！！ group.title=${title}, group.label=`);
    console.log(`[HomeScreen] 🔥 [DEBUG] shufflingCategory 当前值: ${shufflingCategory}`);
    handleShuffle(title as SceneCategory);
  }, [handleShuffle, shufflingCategory]);

  // 【核心修改】PanResponder 逻辑：去掉了回弹跳变，增加 flattenOffset + 预下载拦截
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.extractOffset(); // 锁定当前位置为起点
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: async (e, gestureState) => {
        pan.flattenOffset(); // 合并偏移量

        // 如果是点击（移动距离极小）→ 预下载拦截 + 打开毛玻璃 Modal
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          console.log('[HomeScreen] 🎯 [悬浮球点击] 开始检查降噪实验室资源...');
          
          const allReady = await checkAllNoiseResourcesReady();
          
          if (allReady) {
            // 四组全部就绪 → 正常打开 Modal
            console.log('[HomeScreen] ✅ [悬浮球点击] 四组资源全部就绪，正常打开 Modal');
            setShowNoiseLabModal(true);
          } else {
            // 有任何未就绪 → Toast + 后台静默预下载
            console.warn('[HomeScreen] ⚠️ [悬浮球点击] 资源未全部就绪，触发后台静默预下载');
            ToastUtil.info('资源准备中，稍后再试');
            
            // 不打开 Modal，同时在后台静默下载全部32个文件
            silentPreDownloadAll();
          }
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
                {/* 🔴🔴🔴 调试版本 Shuffle 按钮 - 已优化样式 */}
                <TouchableOpacity
                  onPress={() => handleShufflePress(group.title)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  style={{
                    padding: 8,
                  }}
                >
                  <Animated.View style={{ transform: [{ rotate: shuffleAnimRef.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg']
                  }) }] }}>
                    <Icon 
                      name={isShuffling ? "shuffle" : "shuffle-outline"} 
                      size={24} 
                      color={isShuffling ? "#6C5DD3" : "rgba(255,255,255,0.6)"} 
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
              {group.baseScenes.map((scene: Scene) => (
                <SceneItem 
                  key={scene.id} item={scene} isPlaying={effectiveIsPlaying} 
                  currentBaseSceneId={effectiveBaseSceneId} togglePlayback={handleTogglePlayback} 
                  navigation={navigation} isFocused={focusedSceneId === scene.id}
                  scrollOffset={scrollOffset} scrollViewRef={scrollViewRef}
                  isResourceReady={downloadedSceneIds.has(scene.id)}
                          globalProgress={getSceneDownloadState(scene.id)}
                  onBoostPriority={prioritizeScene}
                  stateVersion={stateVersion}  // 【关键】强制刷新
                  lockedIds={lockedIds}  // 【🔥🔥🔥 v8 双向锁定集合】
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
            onPress={async () => {
              console.log('[HomeScreen] 🔥🔥🔥 [悬浮球按钮点击] 开始检查降噪实验室资源...');
              
              const allReady = await checkAllNoiseResourcesReady();
              
              if (allReady) {
                // 四组全部就绪 → 正常打开 Modal
                console.log('[HomeScreen] ✅ [悬浮球按钮点击] 四组资源全部就绪，正常打开 Modal');
                setShowNoiseLabModal(true);
              } else {
                // 有任何未就绪 → Toast + 后台静默预下载
                console.warn('[HomeScreen] ⚠️ [悬浮球按钮点击] 资源未全部就绪，触发后台静默预下载');
                ToastUtil.info('资源准备中，稍后再试');
                
                // 不打开 Modal，同时在后台静默下载全部32个文件
                silentPreDownloadAll();
              }
            }}
          >
            <NoiseLabIcon size={40} />
          </TouchableOpacity>
          <Text style={styles.noiseCancelLabel}>{t('home_noise_lab')}</Text>
          <Text style={styles.noiseCancelDesc}>{t('home_noise_desc')}</Text>
        </Animated.View>
      </View>

      {/* 🎨 Noise Lab 毛玻璃 Modal */}
      <NoiseLabModal
        visible={showNoiseLabModal}
        onClose={() => setShowNoiseLabModal(false)}
        /**
         * 资源未就绪时，跳转到下载页面
         * @param audioGroupId 音频组 ID
         * @param targetFiles 8个轨道文件的本地路径数组
         */
        onNavigateToDownload={handleNavigateToDownload}
      />
    </View>
  );

  const handleNavigateToDownload = useCallback((audioGroupId: string, targetFiles: string[]) => {
    console.log('[HomeScreen] 📥 NoiseLab 资源未就绪，跳转下载页:', audioGroupId);
    setShowNoiseLabModal(false); // 先关闭 Modal
    navigation.navigate('ResourceDownloadScreen', { targetFiles });
  }, [navigation]);

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
  cardActive: { borderColor: '#6C5DD3', backgroundColor: 'rgba(108, 93, 211, 0.12)' },  // 【v3】激活态：紫色边框+微背景
  cardInner: { flex: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  cardBg: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
  cardBgActive: { backgroundColor: 'rgba(108, 93, 211, 0.08)' },  // 【v3】激活态：微紫背景

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
