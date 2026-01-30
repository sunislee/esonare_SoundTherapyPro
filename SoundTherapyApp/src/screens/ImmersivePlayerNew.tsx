import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, ImageBackground, Image, TouchableOpacity, SafeAreaView, Animated, Platform, Dimensions, Easing, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AmbientPickerSheet } from '../components/AmbientPickerSheet';
import { BlurView } from '@react-native-community/blur';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- 动画按钮组件 ---
const AnimatedIndicator = ({ 
  isActive, 
  iconName, 
  onPress 
}: { 
  isActive: boolean, 
  iconName: string, 
  onPress: () => void 
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View 
        style={[
          styles.indicator, 
          isActive && styles.indicatorActive,
          isActive && styles.activeGlow,
          { transform: [{ scale }] }
        ]}
      >
        <Icon 
          name={iconName} 
          size={isActive ? 18 : 14} 
          color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'} 
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// 定义四大核心分类
const MAIN_CATEGORIES = ['Nature', 'Healing', 'Brainwave', 'Life'];

// 默认兜底场景
const DEFAULT_SCENE = SCENES[0];

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;

// --- 性能优化：背景渲染层 (Memoized) ---
const BackgroundLayer = memo(({ 
  activeScene, 
  prevScene, 
  bottomBgOpacity 
}: { 
  activeScene: Scene, 
  prevScene: Scene, 
  bottomBgOpacity: Animated.Value 
}) => {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]}>
      {/* 底层垫底图：带缓慢淡出效果 */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bottomBgOpacity }]}>
        <Image 
          source={prevScene.backgroundSource}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fadeDuration={0}
          // @ts-ignore - 强制硬件加速优先级
          priority="high"
        />
      </Animated.View>
      
      {/* 顶层前景图：0ms 强制硬件加速，禁用淡入淡出 */}
      <Image 
        key={`bg-top-${activeScene.id}`}
        source={activeScene.backgroundSource}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        fadeDuration={0}
        // @ts-ignore - 强制硬件加速优先级
        priority="high"
      />

      <View 
        style={[
          StyleSheet.absoluteFill, 
          { backgroundColor: 'rgba(0,0,0,0.3)' }
        ]} 
        pointerEvents="none"
      />
    </View>
  );
});

