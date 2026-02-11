import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  Image,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Scene, SCENES, SMALL_SCENE_IDS } from '../constants/scenes';
import { useAudio } from '../context/AudioContext';
import AnimatedFloatingButton from '../components/AnimatedFloatingButton';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';

const { width, height } = Dimensions.get('window');

const events = [
  Event.PlaybackQueueEnded,
  Event.PlaybackTrackChanged,
  Event.PlaybackState,
];

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;

const ImmersivePlayerNew: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isPlaying } = usePlayerState();

  const [isLoading, setIsLoading] = useState(false);
  const bgFadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;

  const {
    currentBaseSceneId,
    activeSmallSceneIds,
    toggleAmbience,
  } = useAudio();

  // 获取目标场景
  const targetSceneId = route.params?.sceneId || currentBaseSceneId || SCENES[0].id;
  const targetScene = useMemo(() => 
    SCENES.find(s => s.id === targetSceneId) || SCENES[0]
  , [targetSceneId]);

  // 占位背景色：深海给 #001a33，森林给 #1a2e1a，其他默认深灰
  const placeholderColor = useMemo(() => {
    if (targetScene.id.includes('ocean') || targetScene.id.includes('deep_sea')) return '#001a33';
    if (targetScene.id.includes('forest')) return '#1a2e1a';
    return '#121212';
  }, [targetScene.id]);

  useTrackPlayerEvents(events, (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      console.log('[ImmersivePlayer] Playback queue ended');
    }
  });

  useEffect(() => {
    const initPage = async () => {
      // 内容同步浮现 (或稍晚)
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setIsLoading(true);
      const currentPlayingId = AudioService.getCurrentScene()?.id;
      
      if (currentPlayingId === targetScene.id) {
        console.log(`[ImmersivePlayer] Scene ${targetScene.id} is already playing.`);
      } else {
        console.log(`[ImmersivePlayer] Switching to scene ${targetScene.id}.`);
        await AudioService.switchSoundscape(targetScene);
      }
      
      setIsLoading(false);
    };

    initPage();

    return () => {
      // 状态同步检查：退出页面时立即停止所有互动音效
      console.log('[ImmersivePlayer] Stopping all ambient sounds on exit.');
      AudioService.stopAllAmbient();
    };
  }, [targetScene.id]);

  const togglePlayback = async () => {
    if (isPlaying) {
      await AudioService.pause();
    } else {
      await AudioService.play();
    }
  };

  // 获取所有基础场景（用于 Pager 轮播）
  const displayScenes = useMemo(() => {
    return SCENES.filter(s => s.isBaseScene);
  }, []);

  const renderScenePage = (scene: Scene, index: number) => {
    if (!scene) return <View key={`empty-${index}`} style={styles.page} />;

    // 固定的 8 个交互按钮数据
    const globalAmbientScenes = SMALL_SCENE_IDS.map(id =>
      SCENES.find(s => s.id === id)
    ).filter(Boolean) as Scene[];

    return (
      <View key={scene.id} style={[styles.page, { backgroundColor: placeholderColor }]}>
        {/* 背景图片层 - 替代 LottieView */}
        <Animated.Image 
          source={scene.backgroundSource} 
          style={[StyleSheet.absoluteFill, { opacity: bgFadeAnim }]}
          resizeMode="cover"
          onLoad={() => {
            console.log(`[ImmersivePlayer] Image Loaded: ${scene.id}`);
            Animated.timing(bgFadeAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }).start();
          }}
        />
        {/* 深色渐变遮罩层，提升 UI 层次感 */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />

        <View style={[styles.mainContainer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="chevron-down" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* 交互按钮容器 */}
          <View style={styles.floatingIconsContainer} pointerEvents="box-none">
            {globalAmbientScenes.map((ambient, idx) => {
              // 💡 重点：确保 isActive 直接读取自 Context 的 activeSmallSceneIds，实时响应 AudioService 状态变化
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
              {t(`scenes.${scene.id}.title`, { defaultValue: scene.title })}
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
        </View>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentFadeAnim }]}>
      {/* 实际项目中这里通常配合 PagerView 使用 */}
      {renderScenePage(targetScene, 0)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    width: width,
    height: height,
  },
  mainContainer: {
    flex: 1,
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
  floatingIconsContainer: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 20,
  },
  bottomSection: {
    paddingBottom: 60,
    alignItems: 'center',
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

export default ImmersivePlayerNew;