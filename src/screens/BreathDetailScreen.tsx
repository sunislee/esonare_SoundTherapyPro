import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';
import { usePlayerState } from '../hooks/usePlayerState';
import AudioService from '../services/AudioService';
import { SCENES } from '../constants/scenes';
import { Event, useTrackPlayerEvents } from 'react-native-track-player';
import { RootStackParamList } from '../navigation/MainNavigator';

const { width } = Dimensions.get('window');

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
  const { isPlaying } = usePlayerState();
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const sceneId = route.params?.sceneId || 'nature_deep_sea';
  const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];

  useTrackPlayerEvents(events, (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      handleMeditationComplete();
    }
  });

  useEffect(() => {
    // 初始进入，先加载音频
    const loadAudio = async () => {
      setIsLoading(true);
      await AudioService.switchSoundscape(scene, true);
      setIsLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    };

    loadAudio();

    // 监听播放结束
    const unsubscribeFinished = AudioService.addSleepTimerFinishedListener(() => {
      handleMeditationComplete();
    });

    return () => {
      unsubscribeFinished();
    };
  }, []);

  const handleMeditationComplete = () => {
    setShowSuccess(true);
    
    // 3秒后可以考虑自动返回或留在页面
    setTimeout(() => {
      // setShowSuccess(false);
    }, 5000);
  };

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
    <View style={[styles.container, { backgroundColor: scene.primaryColor }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* 背景装饰 */}
      <View style={styles.bgOverlay} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Icon name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t(`scenes.${scene.id}.title`)}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Content */}
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.breathingContainer}>
            {isLoading ? (
              <View style={styles.loaderPlaceholder}>
                <Icon name="sync" size={40} color="rgba(255,255,255,0.4)" />
              </View>
            ) : (
              <View style={[styles.breathingCircle, isPlaying && styles.breathingCircleActive]}>
                <Icon 
                  name={scene.id.includes('nature') ? 'leaf' : 'heart'} 
                  size={60} 
                  color="#FFF" 
                />
              </View>
            )}
            {!isLoading && (
              <Text style={styles.guideText}>
                {isPlaying ? t('player.status.playing') : t('player.status.paused')}
              </Text>
            )}
          </View>

          {/* Controls */}
          <View style={styles.controls}>
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
      </SafeAreaView>

      {/* 成功反馈全屏 */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <Icon name="checkmark-circle" size={100} color="#6C5DD3" />
          <Text style={styles.successText}>{t('meditation.success_title')}</Text>
          <TouchableOpacity 
            style={styles.successCloseBtn}
            onPress={() => setShowSuccess(false)}
          >
            <Text style={styles.successCloseText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 60,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: width * 0.8,
    height: width * 0.8,
  },
  loaderPlaceholder: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathingCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  breathingCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  guideText: {
    marginTop: 40,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 2,
  },
  controls: {
    marginTop: 60,
    marginBottom: 40,
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
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  successText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
  },
  successCloseBtn: {
    marginTop: 40,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: '#6C5DD3',
  },
  successCloseText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BreathDetailScreen;
