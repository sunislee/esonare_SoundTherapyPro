import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, SafeAreaView, Animated, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AmbientPickerSheet } from '../components/AmbientPickerSheet';

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;

const ImmersivePlayerNew = () => {
  const navigation = useNavigation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const { currentScene, isPlaying, togglePlayback } = useAudio();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [ambientSheetVisible, setAmbientSheetVisible] = useState(false); // Default Hidden
  const [currentAmbient, setCurrentAmbient] = useState<'none' | 'rain' | 'fire'>('none');

  // 处理传入的 sceneId
  useEffect(() => {
    const sceneId = route.params?.sceneId;
    if (sceneId && sceneId !== currentScene?.id) {
      const targetScene = SCENES.find(s => s.id === sceneId);
      if (targetScene) {
        AudioService.switchSoundscape(targetScene);
      }
    }
  }, [route.params?.sceneId]);

  // 获取当前场景索引
  const currentIndex = useMemo(() => {
    if (!currentScene) return 0;
    return SCENES.findIndex(s => s.id === currentScene.id);
  }, [currentScene]);

  // 切换逻辑
  const handleNext = async () => {
    const nextIndex = (currentIndex + 1) % SCENES.length;
    await AudioService.switchSoundscape(SCENES[nextIndex]);
  };

  const handlePrev = async () => {
    const prevIndex = (currentIndex - 1 + SCENES.length) % SCENES.length;
    await AudioService.switchSoundscape(SCENES[prevIndex]);
  };

  const handleToggle = async () => {
    if (currentScene) {
      await togglePlayback(currentScene);
    }
  };

  const toggleAmbientSheet = () => {
    console.log('Ambient Button Clicked!');
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

  // 基础生命周期
  useEffect(() => {
    console.log('[ImmersivePlayerNew] 页面加载');
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  // 场景切换时的基础淡入动画 (800ms)
  useEffect(() => {
    if (currentScene?.id) {
      fadeAnim.setValue(0.6); 
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }
  }, [currentScene?.id]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.absolute, { opacity: fadeAnim }]}>
        <ImageBackground 
          // 容错处理：确保 source 不为 undefined
          source={currentScene?.backgroundUrl ? { uri: currentScene.backgroundUrl } : { uri: 'placeholder' }} 
          style={[styles.absolute, { backgroundColor: currentScene?.primaryColor || '#000' }]}
          resizeMode="cover"
        >
          <SafeAreaView style={styles.overlay}>
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => navigation.goBack()}
              >
                <Icon name="chevron-down" size={32} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>{currentScene?.title || '沉浸播放器'}</Text>
              <Text style={styles.subTitle}>{currentScene?.category || '请选择场景'}</Text>

              {/* Ambient Trigger Button */}
              <TouchableOpacity 
                style={styles.ambientTrigger}
                onPress={toggleAmbientSheet}
              >
                <Icon name="options-outline" size={24} color="#fff" />
                <Text style={styles.ambientTriggerText}>氛围点缀</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.controlCenter}>
              <View style={styles.mainControls}>
                <TouchableOpacity style={styles.sideButton} onPress={handlePrev}>
                  <Text style={styles.sideButtonText}>PREV</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.playButton}
                  onPress={handleToggle}
                >
                  {isPlaying ? (
                    <View style={styles.pauseIconContainer}>
                      <View style={styles.pauseBar} />
                      <View style={styles.pauseBar} />
                    </View>
                  ) : (
                    <View style={styles.playIcon} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.sideButton} onPress={handleNext}>
                  <Text style={styles.sideButtonText}>NEXT</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.statusText}>核心功能已恢复 - 800ms 基础淡入</Text>
            </View>
          </SafeAreaView>
        </ImageBackground>
      </Animated.View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  absolute: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  header: { marginTop: 60, alignItems: 'center', width: '100%' },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 0,
    zIndex: 10,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '600', letterSpacing: 2 },
  subTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 8, letterSpacing: 1 },
  controlCenter: { justifyContent: 'center', alignItems: 'center', width: '100%' },
  mainControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '80%' },
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
  playIcon: {
    width: 0, height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 25, borderRightWidth: 0,
    borderBottomWidth: 15, borderTopWidth: 15,
    borderLeftColor: '#fff', borderRightColor: 'transparent',
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    marginLeft: 5,
  },
  pauseIconContainer: { flexDirection: 'row', justifyContent: 'space-between', width: 20 },
  pauseBar: { width: 6, height: 24, backgroundColor: '#fff', borderRadius: 3 },
  sideButton: { padding: 10 },
  sideButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  footer: { marginBottom: 50 },
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