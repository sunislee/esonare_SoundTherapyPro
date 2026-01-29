import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, Image, TouchableOpacity, SafeAreaView, Animated, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AmbientPickerSheet } from '../components/AmbientPickerSheet';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 定义四大核心分类
const MAIN_CATEGORIES = ['Nature', 'Healing', 'Brainwave', 'Life'];

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

  // --- Cross-fade 背景逻辑 ---
  const [bgImages, setBgImages] = useState({
    current: selectedScene?.backgroundSource || SCENES[0].backgroundSource,
    next: null as any,
  });
  const bgFadeAnim = useRef(new Animated.Value(1)).current; // 1 = 显示 current, 0 = 显示 next
  const lastSceneId = useRef(selectedScene?.id);

  // 监听场景切换，触发 Cross-fade
  useEffect(() => {
    const target = selectedScene || currentScene;
    if (target && target.id !== lastSceneId.current) {
      // 触发动画
      setBgImages(prev => ({ ...prev, next: target.backgroundSource }));
      
      // 开启 300ms 过渡
      Animated.timing(bgFadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // 动画结束，交换角色
        setBgImages({
          current: target.backgroundSource,
          next: null,
        });
        bgFadeAnim.setValue(1);
      });
      
      lastSceneId.current = target.id;
    }
  }, [selectedScene, currentScene]);
  // -----------------------

  // 2. 过滤出每个分类的代表性场景 (优先使用选中的场景)
  const displayScenes = useMemo(() => {
    return MAIN_CATEGORIES.map(cat => {
      // 如果选中的场景属于这个分类，优先展示选中的场景
      if (selectedScene && selectedScene.category === cat) {
        return selectedScene;
      }
      // 否则寻找该分类下的第一个场景
      return SCENES.find(s => s.category === cat) || SCENES[0];
    });
  }, [selectedScene]);

  // 根据当前场景或选定场景确定初始页面索引
  const initialPageIndex = useMemo(() => {
    const target = selectedScene || currentScene;
    if (!target) return 0;
    const catIndex = MAIN_CATEGORIES.indexOf(target.category);
    return catIndex >= 0 ? catIndex : 0;
  }, [selectedScene]); // 移除 currentScene 依赖，防止播放过程中意外跳页

  // 3. 页面进入时，如果传入了场景且当前未播放该场景，自动切换
  useEffect(() => {
    if (selectedScene && selectedScene.id !== currentScene?.id) {
      AudioService.switchSoundscape(selectedScene);
    }
  }, [selectedScene]);

  // 挂载时根据初始页面设置动画值，防止首屏背景透明
  useEffect(() => {
    position.setValue(initialPageIndex);
    scrollOffset.setValue(0);
  }, []);

  const handlePageSelected = (e: any) => {
    const index = e.nativeEvent.position;
    
    // 切换音频场景逻辑
    const targetScene = displayScenes[index];
    if (targetScene && targetScene.id !== currentScene?.id) {
      AudioService.switchSoundscape(targetScene);
    }
  };

  const handleToggle = async () => {
    if (currentScene) {
      await togglePlayback(currentScene);
    }
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
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]}>
        {/* 背景 1: 当前背景 */}
        <Animated.Image 
          source={bgImages.current}
          style={[
            StyleSheet.absoluteFill,
            { opacity: bgFadeAnim }
          ]}
          resizeMode="cover"
        />

        {/* 背景 2: 下一个背景 (淡入) */}
        {bgImages.next && (
          <Animated.Image 
            source={bgImages.next}
            style={[
              StyleSheet.absoluteFill,
              { 
                opacity: bgFadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0]
                }) 
              }
            ]}
            resizeMode="cover"
          />
        )}

        {/* 亮度提升层: 0.1 透明度的白色遮罩 */}
        <View 
          style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: 'rgba(255,255,255,0.1)' }
          ]} 
          pointerEvents="none"
        />

        {/* 顶层深色氛围遮罩 - 降低不透明度以提升亮度 */}
        <View 
          style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: 'rgba(0,0,0,0.2)' }
          ]} 
          pointerEvents="none"
        />
      </View>
    );
  };

  const renderHeader = () => {
    // 冗余函数，逻辑已迁移至主渲染块
    return null;
  };

  const renderScenePage = (scene: Scene, index: number) => {
    return (
      <View key={scene.id} style={styles.page}>
        <SafeAreaView style={styles.overlay}>
          {/* 占位符，保持布局一致性 */}
          <View style={styles.headerPlaceholder} />

          <View style={styles.controlCenter}>
            <TouchableOpacity 
              style={styles.playButton}
              onPress={handleToggle}
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
          </View>

          <View style={styles.footer}>
            <View style={styles.indicatorContainer}>
              {MAIN_CATEGORIES.map((cat, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.indicator, 
                    index === i && styles.indicatorActive,
                    index === i && styles.activeGlow
                  ]} 
                >
                  <Icon 
                    name={
                      cat === 'Nature' ? 'moon-outline' : 
                      cat === 'Healing' ? 'leaf-outline' : 
                      cat === 'Brainwave' ? 'book-outline' : 'musical-notes-outline'
                    } 
                    size={index === i ? 18 : 14} 
                    color={index === i ? '#fff' : 'rgba(255,255,255,0.5)'} 
                  />
                </View>
              ))}
            </View>
            <Text style={styles.statusText}>左右滑动切换场景：Sleep, Relax, Study, Party</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderBackground()}

      <AnimatedPagerView 
        ref={pagerRef}
        style={styles.container} 
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
          { useNativeDriver: true }
        )}
      >
        {displayScenes.map((scene, index) => renderScenePage(scene, index))}
      </AnimatedPagerView>

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
        {MAIN_CATEGORIES.map((category, index) => {
          const activeScene = displayScenes[index];
          // 标题滑动渐变：200ms 对应的滑动区间大约是 0.5 左右
          const opacity = scrollProgress.interpolate({
            inputRange: [index - 0.5, index, index + 0.5],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View 
              key={`final-title-${category}`}
              style={{ 
                position: 'absolute', 
                alignItems: 'center', 
                opacity 
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
  footer: { marginBottom: 50, alignItems: 'center' },
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