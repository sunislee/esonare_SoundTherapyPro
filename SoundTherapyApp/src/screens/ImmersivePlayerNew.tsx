import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, Image, TouchableOpacity, SafeAreaView, Animated, Platform, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
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

const ImmersivePlayerNew = () => {
  const navigation = useNavigation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const insets = useSafeAreaInsets();
  const { currentScene, isPlaying, togglePlayback } = useAudio();
  const pagerRef = useRef<PagerView>(null);

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

  // 监听索引变化，同步记录上一个索引作为垫底
  useEffect(() => {
    // 1. 开始切换时，让底层图片稍微变暗，腾出视觉空间给顶层淡入
    Animated.timing(bottomBgOpacity, {
      toValue: 0.6,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      // 2. 800ms 后，顶层淡入肯定结束了，此时更新底层索引并恢复透明度
      setPrevIndex(activeIndex);
      Animated.timing(bottomBgOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();
    }, 800); // 延长冻结时间到 800ms

    return () => clearTimeout(timer);
  }, [activeIndex]);

  // 2. 过滤出每个分类的代表性场景 (优先使用选中的场景)
  const displayScenes = useMemo(() => {
    return MAIN_CATEGORIES.map(cat => {
      // 如果选中的场景属于这个分类，优先展示选中的场景
      if (selectedScene && selectedScene.category === cat) {
        return selectedScene;
      }
      // 否则寻找该分类下的第一个场景
      return SCENES.find(s => s.category === cat) || DEFAULT_SCENE;
    });
  }, [selectedScene]);

  // 挂载时设置初始索引
  useEffect(() => {
    position.setValue(initialPageIndex);
    scrollOffset.setValue(0);
  }, []);

   // 3. 页面进入时，如果传入了场景且当前未播放该场景，自动切换
   useEffect(() => {
     if (selectedScene && selectedScene.id !== currentScene?.id) {
       AudioService.switchSoundscape(selectedScene);
     }
   }, [selectedScene]);

   const getSafeIndex = (index: number) => Math.max(0, Math.min(index, displayScenes.length - 1));

   const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   const handlePageSelected = (e: any) => {
     const rawIndex = e.nativeEvent.position;
     const index = getSafeIndex(rawIndex);
     
     // setActiveIndex(index);
     
     if (debounceTimer.current) clearTimeout(debounceTimer.current);
     debounceTimer.current = setTimeout(() => {
        const safeIdx = Math.max(0, Math.min(index, displayScenes.length - 1));
        const targetScene = displayScenes[safeIdx] || DEFAULT_SCENE;
        if (targetScene && targetScene.id !== currentScene?.id) {
         AudioService.switchSoundscape(targetScene);
       }
     }, 150);
   };

   const handleToggle = async () => {
    if (currentScene) {
      await togglePlayback(currentScene);
    }
  };

  const handleIndicatorPress = (targetIndex: number) => {
    pagerRef.current?.setPage(targetIndex);
  };

  const toggleAmbientSheet = () => {
    setAmbientSheetVisible(!ambientSheetVisible);
  };

   const handleAmbientSelect = (type: 'none' | 'rain' | 'fire') => {
     setCurrentAmbient(type);
     if (type === 'none') {
       AudioService.setAmbient(null);
     } else {
       const soundId = type === 'rain' ? 'healing_rain' : 'life_fire_pure';
       AudioService.setAmbient(soundId);
     }
   };

   const renderBackground = () => {
     const safeActiveIdx = Math.max(0, Math.min(activeIndex, displayScenes.length - 1));
     const safePrevIdx = Math.max(0, Math.min(prevIndex, displayScenes.length - 1));
     
     const activeScene = displayScenes[safeActiveIdx] || DEFAULT_SCENE;
     const prevScene = displayScenes[safePrevIdx] || DEFAULT_SCENE;

     return (
       <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]}>
         {/* 底层垫底图：带缓慢淡出效果 */}
         <Animated.View style={[StyleSheet.absoluteFill, { opacity: bottomBgOpacity }]}>
           <Image 
             source={prevScene.backgroundSource}
             style={StyleSheet.absoluteFill}
             resizeMode="cover"
           />
         </Animated.View>
         
         {/* 顶层前景图：300ms 快速淡入遮盖 */}
         <Image 
           key={`bg-top-${activeScene.id}`}
           source={activeScene.backgroundSource}
           style={StyleSheet.absoluteFill}
           resizeMode="cover"
           fadeDuration={300} // 缩短淡入时间到 300ms
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
          blurAmount={25}
          reducedTransparencyFallbackColor="black"
        />
        <View style={styles.footerContent}>
          <View style={styles.indicatorContainer}>
            {MAIN_CATEGORIES.map((cat, i) => (
              <AnimatedIndicator
                key={i}
                isActive={activeIndex === i}
                iconName={
                  cat === 'Nature' ? 'moon-outline' : 
                  cat === 'Healing' ? 'leaf-outline' : 
                  cat === 'Brainwave' ? 'book-outline' : 'musical-notes-outline'
                }
                onPress={() => handleIndicatorPress(i)}
              />
            ))}
          </View>
          <Text style={styles.statusText}>左右滑动切换场景：Sleep, Relax, Study, Party</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderBackground()}

      <AnimatedPagerView 
        ref={pagerRef}
        style={[styles.container, { backgroundColor: 'transparent' }]} 
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
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
              const { position: pos, offset: off } = e.nativeEvent;
              // 计算当前最接近的页面索引
              const currentIdx = Math.round(pos + off);
              const safeIdx = Math.max(0, Math.min(currentIdx, displayScenes.length - 1));
              
              // 实时更新背景索引 (JS 线程同步更新)
              setActiveIndex(prev => {
                if (prev !== safeIdx) {
                  return safeIdx;
                }
                return prev;
              });
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Icon name="chevron-down" size={32} color="#fff" />
        </TouchableOpacity>
        
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