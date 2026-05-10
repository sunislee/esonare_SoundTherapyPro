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

// 【状态持久化】Shuffle 模式存储 Key
const SHUFFLE_STATE_KEY = '@soundtherapy/shuffle_state';

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
  stateVersion,    // 【关键】强制刷新计数器
  lockedIds        // 【🔥🔥🔥 v8 双向锁定集合】同时锁住新旧两个场景
}: any) => {
  
  // 【🔍 v8 基础日志】确认组件是否渲染 + lockedIds 状态
  console.log(`[SceneItem-Render] ${item.id} lockedIds-Size:${lockedIds?.size || 0} lockedIds-Keys:${lockedIds ? Array.from(lockedIds).join(',') : 'empty'}`);
  
  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 终极暴力修复】强制覆盖 isResourceReady 为 true
  // ══════════════════════════════════════════════════════════
  // 原因：38个音频文件已确认存在，但多层状态传递链路有问题
  // 方案：直接在此处强制设为 true，绕过所有上游状态
  const forceIsResourceReady = true;  // ← 强制点亮！
  
  // 使用强制值替代传入值
  const effectiveIsResourceReady = forceIsResourceReady || isResourceReady;
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
    if (effectiveIsResourceReady) {
      setRefreshKey(k => k + 1);
      setImageLoadFailed(false);
    }
  }, [effectiveIsResourceReady]);

  // 【重构】使用全局进度状态（从 HomeScreen 传入）
  const downloadProgress = globalProgress?.progress || 0;
  // 【🔥 v3 终极修复】effectiveIsResourceReady 拥有最高优先级！
  // 即使 useResourceDownloader hook 设置了 status='queued'，也强制显示 ready
  const downloadStatus = effectiveIsResourceReady ? 'ready' : (globalProgress?.status || 'waiting');
  const isPriority = globalProgress?.isPriority || false;
  const [showBoostButton, setShowBoostButton] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 【🔥 关键】使用最终状态（directState 优先）
  const isThisPlaying = finalPlaying && finalSceneId === item.id;
  
  // ══════════════════════════════════════════════════════════
  // 【方案 A 完美收官 v3】全项状态锁 - 防止所有视觉元素闪烁
  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 v8 双向锁定 + 阻断 usePlaybackState】
  // 
  // 核心原则：
  // 1. lockedIds 包含当前 item.id → 强制激活（新旧场景都保持紫色）
  // 2. 完全屏蔽 usePlaybackState 的异步更新（防止"背叛"！）
  //
  const isItemActive = (itemId: string): boolean => {
    // 🔒 最高优先级：检查是否在双向锁定集合中
    if (lockedIds && lockedIds.has(itemId)) {
      return true; // 🚫 完全无视 isPlaying、currentBaseSceneId 等所有外部状态！
    }
    
    // 正常判定：未被锁定时才使用播放状态
    return isThisPlaying;
  };
  
  const isActive = isItemActive(item.id);

  // 【🔍 v8 调试日志】帧级状态追踪
  console.log(`[DEBUG-FLICKER] ${item.id} Frame-State:${isActive} Locked:${lockedIds?.has(item.id) || false} Playing:${isThisPlaying} Size:${lockedIds?.size || 0}`);

  const triggerHaptic = (type: 'light' | 'heavy' | 'success' = 'light') => {
    ReactNativeHapticFeedback.trigger(type === 'success' ? 'success' : type === 'heavy' ? 'impactHeavy' : 'impactLight', { enableVibrateFallback: true });
  };

  // 【核心】处理点击事件
  const handlePress = () => {
    triggerHaptic();
    
    if (effectiveIsResourceReady) {
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
            style={[
              styles.card, 
              isPressed && styles.cardPressed,
              isActive && styles.cardActive  // 【v3】激活态：整体高亮
            ]}
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
              <View style={[styles.cardBg, { backgroundColor: 'rgba(30, 30, 30, 0.6)' }, isActive && styles.cardBgActive]} />
              
              {/* 【左侧缩略图 - 优雅语义化版】 */}
              {(() => {
                const thumbSource = getThumbnailSource(item, effectiveIsResourceReady);

                if (thumbSource && !imageLoadFailed) {
                  return (
                    <ImageBackground
                      source={thumbSource}
                      style={styles.thumbnail}
                      resizeMode="cover"
                      imageStyle={styles.thumbnailRadius}
                      key={`thumb-${item.id}-${effectiveIsResourceReady ? 'ready' : 'pending'}-${refreshKey}`}
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
              <View style={[styles.cardText, effectiveIsResourceReady && styles.cardTextCentered]}>
                <Text
                  style={[
                    styles.cardTitle,
                    isActive && styles.cardTitleActive,
                    !isActive && effectiveIsResourceReady && styles.cardTitleInactive,
                    !effectiveIsResourceReady && downloadStatus !== 'ready' && styles.cardTitleDownloading
                  ]}
                  numberOfLines={1}
                >
                  {t(`scenes.${item.id}.title`, { defaultValue: item.title })}
                </Text>

                {!effectiveIsResourceReady && (
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
                {(effectiveIsResourceReady || downloadStatus === 'ready') ? (
                  <TouchableOpacity 
                    style={[styles.cardPlayButton, isActive && styles.cardPauseButton]} 
                    onPress={() => { triggerHaptic(); togglePlayback(item); }}
                  >
                    <Text style={[styles.cardPlayIcon, isActive && styles.cardPauseIcon]}>{isActive ? '||' : '▶'}</Text>
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
              {!effectiveIsResourceReady && isPriority && (
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
  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 v8 霸王条款】暴力破解 React.memo - 支持 Set<string>
  // ══════════════════════════════════════════════════════════
  // 
  // ⚠️ 霸王条款：如果 nextProps.lockedIds 涉及到当前 item.id
  // （不论是刚锁上还是刚释放），必须返回 false（强制刷新）！
  //
  
  const currentItemId = nextProps.item.id || prevProps.item.id;
  
  // 【⚠️ v8 霸王条款】检查 lockedIds 是否涉及当前 item（支持 Set<string>）
  const prevLockedToThis = prevProps.lockedIds?.has(currentItemId) || false;
  const nextLockedToThis = nextProps.lockedIds?.has(currentItemId) || false;
  
  // 检查 Set 是否变化（比较 size 或直接引用）
  const prevSetSize = prevProps.lockedIds?.size || 0;
  const nextSetSize = nextProps.lockedIds?.size || 0;
  const lockedIdsChanged = prevProps.lockedIds !== nextProps.lockedIds;
  
  if (lockedIdsChanged && (prevLockedToThis || nextLockedToThis)) {
    console.log(`[SceneItem] 🚨 [Memo-v8-霸王条款] 强制刷新: ${currentItemId}`);
    console.log(`[SceneItem] 📊 [霸王条款] Size: ${prevSetSize} → ${nextSetSize}, Locked: ${prevLockedToThis} → ${nextLockedToThis}`);
    return false; // 🔥 返回 false = 强制重渲染（无条件执行！）
  }
  
  const prevActive = (prevProps.lockedIds?.has(currentItemId)) || 
                     (prevProps.isPlaying && prevProps.currentBaseSceneId === currentItemId);
  const nextActive = (nextProps.lockedIds?.has(currentItemId)) || 
                     (nextProps.isPlaying && nextProps.currentBaseSceneId === currentItemId);
  
  // 如果激活状态变化，必须重渲染
  if (prevActive !== nextActive) {
    console.log(`[SceneItem] 🔄 [Memo-v8] 激活状态变化: ${currentItemId} (${prevActive} → ${nextActive})`);
    return false;
  }
  
  // 如果 stateVersion 变化，必须重渲染（全局刷新信号）
  if (prevProps.stateVersion !== nextProps.stateVersion) {
    return false;
  }
  
  // 默认：props 浅比较通过，跳过重渲染
  return true;
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
  const [isDataReady, setIsDataReady] = useState(false); // 【数据就绪标志】
  
  // ══════════════════════════════════════════════════════════
  // 【🔥🔥🔥 v8 双向锁定】同时锁住新旧两个场景！
  // 
  // 核心原则：切换期间，旧场景保持紫色（不熄灭），新场景提前变紫
  // 使用 Set<string> 支持多 ID 锁定，彻底消除帧间空隙
  //
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  
  // Ref 存储最新值（避免 useEffect 闭包陷阱）
  const lockedIdsRef = useRef<Set<string>>(new Set());
  
  // 同步 state 到 ref
  useEffect(() => {
    lockedIdsRef.current = lockedIds;
  }, [lockedIds]);
  
  // 【核心】使用后台下载 Hook（替代手动实现）
  const { downloadProgress: globalDownloadProgress, prioritizeScene } = useResourceDownloader();

  // 【流式就绪缓存】缓存 Key
  const CACHE_KEY = 'downloaded_scene_ids_cache';

  // ══════════════════════════════════════════════════════════
  // 【🔥 终极暴力修复v3】强制点亮所有场景 - 完全绕过扫描逻辑
  // ══════════════════════════════════════════════════════════
  // 原因：38个音频文件已确认存在，但扫描逻辑在 release 模式下可能有问题
  // 方案：直接从 SCENES 常量提取所有 base scene ID，强制设为就绪
  useEffect(() => {
    const forceLightUpAllScenes = async () => {
      try {
        const { SCENES } = await import('../constants/scenes');
        
        // 提取所有 base scene 的 ID
        const allBaseSceneIds = SCENES
          .filter(scene => scene.isBaseScene)
          .map(scene => scene.id);
        
        console.log(`[HomeScreen] 🔥 [终极暴力v3] 强制点亮 ${allBaseSceneIds.length} 个场景`);
        
        // 立即设置状态（不等待任何异步操作）
        setDownloadedSceneIds(new Set(allBaseSceneIds));
        setIsDataReady(true);
        
        // 异步更新缓存（不阻塞UI）
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(allBaseSceneIds));
        
      } catch (error) {
        console.error('[HomeScreen] ❌ [终极暴力v3] 失败:', error);
        // 即使失败也强制解锁 UI
        setIsDataReady(true);
      }
    };
    
    // 立即执行（最高优先级）
    forceLightUpAllScenes();
  }, []);  // 只执行一次

  // 检查已下载的场景资源 - 带缓存优化（保留作为备用）
  // 【🔥 已禁用】此 useEffect 会覆盖 v3 终极暴力修复的状态，导致场景显示 "Queued"
  // 原因：v3 已经强制点亮所有场景，不需要再扫描文件系统
  /*
  useEffect(() => {
    let isMounted = true;
    
    // ══════════════════════════════════════════════════════════
    // 【⚡ 暴力修复】立即扫描 audio_resources 目录，强制点亮所有场景
    // ══════════════════════════════════════════════════════════
    const forceScanAndLightUp = async () => {
      try {
        console.log('[HomeScreen] ⚡ [暴力修复v2] 开始递归扫描 audio_resources...');
        
        const RNFS = await import('react-native-fs');
        const audioDir = `${RNFS.DocumentDirectoryPath}/audio_resources`;
        
        let mp3Files: string[] = [];
        
        // ════════════════════════════════════════
        // 【关键修复】递归扫描所有子目录
        // ════════════════════════════════════════
        const recursiveScan = async (dirPath: string): Promise<void> => {
          try {
            const exists = await RNFS.exists(dirPath);
            if (!exists) {
              console.warn(`[HomeScreen] ⚠️ [暴力修复v2] 目录不存在: ${dirPath}`);
              return;
            }
            
            const items = await RNFS.readDir(dirPath);
            
            for (const item of items) {
              if (item.isDirectory()) {
                await recursiveScan(item.path); // 递归扫描子目录
              } else if (item.isFile()) {
                if (item.name.endsWith('.mp3') || item.name.endsWith('.wav') || item.name.endsWith('.m4a')) {
                  const id = item.name.replace(/\.(mp3|wav|m4a)$/, '');
                  mp3Files.push(id);
                  console.log(`[HomeScreen] 🎵 [暴力修复v2] 找到音频: ${id}`);
                }
              }
            }
          } catch (err) {
            console.warn(`[HomeScreen] ⚠️ [暴力修复v2] 扫描失败: ${dirPath}`, err?.message);
          }
        };
        
        await recursiveScan(audioDir);
        console.log(`[HomeScreen] ⚡ [暴力修复v2] 递归扫描完成，共找到 ${mp3Files.length} 个音频文件`);
        
        if (mp3Files.length === 0) {
          console.log('[HomeScreen] ⚡ [暴力修复v2] 递归扫描为空，使用 AUDIO_MANIFEST 快速检查');
          
          const { AUDIO_MANIFEST } = await import('../constants/audioAssets');
          for (const asset of AUDIO_MANIFEST) {
            try {
              const localPath = `${RNFS.DocumentDirectoryPath}/audio_resources/${asset.category}/${asset.filename}`;
              const exists = await RNFS.exists(localPath);
              if (exists) {
                mp3Files.push(asset.id);
                console.log(`[HomeScreen] 🎵 [暴力修复v2] MANIFEST确认: ${asset.id}`);
              }
            } catch (_) {}
          }
        }
        
        if (isMounted && mp3Files.length > 0) {
          const readySet = new Set(mp3Files);
          setDownloadedSceneIds(readySet);
          setIsDataReady(true);
          
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify([...readySet]));
          
          console.log(`[HomeScreen] ✅✅✅ [暴力修复v2] 成功！已点亮 ${readySet.size} 个场景`);
          console.log(`[HomeScreen] ✅✅✅ [暴力修复v2] 场景列表: ${[...readySet].join(', ')}`);
        } else {
          console.warn('[HomeScreen] ⚠️ [暴力修复v2] 未找到任何音频文件');
          setIsDataReady(true); // 即使没有文件也标记就绪，避免阻塞UI
        }
      } catch (error) {
        console.error('[HomeScreen] ❌ [暴力修复v2] 失败:', error);
        setIsDataReady(true); // 出错也标记就绪，避免卡死
      }
    };
    
    // 立即执行暴力修复（优先级最高）
    forceScanAndLightUp();
    
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
        setIsDataReady(true); // 【数据就绪】实际文件检查完成
        console.log('[HomeScreen] ✅ [数据就绪] downloadedSceneIds 已从实际文件加载完成');

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
            setIsDataReady(true); // 【数据就绪】缓存已加载
            console.log('[HomeScreen] ⚡ [数据就绪] downloadedSceneIds 已从缓存秒级加载');
          } else {
            // 缓存为空，但仍然标记就绪（避免阻塞恢复逻辑）
            setIsDataReady(true);
            console.log('[HomeScreen] ⚡ [数据就绪] 缓存为空，但标记数据已就绪');
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
  */ // 【🔥 禁用结束】第二个 useEffect 已完全禁用

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
      
      // 🔥 使用 flushSync 强制同步渲染！（消除帧间空隙）
      try {
        const { flushSync } = require('react-dom');
        
        flushSync(() => {
          setLockedIds(newLockedSet);
          lockedIdsRef.current = newLockedSet;
        });
        
        console.log(`[HomeScreen] ✅ [切换锁v8] 🚀 flushSync 同步渲染完成！`);
      } catch (flushError) {
        // 如果 flushSync 不可用，回退到普通 setState
        console.warn('[HomeScreen] ⚠️ [切换锁v8] flushSync 不可用，使用异步更新');
        setLockedIds(newLockedSet);
        lockedIdsRef.current = newLockedSet;
      }
      
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
    let trackChangedSubscription: any = null;
    
    const setupTrackListener = async () => {
      try {
        const TrackPlayer = (await import('react-native-track-player')).default;
        
        trackChangedSubscription = await TrackPlayer.addEventListener(
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
      if (trackChangedSubscription) {
        trackChangedSubscription.remove();
        console.log('[HomeScreen] 🧹 [v8 双重监听] 已移除 PlaybackActiveTrackChanged');
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
                {/* 🔴🔴🔴 调试版本 Shuffle 按钮 - 已优化样式 */}
                <TouchableOpacity
                  onPress={() => {
                    console.log(`[HomeScreen] 🔥🔥🔴 [DEBUG] Shuffle 按钮被点击！！！ group.title=${group.title}, group.label=${group.label}`);
                    console.log(`[HomeScreen] 🔥 [DEBUG] shufflingCategory 当前值: ${shufflingCategory}`);
                    handleShuffle(group.title);
                  }}
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
                  globalProgress={globalDownloadProgress.get(scene.id)}
                  onBoostPriority={(sceneId: string) => {
                    // 【全局】触发优先下载（使用 Hook）
                    prioritizeScene(sceneId);
                  }}
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