import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, ImageBackground, Image, TouchableOpacity, SafeAreaView, Animated, Platform, Dimensions, Easing, InteractionManager, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene, SMALL_SCENE_IDS, getIconName } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
import { usePlayerState } from '../hooks/usePlayerState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AmbientPickerSheet } from '../components/AmbientPickerSheet';
import { BlurView } from '@react-native-community/blur';
import TrackPlayer, { State } from 'react-native-track-player';
import { ConfirmationModal } from '../components/ConfirmationModal';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const { width: SCREEN_WIDTH } = Dimensions.get('window');


const AnimatedFloatingButton = ({ 
  ambient, 
  isActive, 
  onPress,
  column,
  row
}: { 
  ambient: Scene, 
  isActive: boolean, 
  onPress: () => void,
  column: number,
  row: number
}) => {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;


  useEffect(() => {
    const isBackgroundLayer = ['interactive_rain', 'life_summer', 'interactive_ocean', 'life_fireplace', 'interactive_breath'].includes(ambient.id);
    const isBreath = ambient.id === 'interactive_breath';
    const animationDuration = isBreath ? 2500 : 1500;
    
    if (isActive && isBackgroundLayer) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: animationDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: animationDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
      glowAnim.stopAnimation();
    }
  }, [isActive, ambient.id]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.85,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const getLabel = (id: string) => {
    switch(id) {
      case 'interactive_match': return t('player.labels.ignite');
      case 'interactive_apple': return t('player.labels.crisp');
      case 'interactive_wind_chime': return t('player.labels.ethereal');
      case 'life_summer': return t('player.labels.summer');
      case 'interactive_rain': return t('player.labels.rain');
      case 'interactive_ocean': return t('player.labels.ocean');
      case 'life_fireplace': return t('player.labels.fireplace');
      case 'interactive_breath': return t('player.labels.breath');
      default: return '';
    }
  };

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 50 + row * 100,
        left: column === 0 ? 30 : SCREEN_WIDTH - 80,
        alignItems: 'center',
        transform: [{ scale }]
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={[
          styles.floatingIconBtn,
          isActive && styles.floatingIconBtnActive,
          isActive && ['interactive_rain', 'life_summer', 'interactive_ocean', 'life_fireplace'].includes(ambient.id) && {
            borderColor: '#fff',
            borderWidth: 2,
            shadowColor: '#fff',
            shadowOpacity: 0.8,
            shadowRadius: 15,
          }
        ]}
      >
        <Animated.View style={{
          opacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1]
          }),
          transform: [{
            scale: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.1]
            })
          }]
        }}>
          <Icon 
            name={getIconName(ambient.id)} 
            size={20} 
            color={isActive ? '#fff' : 'rgba(255,255,255,0.6)'} 
          />
        </Animated.View>
      </TouchableOpacity>
      <Text style={styles.iconLabel}>{getLabel(ambient.id)}</Text>
    </Animated.View>
  );
};


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


const MAIN_CATEGORIES = ['Nature', 'Healing', 'Brainwave', 'Life'];




