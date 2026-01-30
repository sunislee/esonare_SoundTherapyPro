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
import { RootStackParamList } from '../navigation/MainNavigator';
import AudioService from '../services/AudioService';
import { State } from 'react-native-track-player';
import { Scene } from '../constants/scenes';

const { width } = Dimensions.get('window');

const MiniPlayer = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Use navigation state to hide MiniPlayer on ImmersivePlayerScreen
  const isPlayerScreen = useNavigationState((state) => {
    if (!state) return false;
    const currentRoute = state.routes[state.index];
    return currentRoute.name === 'ImmersivePlayer';
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const widthAnim = useRef(new Animated.Value(1)).current; // 1 = expanded, 0 = collapsed
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHideAnim = useRef(new Animated.Value(1)).current;

  // Auto-hide logic
  const resetAutoHideTimer = () => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
    }
    
    // Show player
    Animated.timing(autoHideAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Start timer to hide
    autoHideTimerRef.current = setTimeout(() => {
      // Only auto-hide if not interacting
      if (!isInteracting) {
        Animated.timing(autoHideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }
    }, 5000);
  };

  useEffect(() => {
    // Initial timer
    resetAutoHideTimer();
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Listen to AudioService state changes
    const sub = AudioService.addAudioStateListener(({ state }) => {
      setIsPlaying(state === State.Playing || state === State.Buffering);
      resetAutoHideTimer(); // Reset timer on state change
      
      // Update current scene info
      const scene = AudioService.getCurrentScene();
      setCurrentScene(scene);
    });

    // Initial check
    const scene = AudioService.getCurrentScene();
    if (scene) {
      setCurrentScene(scene);
      setIsPlaying(AudioService.getCurrentState() === State.Playing);
    }

    return sub;
  }, []);

  useEffect(() => {
    // Visibility logic:
    // Show if: currentScene exists AND NOT on PlayerScreen
    // Hide if: currentScene is null OR on PlayerScreen
    const shouldShow = !!currentScene && !isPlayerScreen;

    Animated.timing(fadeAnim, {
      toValue: shouldShow ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    if (shouldShow) {
      resetAutoHideTimer();
    }
  }, [currentScene, isPlayerScreen, fadeAnim]);

  const handlePlayPause = async (e: any) => {
    e.stopPropagation();
    resetAutoHideTimer();
    try {
      if (isPlaying) {
        await AudioService.pause();
      } else {
        await AudioService.play();
      }
    } catch (error) {
      console.error('MiniPlayer toggle failed:', error);
    }
  };

  const toggleCollapse = (e: any) => {
    e.stopPropagation();
    resetAutoHideTimer();
    
    const targetValue = isCollapsed ? 1 : 0;
    setIsCollapsed(!isCollapsed);
    
    Animated.spring(widthAnim, {
      toValue: targetValue,
      useNativeDriver: false, // width change needs JS driver or LayoutAnimation
      friction: 8,
      tension: 40
    }).start();
  };

  const handlePress = () => {
    resetAutoHideTimer();
    if (isCollapsed) {
      // If collapsed, expand first instead of navigating
      toggleCollapse({ stopPropagation: () => {} });
    } else {
      navigation.navigate('ImmersivePlayer');
    }
  };

  const handleTouchStart = () => {
    setIsInteracting(true);
    resetAutoHideTimer();
  };

  const handleTouchEnd = () => {
    setIsInteracting(false);
    resetAutoHideTimer();
  };

  if (!currentScene) return null; // Render nothing if no track loaded ever

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
    <Animated.View
      style={[
        styles.container,
        {
          opacity: Animated.multiply(fadeAnim, autoHideAnim),
          bottom: insets.bottom + 16, // Safe area + margin
          width: '90%', // Base width constraint
          alignSelf: 'center',
          maxWidth: containerWidth,
          // If fadeAnim is 0, we want to disable pointer events
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0], // Slide up/down effect
              }),
            },
          ],
        },
      ]}
      pointerEvents={!currentScene || isPlayerScreen ? 'none' : 'auto'}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <TouchableOpacity 
        style={[styles.content, isCollapsed && styles.collapsedContent]} 
        onPress={handlePress}
        activeOpacity={0.9}
      >
        {/* Collapsed View (Pill) */}
        <Animated.View style={[styles.collapsedView, { opacity: collapsedOpacity }]}>
           <TouchableOpacity 
             style={styles.miniPlayButton}
             onPress={handlePlayPause}
             hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
           >
             <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
           </TouchableOpacity>
        </Animated.View>

        {/* Expanded View */}
        <Animated.View style={[styles.expandedView, { opacity: contentOpacity }]}>
          <Image 
            source={currentScene.backgroundSource} 
            style={styles.thumbnail} 
          />
          
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>{currentScene.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>正在播放</Text>
          </View>

          <TouchableOpacity 
            style={styles.playButton} 
            onPress={handlePlayPause}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
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
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: '5%', // Center horizontally
    right: '5%', // Center horizontally
    height: 64,
    borderRadius: 32, // More rounded pill shape
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8, // Softer shadow
    elevation: 8,
    backgroundColor: 'rgba(28, 30, 45, 0.85)', // Increased transparency
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
    paddingRight: 24, // Make room for collapse button
  },
  collapsedView: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingRight: 24, // Make room for expand button
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
  },
  miniPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20, // Adjust vertical alignment
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
