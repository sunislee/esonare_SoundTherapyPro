import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';
import { Scene } from '../constants/scenes';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const { width } = Dimensions.get('window');

const MiniPlayer = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Use navigation state to hide MiniPlayer on ImmersivePlayerScreen and BreathDetailScreen
  const isPlayerScreen = useNavigationState((state) => {
    if (!state) return false;
    const currentRoute = state.routes[state.index];
    return currentRoute.name === 'ImmersivePlayer' || currentRoute.name === 'BreathDetail';
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const widthAnim = useRef(new Animated.Value(1)).current; // 1 = expanded, 0 = collapsed
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const triggerHaptic = () => {
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };

  useEffect(() => {
    const sub = AudioService.addAudioStateListener(({ state }) => {
      const playing = state === State.Playing || state === State.Buffering;
      setIsPlaying(playing);
      
      const scene = AudioService.getCurrentScene();
      setCurrentScene(scene);
    });

    const scene = AudioService.getCurrentScene();
    if (scene) {
      setCurrentScene(scene);
      setIsPlaying(AudioService.getCurrentState() === State.Playing);
    }

    return () => {
      sub();
    };
  }, []);

  useEffect(() => {
    const shouldShow = !!currentScene && !isPlayerScreen;

    Animated.timing(fadeAnim, {
      toValue: shouldShow ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [currentScene, isPlayerScreen, fadeAnim]);

  const handlePlayPause = (e: any) => {
    e.stopPropagation();
    triggerHaptic();
    const targetState = isPlaying ? 'pause' : 'play';
    
    setImmediate(async () => {
      try {
        if (targetState === 'pause') {
          await AudioService.pause();
        } else {
          await AudioService.play();
        }
      } catch (error) {
        console.error('MiniPlayer toggle failed:', error);
      }
    });
  };

  const toggleCollapse = (e: any) => {
    e.stopPropagation();
    triggerHaptic();
    
    const targetValue = isCollapsed ? 1 : 0;
    setIsCollapsed(!isCollapsed);
    
    Animated.spring(widthAnim, {
      toValue: targetValue,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start();
  };

  const handlePress = () => {
    triggerHaptic();
    if (isCollapsed) {
      toggleCollapse({ stopPropagation: () => {} });
    } else if (currentScene) {
      if (currentScene.id.includes('breath')) {
        navigation.navigate('BreathDetail', { sceneId: currentScene.id });
      } else {
        navigation.navigate('ImmersivePlayer', { sceneId: currentScene.id });
      }
    }
  };

  const handleTouchStart = () => {
    setIsInteracting(true);
  };

  const handleTouchEnd = () => {
    setIsInteracting(false);
  };

  if (!currentScene || isPlayerScreen) return null;

  // Calculate dynamic styles
  const containerWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 340] // Collapsed width vs Expanded width (approx)
  });

  const contentOpacity = widthAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1]
  });
  
  const collapsedOpacity = widthAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0]
  });

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          bottom: insets.bottom + 16,
          alignSelf: 'center',
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0],
              }),
            },
            {
              scaleX: containerWidth.interpolate({
                inputRange: [60, 340],
                outputRange: [60 / 340, 1],
              })
            }
          ],
        },
      ]}
      pointerEvents={!currentScene || isPlayerScreen ? 'none' : 'auto'}
      onPress={handlePress}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      activeOpacity={1}
    >
      <Animated.View style={{ width: 340, height: '100%' }}>
        <View 
          style={[styles.content, isCollapsed && styles.collapsedContent]} 
        >
        {/* Collapsed View (Pill) */}
        <Animated.View style={[styles.collapsedView, { opacity: collapsedOpacity }]}>
           <TouchableOpacity 
             style={styles.miniPlayButton}
             onPress={handlePlayPause}
             hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
           >
             <Ionicons
               name={isPlaying ? 'pause' : 'play'}
               size={20}
               color="#FFF"
               style={styles.playIcon}
             />
           </TouchableOpacity>
        </Animated.View>

        {/* Expanded View */}
        <Animated.View style={[styles.expandedView, { opacity: contentOpacity }]}>
          {currentScene.backgroundSource ? (
            <Image 
              source={currentScene.backgroundSource} 
              style={styles.thumbnail} 
            />
          ) : (
            <View style={[styles.thumbnail, { backgroundColor: currentScene.primaryColor }]} />
          )}
          
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {currentScene ? t(`scenes.${currentScene.id}.title`) : ''}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>{t('miniPlayer.nowPlaying')}</Text>
          </View>

          <TouchableOpacity 
            style={styles.playButton} 
            onPress={handlePlayPause}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color="#FFF"
              style={styles.playIcon}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Collapse/Expand Toggle */}
        <TouchableOpacity 
          style={styles.collapseButton}
          onPress={toggleCollapse}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.collapseIcon}>{isCollapsed ? '⤢' : '—'}</Text>
        </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    height: 64,
    borderRadius: 32, // More rounded pill shape
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8, // Softer shadow
    elevation: 10,
    zIndex: 9999,
    backgroundColor: 'rgba(28, 30, 45, 0.95)', // Increased opacity for better visibility
    overflow: 'hidden', // Ensure content respects border radius
    borderWidth: 0, // Remove hard border
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  collapsedContent: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  expandedView: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 36,
  },
  collapsedView: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingRight: 36,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    overflow: 'hidden',
  },
  miniPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playIcon: {
    marginTop: 1,
    marginLeft: 2,
  },
  collapseButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
  },
  collapseIcon: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default MiniPlayer;
