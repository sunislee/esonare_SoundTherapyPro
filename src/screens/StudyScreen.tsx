import React, { useState, useEffect, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  State,
  usePlaybackState,
} from 'react-native-track-player';
import { useTranslation } from 'react-i18next';
import { RainDrop } from '../components/RainDrop';
import AudioService from '../services/AudioService';
import { Typography } from '../theme/Typography';


interface RainDropConfig {
  id: number;
  top: number;
  left: number;
  delay: number;
  length: number;
}

const StudyScreen: React.FC = () => {
  const { t } = useTranslation();
  const playbackState = usePlaybackState();
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const breathAnim = useRef(new Animated.Value(1)).current;
  const [volume, _setVolume] = useState(0.5);
  
  // Raindrop animation state
  const rainDrops = useRef<RainDropConfig[]>([]);
  const [isRainReady, setIsRainReady] = useState(false);
  

  useEffect(() => {
    AudioService.setVolume(volume).catch(() => {});
  }, [volume]);
  

  useEffect(() => {
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
    rainDrops.current = drops;
    setIsRainReady(true);
  }, []);
  

  const getPlaybackStatus = () => {

    const currentState = typeof playbackState === 'object' && 'state' in playbackState 
      ? playbackState.state 
      : playbackState;

    switch (currentState) {
      case State.Playing:
        return {
          isPlaying: true,
          isBuffering: false,
          statusText: t('study.status.playing'),
          buttonIcon: '⏸',
          buttonText: t('actions.pause')
        };
      case State.Paused:
      case State.Ready:
      case State.Stopped:

      case 'paused':
      case 'stopped':
        return {
          isPlaying: false,
          isBuffering: false,
          statusText: t('study.status.paused'),
          buttonIcon: '▶',
          buttonText: t('actions.play')
        };
      case State.Buffering:
      case State.Loading:
      case 'buffering':
      case 'loading':
        return {
          isPlaying: false,
          isBuffering: true,
          statusText: t('study.status.buffering'),
          buttonIcon: '⏸',
          buttonText: t('study.status.buffering')
        };
      default:
        return {
          isPlaying: false,
          isBuffering: false,
          statusText: t('study.status.ready'),
          buttonIcon: '▶',
          buttonText: t('study.status.ready')
        };
    }
  };

  const { isPlaying, isBuffering, statusText, buttonIcon, buttonText } = getPlaybackStatus();


  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isPlaying) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.2,
            duration: 2000,
            useNativeDriver: true
          }),
          Animated.timing(breathAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true
          })
        ])
      );
      loop.start();
    } else {
      breathAnim.setValue(1);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [breathAnim, isPlaying]);


  useEffect(() => {
    const initAudio = async () => {
      setIsLoading(true);
      try {
        await AudioService.setupPlayer();
        await AudioService.loadAudio();

        await AudioService.play();
      } catch (error) {
        // StudyScreen: Setup failed
      } finally {
        setIsLoading(false);
      }
    };

    initAudio();

    return () => {


    };
  }, []);


  useEffect(() => {

    Animated.timing(statusAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {

      Animated.timing(statusAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });
  }, [statusAnim, statusText]);


  useEffect(() => {
    Animated.timing(statusAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [statusAnim]);


  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isPlaying ? 1 : 0,
      duration: 3000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, isPlaying]);

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await AudioService.pause();
      } else {
        await AudioService.play();
      }
    } catch (error) {
      console.error('Playback toggle failed:', error);
      Alert.alert(t('error.playError'), t('error.operationFailed', { message: (error as Error).message }));
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent={true} 
      />
      

      <View style={styles.gradientBackground}>
        

        <View style={[styles.rainContainer, { zIndex: 999 }]} pointerEvents="none">
          {isRainReady && rainDrops.current.map((drop) => (
            <RainDrop 
              key={drop.id} 
              volume={volume} 
              rainDropConfig={drop}
            />
          ))}
        </View>
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('study.title')}</Text>
            <Text style={styles.subtitle}>{t('study.subtitle')}</Text>
            <Text style={styles.description}>{t('study.description')}</Text>
          </View>


          <Animated.View style={[styles.breathBackground, { 
            opacity: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.4],
            }),
            transform: [{
              scale: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2],
              })
            }]
          }]} />

          <View style={styles.controlArea}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot, 
                (isPlaying || isBuffering) && styles.statusDotActive, 
                isBuffering && styles.statusDotBuffering
              ]} />
              <Animated.Text 
                style={[styles.statusText, {
                  opacity: statusAnim,
                  transform: [{
                    translateY: statusAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0]
                    })
                  }]
                }]}
              >
                {isLoading ? t('player.status.loading') : statusText}
              </Animated.Text>
            </View>
            

            <View style={{ zIndex: 999, elevation: 999 }} pointerEvents="auto">
              <TouchableOpacity
                {...({ pointerEvents: 'auto' } as any)}
                style={styles.buttonContainer}
                hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
                onPress={togglePlayback}
                disabled={isLoading || isBuffering}>
              <Animated.View 
                style={[styles.buttonOuterRing, {
                  transform: [{ scale: breathAnim }]
                }]}
              />
              <Animated.View 
                style={[
                  styles.playButton, 
                  isPlaying && styles.playingButton,
                  isBuffering && styles.bufferingButton,
                  {
                    transform: [{ scale: breathAnim.interpolate({
                      inputRange: [1, 1.2],
                      outputRange: [1, 0.9]
                    })}]
                  }
                ]}
              >
                <Text style={[
                  styles.playButtonText, 
                  isPlaying && styles.playingButtonText,
                  isBuffering && styles.bufferingButtonText
                ]}>
                  {buttonIcon}
                </Text>
              </Animated.View>
              <Text style={[
                styles.buttonLabel,
                isPlaying && styles.playingButtonText,
                isBuffering && styles.bufferingButtonText
              ]}>
                {isLoading ? t('player.status.loading') : buttonText}
              </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('about.kernelVersion')}: 0.83.0 | {t('settings.developer')}: fakecoder</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },

  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a12',
    overflow: 'hidden'
  },


  rainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  content: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    position: 'relative',
    zIndex: 1
  },
  header: { 
    alignItems: 'center', 
    marginBottom: 60,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 40, 
  },
  title: { fontSize: 42, color: '#fff', fontWeight: '200', letterSpacing: 5, textShadowColor: 'rgba(74, 144, 226, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  subtitle: { fontSize: 16, color: '#aaa', marginTop: 10 },
  description: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 5 },
  breathBackground: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#4a90e2',
    opacity: 0.1,

  },
  controlArea: { alignItems: 'center', zIndex: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#444', marginRight: 10 },
  statusDotActive: { backgroundColor: '#4a90e2' },
  statusDotBuffering: { backgroundColor: '#f5a623' },
  statusText: { color: '#aaa', fontSize: 14, letterSpacing: 1 },
  
  buttonContainer: { alignItems: 'center', justifyContent: 'center', width: 100, height: 100 },
  buttonOuterRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  playingButton: {
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    borderColor: '#4a90e2',
  },
  bufferingButton: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    borderColor: '#f5a623',
  },
  playButtonText: {
    fontSize: 24,
    color: '#fff',

  },
  playingButtonText: {
    color: '#4a90e2',

  },
  bufferingButtonText: {
    color: '#f5a623',
  },
  buttonLabel: {
    position: 'absolute',
    bottom: -25,
    fontSize: 12,
    color: '#666',
  },
  
  footer: {
    position: 'absolute',
    bottom: 30,
    opacity: 0.5,
  },
  footerText: {
    fontFamily: Typography.fontFamily,
    color: '#444',
    fontSize: 10,
  }
});

export default StudyScreen;