const DEFAULT_SCENE = SCENES[0];

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;


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

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bottomBgOpacity }]}>
        <Image 
          source={prevScene.backgroundSource}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fadeDuration={0}
        />
      </Animated.View>
      

      <Image 
        key={`bg-top-${activeScene.id}`}
        source={activeScene.backgroundSource}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        fadeDuration={0}
        
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
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const insets = useSafeAreaInsets();
  const { currentScene, currentBaseSceneId, activeSmallSceneIds, toggleAmbience, setAmbient } = useAudio();
  const { isPlaying, currentState, getRealIsPlaying } = usePlayerState();
  const pagerRef = useRef<PagerView>(null);

  const CATEGORY_MAP: Record<string, string> = useMemo(() => ({
    'Nature': t('categories.nature'),
    'Healing': t('categories.healing'),
    'Brainwave': t('categories.brainwave'),
    'Life': t('categories.life'),
  }), [t]);

  const lastClickTime = useRef(0);

  useEffect(() => {
    return () => {
      console.log('[ImmersivePlayer] Page unmounting, cleaning up background layers...');
      AudioService.stopAllAmbient();
    };
  }, []);

  const [isFrozen, setIsFrozen] = useState(false);

  if (isFrozen) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const selectedScene = useMemo(() => {
    const sceneId = route.params?.sceneId;
    if (sceneId) {
      return SCENES.find(s => s.id === sceneId) || null;
    }
    return null;
  }, [route.params?.sceneId]);

  const scrollOffset = useRef(new Animated.Value(0)).current;
  const position = useRef(new Animated.Value(0)).current;
  
  const scrollProgress = useRef(Animated.add(position, scrollOffset)).current;
  
  const [ambientSheetVisible, setAmbientSheetVisible] = useState(false); // Default Hidden
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentAmbient, setCurrentAmbient] = useState<'none' | 'fireplace' | 'summer'>('none');
  const [showGuide, setShowGuide] = useState(false);
  const guideOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const checkFirstVisit = async () => {
      const hasVisited = await AsyncStorage.getItem('HAS_VISITED_PLAYER');
      if (!hasVisited) {
        setShowGuide(true);
        Animated.timing(guideOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();

        setTimeout(() => {
          Animated.timing(guideOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => setShowGuide(false));
          AsyncStorage.setItem('HAS_VISITED_PLAYER', 'true');
        }, 3500);
      }
    };
    checkFirstVisit();
  }, []);

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

  const initialPageIndex = useMemo(() => {
    const target = selectedScene || currentScene;
    if (!target) return 0;
    const catIndex = MAIN_CATEGORIES.indexOf(target.category);
    return catIndex >= 0 ? catIndex : 0;
  }, [selectedScene]);

  const [activeIndex, setActiveIndex] = useState(initialPageIndex);
  const [prevIndex, setPrevIndex] = useState(initialPageIndex);
  
  const bottomBgOpacity = useRef(new Animated.Value(1)).current;

  const isExiting = useRef(false);

  useEffect(() => {
    if (isExiting.current) return;
    Animated.timing(bottomBgOpacity, {
      toValue: 0.6,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        setPrevIndex(activeIndex);
        Animated.timing(bottomBgOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }).start();
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [activeIndex]);

  const displayScenes = useMemo(() => {
    return MAIN_CATEGORIES.map(cat => {
      const targetScene = selectedScene || currentScene;
      
      if (targetScene && targetScene.category === cat) {
        return targetScene;
      }
      return SCENES.find(s => s.category === cat) || DEFAULT_SCENE;
    });
  }, [selectedScene, currentScene?.id]);

  useEffect(() => {
    position.setValue(initialPageIndex);
    scrollOffset.setValue(0);

    console.log('🔄 [ImmersivePlayer] AudioService Instance Check: Using default exported instance');
    console.log('🔄 [ImmersivePlayer] AudioService Instance Type:', typeof AudioService);
    console.log('🔄 [ImmersivePlayer] AudioService Has Pause Method:', typeof AudioService.pause === 'function');

    const syncStatus = async () => {
      const realIsPlaying = await AudioService.getRealIsPlaying();
      console.log('🔄 [ImmersivePlayer] Mount sync: RealIsPlaying =', realIsPlaying);
    };
    syncStatus();

    // Listen for meditation completion (sleep timer finish)
    const unsubscribeFinished = AudioService.addSleepTimerFinishedListener(() => {
      setShowSuccessModal(true);
    });

    return () => {
      unsubscribeFinished();
      setTimeout(() => {
        // AudioService.stop();
      }, 800);

      bottomBgOpacity.stopAnimation();
      playBtnScale.stopAnimation();
      position.stopAnimation();
      scrollOffset.stopAnimation();
    };
  }, []);

   useEffect(() => {
     
     if (isFrozen || isExiting.current) {
       return;
     }

     const task = InteractionManager.runAfterInteractions(async () => {
       if (isFrozen || isExiting.current) return;
       
       const realIsPlaying = await AudioService.getRealIsPlaying();
       
       if (selectedScene) {
         if (selectedScene.id !== currentScene?.id) {
           console.log('🔄 [ImmersivePlayer] Lifecycle sync: Stopping all before switch');
           await AudioService.stopAll();
           
           setTimeout(() => {
             if (!isExiting.current) {
               console.log('🚀 [ImmersivePlayer] Lifecycle sync: Starting new soundscape');
               AudioService.switchSoundscape(selectedScene, true);
             }
           }, 100);
         } else if (!realIsPlaying) {
           console.log('▶️ [ImmersivePlayer] Scene matched but not playing, forcing play');
           AudioService.play();
         }
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
    debounceTimer.current = setTimeout(() => {
       InteractionManager.runAfterInteractions(() => {
         if (isFrozen || isExiting.current) return;
         const safeIdx = Math.max(0, Math.min(index, displayScenes.length - 1));

         setActiveIndex(safeIdx);

         const targetScene = displayScenes[safeIdx] || DEFAULT_SCENE;
         if (targetScene && targetScene.id !== currentScene?.id) {
           AudioService.switchSoundscape(targetScene);
         }
         
         if (targetScene) {
           AsyncStorage.setItem('LAST_VIEWED_SCENE_ID', targetScene.id).catch(() => {});
         }
       });
    }, 400);
  };

  const handleToggle = async () => {
    try {
      const state = await TrackPlayer.getState();
      
      if (state === State.Playing) {
        await TrackPlayer.pause();
        await AudioService.syncNativeStatus();
      } else {
        await AudioService.play();
      }
    } catch (e) {
      console.error('Error in handleToggle:', e);
    }
  };

  const handleIndicatorPress = (targetIndex: number) => {
    pagerRef.current?.setPage(targetIndex);
  };

  const handleBack = () => {
    setIsFrozen(true);

    isExiting.current = true;

    navigation.goBack();
  };

  const toggleAmbientSheet = () => {
    setAmbientSheetVisible(!ambientSheetVisible);
  };

  const handleAmbientSelect = (type: 'none' | 'fireplace' | 'summer') => {
     setCurrentAmbient(type);
     if (type === 'none') {
       setAmbient(null);
     } else {
       const idMap: Record<string, string> = {
         'fireplace': 'life_fireplace',
         'summer': 'life_summer'
       };
       setAmbient(idMap[type]);
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

  const renderHeader = () => {
    // Redundant function, logic migrated to main render block
    return null;
  };

  const renderScenePage = (scene: Scene, index: number) => {
    const isThisScenePlaying = isPlaying && currentBaseSceneId === scene.id;

    const globalAmbientScenes = useMemo(() => {
      return SMALL_SCENE_IDS.map(id => SCENES.find(s => s.id === id)).filter(Boolean) as Scene[];
    }, []);

    return (
      <View key={scene.id} style={[styles.page, { backgroundColor: 'transparent' }]}>
        <SafeAreaView style={[styles.overlay, { backgroundColor: 'transparent' }]}>
          <View style={styles.headerPlaceholder} />

          <View style={styles.floatingIconsContainer} pointerEvents="box-none">
            {showGuide && (
              <Animated.View style={[styles.guideBubble, { opacity: guideOpacity }]}>
                <View style={styles.bubbleArrow} />
                <Text style={styles.guideText}>{t('player.guide.text')}</Text>
              </Animated.View>
            )}
            {globalAmbientScenes.map((ambient, idx) => {
              const isActive = (activeSmallSceneIds || []).includes(ambient.id);
              const column = idx % 2;
              const row = Math.floor(idx / 2);
              
              return (
                <AnimatedFloatingButton
                  key={`floating-${ambient.id}`}
                  ambient={ambient}
                  isActive={isActive}
                  column={column}
                  row={row}
                  onPress={() => {
                    toggleAmbience(ambient, 'Floating Icon');
                  }}
                />
              );
            })}
          </View>

          <View style={styles.controlCenter}>
            <Animated.View style={{ transform: [{ scale: playBtnScale }] }}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={() => handleToggle()}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
              >
                {isThisScenePlaying ? (
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
            {isPlaying ? t('player.status.playing') : t('player.status.paused')}
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
                }
              }
            )}
          >
            {displayScenes.map((scene, index) => renderScenePage(scene, index))}
          </AnimatedPagerView>

          {renderFixedFooter()}

          <View style={{ 
            position: 'absolute', 
            top: 80, 
            left: 0, 
            right: 0, 
            zIndex: 99999, 
            elevation: 100,
            alignItems: 'center',
            pointerEvents: 'none'
          }}> 
            {MAIN_CATEGORIES.map((category, rawIndex) => {
              const index = Math.max(0, Math.min(rawIndex, displayScenes.length - 1));
              const activeScene = displayScenes[index] || DEFAULT_SCENE;
              const opacity = scrollProgress.interpolate({
                inputRange: [index - 0.5, index, index + 0.5],
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              });

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
                  <Text style={{ 
                    color: 'white', 
                    fontSize: 24, 
                    fontWeight: 'bold',
                    letterSpacing: 2,
                    textShadowColor: 'rgba(0,0,0,0.5)', 
                    textShadowOffset: {width: 0, height: 2}, 
                    textShadowRadius: 4 
                  }}> 
                    {CATEGORY_MAP[category] || category} 
                  </Text> 
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
                    {activeScene ? t(`scenes.${activeScene.id}.title`) : ''}
                  </Text>
                </Animated.View>
              );
            })}
          </View>

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
            zIndex: 100000,
          }}>
            <TouchableOpacity 
              onPress={() => { 
                navigation.goBack(); 
                setIsFrozen(true); 
              }} 
              style={{ padding: 8 }}
            >
              <Icon name="chevron-down" size={32} color="#fff" />
            </TouchableOpacity>
            
          </View>

          <AmbientPickerSheet
            visible={ambientSheetVisible}
            currentAmbient={currentAmbient}
            currentSceneId={currentScene?.id || ''}
            onClose={toggleAmbientSheet}
            onSelect={handleAmbientSelect}
            onRestoreMix={(mix) => {
              handleAmbientSelect(mix.ambientType as any);
            }}
          />

          <ConfirmationModal
            visible={showSuccessModal}
            title={t('meditation.success_title')}
            message={t('meditation.success_message')}
            confirmText={t('meditation.success_confirm')}
            onConfirm={() => setShowSuccessModal(false)}
            onCancel={() => setShowSuccessModal(false)}
            showSuccessAnimation={true}
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
    zIndex: 10000, // Higher than wrapper
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
    color: '#FFFFFF', // Pure white
    fontSize: 24, 
    fontWeight: '600', 
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)', // Add shadow to prevent background interference
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  sceneTitle: { 
    color: '#FFFFFF', // Pure white
    fontSize: 14, 
    marginTop: 4, 
    letterSpacing: 1,
    textAlign: 'center',
    opacity: 0.8, // Slightly lower opacity to distinguish primary/secondary, but still pure white
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  controlCenter: { justifyContent: 'center', alignItems: 'center', width: '100%' },
  floatingIconsContainer: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    bottom: 260,
    zIndex: 10,
  },
  floatingIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  floatingIconBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  iconLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '400',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  guideBubble: {
    position: 'absolute',
    top: 0,
    left: 40,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  bubbleArrow: {
    position: 'absolute',
    bottom: -6,
    left: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.95)',
  },
  guideText: {
    color: '#333',
    fontSize: 12,
    fontWeight: '600',
  },
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
});


export default ImmersivePlayerNew;