import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  StatusBar,
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
  const { activeSmallSceneIds, toggleAmbience } = useAudio();
  
  const [isLoading, setIsLoading] = useState(true);
  
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;

  const sceneId = route.params?.sceneId || 'nature_deep_sea';
  const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];

  // 占位背景色：深海给 #001a33，森林给 #1a2e1a，其他默认深灰
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
    // 初始进入逻辑 - 优化：不等待音频初始化即渲染页面架构
    const initPage = async () => {
      // 内容稍后浮现
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setIsLoading(true);
      const currentPlayingId = AudioService.getCurrentScene()?.id;
      
      // 保存最后播放的场景 ID，用于首页高亮记忆
      AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', scene.id).catch(() => {});

      if (currentPlayingId !== scene.id) {
        console.log(`[BreathDetail] Switching to scene ${scene.id}.`);
        await AudioService.switchSoundscape(scene);
      }
      
      setIsLoading(false);
    };

    initPage();

    return () => {
      // 状态同步检查：退出页面时立即停止所有互动音效
      console.log('[BreathDetail] Stopping all ambient sounds on exit.');
      AudioService.stopAllAmbient();
    };
  }, [scene.id]); // Add scene.id to dependency array to handle navigation between breath scenes

  const togglePlayback = async () => {
    if (isPlaying) {
      await AudioService.pause();
    } else {
      await AudioService.play();
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: placeholderColor }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* 背景图片层 */}
      <Animated.Image 
        source={scene.backgroundSource} 
        style={[StyleSheet.absoluteFill, { opacity: bgFadeAnim }]}
        resizeMode="cover"
        onLoad={() => {
          console.log(`[BreathDetail] Image Loaded: ${scene.id}`);
          Animated.timing(bgFadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }}
      />
      
      {/* 背景装饰/遮罩 - 统一为 0.3 透明度 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />

      <View style={[styles.mainContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
        {/* Header - 统一使用 chevron-down */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Icon name="chevron-down" size={32} color="#FFF" />
          </TouchableOpacity>
        </View>

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
                  onPress={() => toggleAmbience(ambient, 'Floating Icon')}
                />
              );
            })}
          </View>

          {/* 底部控制区 - 统一布局：标题 + 播放按钮 */}
          <View style={styles.bottomSection}>
            <Text style={styles.sceneTitle}>
              {t(`scenes.${scene.id}.title`)}
            </Text>
            
            <TouchableOpacity 
              style={styles.playButton} 
              onPress={togglePlayback}
              activeOpacity={0.8}
            >
              <Icon 
                name={isPlaying ? "pause" : "play"} 
                size={40} 
                color="#FFF" 
                style={!isPlaying && { marginLeft: 5 }}
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
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 30,
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
