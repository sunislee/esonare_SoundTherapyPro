import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  Dimensions,
  Platform,
  InteractionManager,
  Easing
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { usePlaybackState, State } from 'react-native-track-player';
import AudioService from '../services/AudioService';
import { RainDrop } from '../components/RainDrop';
import { SCENES } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useAudio } from '../context/AudioContext';

interface RainDropConfig {
  id: number;
  top: number;
  left: number;
  delay: number;
  length: number;
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width - 40;

  // 1. 抽离 SceneItem 组件以管理独立的动画状态，并使用 React.memo 确保渲染隔离
const SceneItem = React.memo(({ item, isPlaying, activeSoundId, togglePlayback, navigation, isFocused }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const breathAnim = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);
  const isThisPlaying = isPlaying && activeSoundId === item.id;

  // 合并缩放逻辑：将呼吸缩放与点击缩放合并，避免多个 transform scale 导致的渲染 Bug
  const combinedScale = Animated.multiply(
    scaleAnim,
    breathAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.05],
    })
  );

  // 提示性呼吸动画逻辑
  useEffect(() => {
    if (isFocused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 } // 呼吸两次
      ).start();
    } else {
      breathAnim.setValue(0);
    }
  }, [isFocused]);

  const handlePressIn = () => {
    setIsPressed(true);
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const focusGlowOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <View style={{ 
      width: ITEM_WIDTH,
      height: 110,
      marginBottom: 20,
      zIndex: isPressed || isFocused ? 10 : 1,
      position: 'relative',
    }}>
      <Animated.View 
        renderToHardwareTextureAndroid={true} // Android 硬件加速稳定渲染
        style={{ 
          width: ITEM_WIDTH,
          height: 110,
          transform: [{ scale: combinedScale }],
        }}
      >
        <View style={{
          width: ITEM_WIDTH,
          height: 110,
          overflow: 'hidden', // 强制剪裁：分离 transform 和 overflow，提高 Android 稳定性
          borderRadius: 20,
          backgroundColor: 'transparent',
        }}>
          {/* 呼吸提示光晕层 - 仅在 isFocused 时显示 */}
          {isFocused && (
            <Animated.View style={[
              {
                position: 'absolute',
                top: 5,     // 收紧边缘：确保上下各留出 5px 安全距离
                bottom: 5,
                left: 5,
                right: 5,
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 15, // 相应收紧圆角
                opacity: focusGlowOpacity,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.5)',
              }
            ]} />
          )}
          
          {/* 点击即时高亮反馈层 - 严格限制在当前 Item 内部并收紧边距 */}
          {isPressed && (
            <View style={[
              {
                position: 'absolute',
                top: 2,
                bottom: 2,
                left: 2,
                right: 2,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.3)',
                zIndex: 2
              }
            ]} />
          )}

          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.card, 
              isPressed && { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.1)' }
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            delayLongPress={150} // 增加长按判定延迟，减少滑动时的误触
            onPress={() => {
              // 物理延时：先完成缩放动画，给 UI 线程 50ms 喘息时间再触发跳转
              setTimeout(async () => {
                // 异步记录最后查看的场景
                await AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', item.id);
                navigation.navigate('ImmersivePlayer' as any, { sceneId: item.id });
              }, 50);
            }}
          >
            <View style={styles.cardInner}>
              <View style={[styles.cardBg, { backgroundColor: item.primaryColor }]} />
              <View style={styles.cardContent}>
                <View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSubtitle}>{item.category}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.cardPlayButton, isThisPlaying && styles.cardPauseButton]}
                  onPress={async () => {
                    await togglePlayback(item);
                  }}
                >
                  <Text style={[styles.cardPlayIcon, isThisPlaying && styles.cardPauseIcon]}>
                    {isThisPlaying ? '||' : '▶'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
});

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPlaying, activeSoundId, togglePlayback, syncNativeStatus } = useAudio();
  
  const [userName, setUserName] = useState('');
  const [slogan, setSlogan] = useState('');
  const greetingFadeAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);

  // 使用 useFocusEffect 确保每次回到首页时重新读取用户名
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        const loadInitialState = async () => {
          // 读取用户名
          const savedName = await AsyncStorage.getItem('USER_NAME');
          if (savedName) setUserName(savedName);
          else setUserName('');

          // 首页智能定位：如果没有音频播放，定位到上次观看的场景
          if (!AudioService.isPlaying()) {
            const lastId = await AsyncStorage.getItem('LAST_VIEWED_SCENE_ID');
            if (lastId) {
              const index = SCENES.findIndex(s => s.id === lastId);
              if (index !== -1) {
                // 稍微延迟等待 FlatList 渲染
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({
                    index,
                    animated: false,
                    viewPosition: 0.5,
                  });
                  setFocusedSceneId(lastId);
                  
                  // 3秒后移除提示状态
                  setTimeout(() => setFocusedSceneId(null), 3000);
                }, 400);
              }
            }
          }
        };
        loadInitialState();
      });
      return () => task.cancel();
    }, [])
  );

  useEffect(() => {
    const slogans = ['开启一段疗愈之旅', '愿你内心平静', '让世界安静一会儿'];
    const randomSlogan = slogans[Math.floor(Math.random() * slogans.length)];
    setSlogan(randomSlogan);

    // Fade in animation
    Animated.timing(greetingFadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const getGreetingParts = () => {
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour < 6) greeting = '凌晨好';
    else if (hour < 9) greeting = '早安';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 17) greeting = '下午好';
    else if (hour < 19) greeting = '傍晚好';
    else greeting = '晚上好';
    
    return { greeting, userName };
  };
  
  const [volume, _setVolume] = useState(0.5);
  const [rainDropConfigs, setRainDropConfigs] = useState<RainDropConfig[]>([]);

  // Cold start sync
  useEffect(() => {
    syncNativeStatus();
  }, [syncNativeStatus]);

  useEffect(() => {
    // Initialize RainDrops configuration
    const task = InteractionManager.runAfterInteractions(() => {
      const drops: RainDropConfig[] = [];
      for (let i = 0; i < 30; i++) {
        drops.push({
          id: i,
          top: Math.random() * -20,
          left: Math.random() * 100,
          delay: Math.random() * 2000,
          length: 15 + Math.random() * 15
        });
      }
      setRainDropConfigs(drops);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    // Initialize Audio
    const init = async () => {
      // setIsLoading(true); // User requested NO loading state
      try {
        await AudioService.setupPlayer();
        // 恢复默认加载但不自动播放：预加载第一个音源
        await AudioService.loadAudio(SCENES[0], false);
      } finally {
        // setIsLoading(false);
      }
    };
    init().catch(() => {});
  }, []);

  const renderSceneItem = useCallback(({ item }: { item: any }) => {
    return (
      <SceneItem 
        item={item} 
        isPlaying={isPlaying} 
        activeSoundId={activeSoundId} 
        togglePlayback={togglePlayback} 
        navigation={navigation} 
        isFocused={focusedSceneId === item.id}
      />
    );
  }, [isPlaying, activeSoundId, togglePlayback, navigation, focusedSceneId]);

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent={true} 
      />
      
      <View style={styles.gradientBackground}>
        {/* Rain Drops */}
        <View style={styles.rainContainer} pointerEvents="none">
          {rainDropConfigs.map((config) => (
            <RainDrop 
              key={config.id} 
              volume={volume} 
              rainDropConfig={config} 
            />
          ))}
        </View>
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Sound Therapy</Text>
            <Animated.View style={{ opacity: greetingFadeAnim }}>
              <Text style={styles.subtitle}>
                {getGreetingParts().greeting}
                {getGreetingParts().userName ? `，` : ''}
                <Text style={styles.userName}>{getGreetingParts().userName}</Text>
                {getGreetingParts().userName ? '。' : ''}{slogan}
              </Text>
            </Animated.View>
          </View>

          <FlatList
            ref={flatListRef}
            data={SCENES}
            renderItem={renderSceneItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={false}
            // 性能优化：限制窗口大小，防止后台渲染过多
            windowSize={5}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            removeClippedSubviews={false} // 关键修复：Android 上开启此项在复杂动画下极易导致渲染树异常闪退
            getItemLayout={(data, index) => ({
              length: 130, // card height 110 + margin 20
              offset: 130 * index,
              index,
            })}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080912' },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080912',
    overflow: 'hidden'
  },
  rainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
    zIndex: 999,
  },
  content: { 
    flex: 1, 
    position: 'relative',
    zIndex: 1,
    paddingTop: 10, // 减小整体内边距，改为由 header 精确控制
  },
  header: { 
    alignItems: 'center', 
    marginBottom: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 40, // iOS 考虑灵动岛/刘海高度
  },
  title: { fontSize: 32, color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 5 },
  userName: { fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)' },
  
  listContent: {
    paddingBottom: 120, // 增加底部间距以防被 TabBar 遮挡
    alignItems: 'center',
  },
  card: {
    width: ITEM_WIDTH,
    height: 110,
    borderRadius: 20,
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    // 移除 redundent overflow: 'hidden'，父容器已处理剪裁，减少 Android 渲染层级
  },
  cardInner: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
  },
  cardBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  cardTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  cardPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF', // Pure White as requested
    justifyContent: 'center',
    alignItems: 'center',
    // 性能优化：移除复杂阴影，改用简单的边框区分
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cardPlayIcon: {
    fontSize: 20,
    color: '#333',
    marginLeft: 2,
  },
  cardPauseButton: {
    backgroundColor: '#6C5DD3',
  },
  cardPauseIcon: {
    color: '#FFF',
    marginLeft: 0,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