const ImmersivePlayerNew = () => {
  const navigation = useNavigation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const insets = useSafeAreaInsets();
  const { currentScene, isPlaying, togglePlayback, setAmbient } = useAudio();
  const pagerRef = useRef<PagerView>(null);

  // 第一步：引入‘断路器’状态
  const [isFrozen, setIsFrozen] = useState(false);

  // 第二步：渲染拦截 (最关键)
  if (isFrozen) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  // 1. 从路由参数中获取选中的场景
  const selectedScene = useMemo(() => {
    const sceneId = route.params?.sceneId;
    if (sceneId) {
      return SCENES.find(s => s.id === sceneId) || null;
    }
    return null;
  }, [route.params?.sceneId]);

  // 核心动画绑定：使用 Animated.Value 绑定 ViewPager 的滑动偏移量
  const scrollOffset = useRef(new Animated.Value(0)).current;
  const position = useRef(new Animated.Value(0)).current;
  
  // 最终的滑动进度 (用于背景插值)
  const scrollProgress = useRef(Animated.add(position, scrollOffset)).current;
  
  const [ambientSheetVisible, setAmbientSheetVisible] = useState(false); // Default Hidden
  const [currentAmbient, setCurrentAmbient] = useState<'none' | 'rain' | 'fire'>('none');

  // 播放按钮缩放动画
  const playBtnScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(playBtnScale, {
      toValue: 0.92,
      duration: 150,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(playBtnScale, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  };

  // --- 索引与背景逻辑 (实时映射 + 边界保护) ---
  // 根据当前场景或选定场景确定初始页面索引
  const initialPageIndex = useMemo(() => {
    const target = selectedScene || currentScene;
    if (!target) return 0;
    const catIndex = MAIN_CATEGORIES.indexOf(target.category);
    return catIndex >= 0 ? catIndex : 0;
  }, [selectedScene]);

  const [activeIndex, setActiveIndex] = useState(initialPageIndex);
  const [prevIndex, setPrevIndex] = useState(initialPageIndex);
  
  // 底层背景透明度动画
  const bottomBgOpacity = useRef(new Animated.Value(1)).current;

  // 1. 拦截退出瞬间的 UI 更新：使用 useRef 物理标记
  const isExiting = useRef(false);

  // 监听索引变化，同步记录上一个索引作为垫底
  useEffect(() => {
    if (isExiting.current) return;
    // 1. 开始切换时，让底层图片稍微变暗，腾出视觉空间给顶层淡入
    Animated.timing(bottomBgOpacity, {
      toValue: 0.6,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      // 2. 800ms 后，顶层淡入肯定结束了，此时更新底层索引并恢复透明度
      InteractionManager.runAfterInteractions(() => {
        setPrevIndex(activeIndex);
        Animated.timing(bottomBgOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }).start();
      });
    }, 800); // 延长冻结时间到 800ms

    return () => clearTimeout(timer);
  }, [activeIndex]);

  // 2. 过滤出每个分类的代表性场景 (优先使用选中的场景)
  const displayScenes = useMemo(() => {
    return MAIN_CATEGORIES.map(cat => {
      // 场景优先级：1. 路由传入的场景 2. 当前正在播放的场景 3. 分类默认场景
      const targetScene = selectedScene || currentScene;
      
      if (targetScene && targetScene.category === cat) {
        return targetScene;
      }
      // 否则寻找该分类下的第一个场景
      return SCENES.find(s => s.category === cat) || DEFAULT_SCENE;
    });
  }, [selectedScene, currentScene?.id]);

  // 挂载时设置初始索引
  useEffect(() => {
    position.setValue(initialPageIndex);
    scrollOffset.setValue(0);

    return () => {
      // 延时静音：人都滑出页面了，再让音频静悄悄地在后台关掉
      setTimeout(() => {
        // AudioService.stop();
      }, 800);

      // 组件销毁时强制清理所有动画，防止内存泄漏和后台渲染开销
      bottomBgOpacity.stopAnimation();
      playBtnScale.stopAnimation();
      position.stopAnimation();
      scrollOffset.stopAnimation();
    };
  }, []);

   // 3. 页面进入时，如果传入了场景且当前未播放该场景，自动切换
   useEffect(() => {
     // 性能降级保护：如果正在退出或已初始化且场景匹配，严禁在进入动画期间触发任何音频库逻辑
     if (isFrozen || isExiting.current || (AudioService.isPlayerInitialized() && selectedScene?.id === currentScene?.id)) {
       return;
     }

     const task = InteractionManager.runAfterInteractions(() => {
       if (isFrozen || isExiting.current) return;
       if (selectedScene && selectedScene.id !== currentScene?.id) {
         AudioService.switchSoundscape(selectedScene);
       }
     });
     return () => task.cancel();
   }, [selectedScene]);

   const getSafeIndex = (index: number) => Math.max(0, Math.min(index, displayScenes.length - 1));

   const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   const handlePageSelected = (e: any) => {
     if (isFrozen || isExiting.current) return;
     const rawIndex = e.nativeEvent.position;
     const index = getSafeIndex(rawIndex);
     
     if (debounceTimer.current) clearTimeout(debounceTimer.current);
     // 增加‘稳定期’：使用 400ms 延迟，确保 PagerView 完成物理滑动、动画彻底停稳
     debounceTimer.current = setTimeout(() => {
        InteractionManager.runAfterInteractions(() => {
          if (isFrozen || isExiting.current) return;
          const safeIdx = Math.max(0, Math.min(index, displayScenes.length - 1));

          // 停稳后才同步一次背景索引，减少滑动中的渲染压力
          setActiveIndex(safeIdx);

          const targetScene = displayScenes[safeIdx] || DEFAULT_SCENE;
          if (targetScene && targetScene.id !== currentScene?.id) {
            AudioService.switchSoundscape(targetScene);
          }
          
          // 持久化记录：存储最后查看的场景 ID
          if (targetScene) {
            AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', targetScene.id).catch(() => {});
          }
        });
     }, 400);
   };

   const handleToggle = async () => {
    if (isFrozen) return;
    if (currentScene) {
      await togglePlayback(currentScene);
    }
  };

  const handleIndicatorPress = (targetIndex: number) => {
    pagerRef.current?.setPage(targetIndex);
  };

  const handleBack = () => {
    // 第一步：同步执行 setIsFrozen(true) 开启断路器
    setIsFrozen(true);

    // 拦截退出瞬间的 UI 更新
    isExiting.current = true;

    // 立即触发返回导航 (最高优先级)
    navigation.goBack();
  };

  const toggleAmbientSheet = () => {
    setAmbientSheetVisible(!ambientSheetVisible);
  };

   const handleAmbientSelect = (type: 'none' | 'rain' | 'fire') => {
     setCurrentAmbient(type);
     if (type === 'none') {
       setAmbient(null);
     } else {
       const soundId = type === 'rain' ? 'healing_rain' : 'life_fire_pure';
       setAmbient(soundId);
     }
   };

  const renderBackground = () => {
     const safeActiveIdx = Math.max(0, Math.min(activeIndex, displayScenes.length - 1));
     const safePrevIdx = Math.max(0, Math.min(prevIndex, displayScenes.length - 1));
     
     const activeScene = displayScenes[safeActiveIdx] || DEFAULT_SCENE;
     const prevScene = displayScenes[safePrevIdx] || DEFAULT_SCENE;

     return (
       <BackgroundLayer 
         activeScene={activeScene}
         prevScene={prevScene}
         bottomBgOpacity={bottomBgOpacity}
       />
     );
   };
   // -----------------------

  const renderHeader = () => {
    // 冗余函数，逻辑已迁移至主渲染块
    return null;
  };

  const renderScenePage = (scene: Scene, index: number) => {
    return (
      <View key={scene.id} style={[styles.page, { backgroundColor: 'transparent' }]}>
        <SafeAreaView style={[styles.overlay, { backgroundColor: 'transparent' }]}>
          {/* 占位符，保持布局一致性 */}
          <View style={styles.headerPlaceholder} />

          <View style={styles.controlCenter}>
            <Animated.View style={{ transform: [{ scale: playBtnScale }] }}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={handleToggle}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
              >
                {isPlaying && currentScene?.id === scene.id ? (
                  <View style={styles.pauseIconContainer}>
                    <View style={styles.pauseBar} />
                    <View style={styles.pauseBar} />
                  </View>
                ) : (
                  <View style={styles.playIcon} />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* 底部占位，防止内容被固定的 footer 遮挡 */}
          <View style={{ height: 160 }} />
        </SafeAreaView>
      </View>
    );
  };

  const renderFixedFooter = () => {
    return (
      <View style={styles.fixedFooterContainer}>
        <BlurView
          style={styles.footerBlur}
          blurType="dark"
          blurAmount={20}
          reducedTransparencyFallbackColor="black"
        />
        <View style={styles.footerContent}>
          <View style={styles.indicatorContainer}>
            {MAIN_CATEGORIES.map((cat, index) => (
              <AnimatedIndicator
                key={cat}
                isActive={activeIndex === index}
                iconName={
                  cat === 'Nature' ? 'leaf-outline' :
                  cat === 'Healing' ? 'heart-outline' :
                  cat === 'Brainwave' ? 'pulse-outline' : 'cafe-outline'
                }
                onPress={() => handleIndicatorPress(index)}
              />
            ))}
          </View>
          <Text style={styles.statusText}>
            {isPlaying ? '正在疗愈中...' : '已暂停'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isFrozen ? (
        <View style={{ flex: 1, backgroundColor: '#000' }} />
      ) : (
        <>
          {renderBackground()}

          <AnimatedPagerView 
            ref={pagerRef}
            style={[styles.container, { backgroundColor: 'transparent' }]} 
            initialPage={initialPageIndex}
            onPageSelected={handlePageSelected}
            scrollEnabled={!isFrozen}
            onPageScroll={Animated.event(
              [
                {
                  nativeEvent: {
                    offset: scrollOffset,
                    position: position,
                  },
                },
              ],
              { 
                useNativeDriver: true,
                listener: (e: any) => {
                  if (isFrozen || isExiting.current) return;
                  // 拦截多余渲染：在滑动过程中完全禁用背景索引的同步更新
                  // 只有在 handlePageSelected 停稳后，才通过其逻辑进行必要的更新（如果需要）
                  // 目前逻辑下，背景层将通过 memo 化的渲染保证性能
                }
              }
            )}
          >
            {displayScenes.map((scene, index) => renderScenePage(scene, index))}
          </AnimatedPagerView>

          {renderFixedFooter()}

          {/* 正式大标题：保持 zIndex: 99999 活命层级 */}
          <View style={{ 
            position: 'absolute', 
            top: 80, 
            left: 0, 
            right: 0, 
            zIndex: 99999, 
            elevation: 100,
            alignItems: 'center',
            pointerEvents: 'none' // 点击穿透，不影响下方按钮
          }}> 
            {MAIN_CATEGORIES.map((category, rawIndex) => {
              // 索引越界硬保护
              const index = Math.max(0, Math.min(rawIndex, displayScenes.length - 1));
              const activeScene = displayScenes[index] || DEFAULT_SCENE;
              // 标题滑动渐变：200ms 对应的滑动区间大约是 0.5 左右
              const opacity = scrollProgress.interpolate({
                inputRange: [index - 0.5, index, index + 0.5],
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              });

              // Floating Animation: translateY 从 10 到 0 再到 10
              const translateY = scrollProgress.interpolate({
                inputRange: [index - 0.5, index, index + 0.5],
                outputRange: [10, 0, 10],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View 
                  key={`final-title-${category}`}
                  style={{ 
                    position: 'absolute', 
                    alignItems: 'center', 
                    opacity,
                    transform: [{ translateY }]
                  }}
                >
                  {/* 主标题：24px 加粗 */}
                  <Text style={{ 
                    color: 'white', 
                    fontSize: 24, 
                    fontWeight: 'bold',
                    letterSpacing: 2,
                    textShadowColor: 'rgba(0,0,0,0.5)', 
                    textShadowOffset: {width: 0, height: 2}, 
                    textShadowRadius: 4 
                  }}> 
                    {category} 
                  </Text> 
                  {/* 副标题：16px, 0.75 透明度 */}
                  <Text style={{ 
                    color: 'white', 
                    fontSize: 16, 
                    marginTop: 6,
                    opacity: 0.75,
                    fontWeight: '500',
                    textShadowColor: 'rgba(0,0,0,0.5)', 
                    textShadowOffset: {width: 0, height: 2}, 
                    textShadowRadius: 4 
                  }}>
                    {activeScene?.title || ''}
                  </Text>
                </Animated.View>
              );
            })}
          </View>

          {/* 顶部固定按钮层 */}
          <View style={{
            position: 'absolute',
            top: insets.top,
            left: 0,
            right: 0,
            height: 60,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            zIndex: 100000, // 按钮层级更高
          }}>
            <TouchableOpacity 
              onPress={() => { 
                // 1. 立即触发原生导航返回，抢占主线程动画优先级 
                navigation.goBack(); 
                // 2. 彻底切断任何可能在退出时触发的 UI 更新 
                setIsFrozen(true); 
              }} 
              style={{ padding: 8 }}
            >
              <Icon name="chevron-down" size={32} color="#fff" />
            </TouchableOpacity>
            
            {/* 混音实验室入口临时屏蔽：逻辑清理中 */}
            {/* 
            <TouchableOpacity 
              onPress={toggleAmbientSheet}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.15)',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
              }}
            >
              <Icon name="options-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', marginLeft: 6, fontSize: 13 }}>氛围点缀</Text>
            </TouchableOpacity>
            */}
          </View>

          <AmbientPickerSheet
            visible={ambientSheetVisible}
            currentAmbient={currentAmbient}
            currentSceneId={currentScene?.id || ''}
            onClose={() => setAmbientSheetVisible(false)}
            onSelect={handleAmbientSelect}
            onRestoreMix={(mix) => {
              handleAmbientSelect(mix.ambientType as any);
            }}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  page: { width: SCREEN_WIDTH, flex: 1 },
  absolute: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  headerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    height: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  headerPlaceholder: {
    height: 140,
    width: '100%',
  },
  titleArea: {
    flex: 2,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
    zIndex: 10000, // 比 wrapper 更高
  },
  absoluteHeader: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 5,
    zIndex: 10001,
  },
  categoryTitle: { 
    color: '#FFFFFF', // 暴力纯白
    fontSize: 24, 
    fontWeight: '600', 
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)', // 增加投影防止背景干扰
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  sceneTitle: { 
    color: '#FFFFFF', // 暴力纯白
    fontSize: 14, 
    marginTop: 4, 
    letterSpacing: 1,
    textAlign: 'center',
    opacity: 0.8, // 稍微降点透明度区分主次，但颜色还是纯白
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  controlCenter: { justifyContent: 'center', alignItems: 'center', width: '100%' },
  playButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  playIcon: {
    width: 0, height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 30, borderRightWidth: 0,
    borderBottomWidth: 20, borderTopWidth: 20,
    borderLeftColor: '#fff', borderRightColor: 'transparent',
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    marginLeft: 8,
  },
  pauseIconContainer: { flexDirection: 'row', justifyContent: 'space-between', width: 24 },
  pauseBar: { width: 8, height: 32, backgroundColor: '#fff', borderRadius: 4 },
  fixedFooterContainer: { 
    position: 'absolute',
    bottom: 50, 
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.9, 
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 100001,
  },
  footerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  footerContent: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  indicatorContainer: { flexDirection: 'row', marginBottom: 15, alignItems: 'center' },
  indicator: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    marginHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  indicatorActive: { 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderColor: 'rgba(255,255,255,0.5)',
    transform: [{ scale: 1.1 }],
  },
  activeGlow: {
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  statusText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  ambientTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ambientTriggerText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
});


export default ImmersivePlayerNew;