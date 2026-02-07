import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
import { SCENES, Scene } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useAudio } from '../context/AudioContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { ScrollView } from 'react-native-gesture-handler';
import { Typography } from '../theme/Typography';
import { useTranslation } from 'react-i18next';
import { BreathingLoader } from '../components/BreathingLoader';

interface RainDropConfig {
  id: number;
  top: number;
  left: number;
  delay: number;
  length: number;
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width - 40;

// 1. Extract SceneItem component to manage independent animation states
const SceneItem = React.memo(({ item, isPlaying, currentBaseSceneId, togglePlayback, navigation, isFocused }: any) => {
  // ... (keep existing implementation for big cards)
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const breathAnim = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);
  
  const isThisPlaying = isPlaying && currentBaseSceneId === item.id;
  const { t } = useTranslation();

  const combinedScale = Animated.multiply(
    scaleAnim,
    breathAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.05],
    })
  );

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
        { iterations: 2 }
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
    <View style={styles.cardWrapper}>
      <Animated.View 
        renderToHardwareTextureAndroid={true}
        style={[styles.cardContainer, { transform: [{ scale: combinedScale }] }]}
      >
        <View style={styles.cardClip}>
          {isFocused && (
            <Animated.View style={[styles.focusGlow, { opacity: focusGlowOpacity }]} />
          )}
          
          {isPressed && <View style={styles.pressOverlay} />}

          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.card, 
              isPressed && styles.cardPressed
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            delayLongPress={150}
            onPress={() => {
                setTimeout(async () => {
                  await AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', item.id);
                  // Explicitly call switchSoundscape with autoPlay: true to ensure playback on entry
                  AudioService.switchSoundscape(item, true);
                  
                  // Specific navigation for breathing scenes
                  if (item.id === 'nature_deep_sea' || item.id === 'nature_misty_forest') {
                    navigation.navigate('BreathDetail' as any, { sceneId: item.id });
                  } else {
                    navigation.navigate('ImmersivePlayer' as any, { sceneId: item.id });
                  }
                }, 50);
              }}
          >
            <View style={styles.cardInner}>
              <View style={[styles.cardBg, { backgroundColor: item.primaryColor }]} />
              <View style={styles.cardContent}>
                <View>
                  <Text style={styles.cardTitle}>{t(`scenes.${item.id}.title`)}</Text>
                  <Text style={styles.cardSubtitle}>{t(`categories.${item.category.toLowerCase()}`)}</Text>
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
  const { isPlaying, currentBaseSceneId, togglePlayback, syncNativeStatus } = useAudio();
  const { t } = useTranslation();
  
  const [userName, setUserName] = useState('');
  const [slogan, setSlogan] = useState('');
  const greetingFadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);

  // 1. Category logic definition
  const categories = ['Nature', 'Life', 'Healing', 'Brainwave'];
  const categoryLabels: Record<string, string> = {
    'Nature': t('categories.nature'),
    'Life': t('categories.life'),
    'Healing': t('categories.healing'),
    'Brainwave': t('categories.brainwave')
  };

  // Grouped data
  const groupedScenes = useMemo(() => {
    return categories.map(cat => ({
      title: cat,
      label: categoryLabels[cat],
      baseScenes: SCENES.filter(s => s.category === cat && s.isBaseScene),
    }));
  }, []);

  // Use useFocusEffect to ensure the username is re-read every time we return to the home page
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        const loadInitialState = async () => {
          // Read username
          const savedName = await AsyncStorage.getItem('USER_NAME');
          if (savedName) setUserName(savedName);
          else setUserName('');

          // Home smart positioning (logic adjusted to position to corresponding category, temporarily removed index positioning due to ScrollView)
        };
        loadInitialState();
      });
      return () => task.cancel();
    }, [])
  );

  useEffect(() => {
    const slogans = [t('slogans.journey'), t('slogans.peace'), t('slogans.silence')];
    const randomSlogan = slogans[Math.floor(Math.random() * slogans.length)];
    setSlogan(randomSlogan);

    // Fade in animation
    Animated.timing(greetingFadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [t]);

  const getGreetingParts = () => {
    const hour = new Date().getHours();
    let greeting = t('greetings.hello');
    if (hour < 6) greeting = t('greetings.midnight');
    else if (hour < 9) greeting = t('greetings.morning');
    else if (hour < 12) greeting = t('greetings.afternoon');
    else if (hour < 14) greeting = t('greetings.noon');
    else if (hour < 17) greeting = t('greetings.lateAfternoon');
    else if (hour < 19) greeting = t('greetings.evening');
    else greeting = t('greetings.night');
    
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
    // Singleton instance check
    console.log('🔄 [HomeScreen] AudioService Instance Check: Using default exported instance');
    console.log('🔄 [HomeScreen] AudioService Instance Type:', typeof AudioService);
    console.log('🔄 [HomeScreen] AudioService Has Pause Method:', typeof AudioService.pause === 'function');

    // Initialize Audio
    const init = async () => {
      try {
        await AudioService.setupPlayer();
        await AudioService.loadAudio(SCENES[0], false);
      } finally {
      }
    };
    init().catch(() => {});
  }, []);

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
        
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <BreathingLoader size={100} style={styles.headerLoader} />
            <Text style={styles.title}>{t('appTitle')}</Text>
            <Animated.View style={{ opacity: greetingFadeAnim }}>
              <Text style={styles.subtitle}>
                {getGreetingParts().greeting}
                {getGreetingParts().userName ? `, ` : ''}
                <Text style={styles.userName}>{getGreetingParts().userName}</Text>
                {getGreetingParts().userName ? '. ' : ''}{slogan}
              </Text>
            </Animated.View>
          </View>

          {groupedScenes.map((group) => (
            <View key={group.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.label}</Text>
              
              {/* Big scene list */}
              {group.baseScenes.map((scene: Scene) => (
                <SceneItem 
                  key={scene.id} 
                  item={scene} 
                  isPlaying={isPlaying} 
                  currentBaseSceneId={currentBaseSceneId} 
                  togglePlayback={togglePlayback} 
                  navigation={navigation} 
                  isFocused={focusedSceneId === scene.id}
                />
              ))}
            </View>
          ))}
        </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
    alignItems: 'center',
  },
  header: { 
    alignItems: 'center', 
    marginBottom: 40,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
  },
  headerLoader: {
    marginBottom: 10,
  },
  title: { 
    fontSize: 32, 
    color: '#fff', 
    fontWeight: '700', 
    letterSpacing: 1,
    fontFamily: Typography.fontFamily
  },
  subtitle: { 
    fontSize: 14, 
    color: 'rgba(255, 255, 255, 0.6)', 
    marginTop: 8,
    fontFamily: Typography.fontFamily
  },
  userName: { fontWeight: '700', color: 'rgba(255, 255, 255, 0.9)' },
  
  section: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  sectionTitle: {
    width: ITEM_WIDTH,
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 20,
    fontFamily: Typography.fontFamily,
    letterSpacing: 0.5,
  },

  cardWrapper: { 
    width: ITEM_WIDTH,
    height: 110,
    marginBottom: 20,
    zIndex: 1,
    position: 'relative',
  },
  cardContainer: { 
    width: ITEM_WIDTH,
    height: 110,
  },
  cardClip: {
    width: ITEM_WIDTH,
    height: 110,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  focusGlow: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 5,
    right: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  pressOverlay: {
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
  },
  cardPressed: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)'
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
    fontWeight: '700',
    fontFamily: Typography.fontFamily
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    fontFamily: Typography.fontFamily
  },
  cardPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
});
