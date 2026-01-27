import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, SafeAreaView, Animated, Platform, Dimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAudio } from '../context/AudioContext';
import { SCENES, Scene } from '../constants/scenes';
import AudioService from '../services/AudioService'; 
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AmbientPickerSheet } from '../components/AmbientPickerSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 定义四大核心分类
const MAIN_CATEGORIES = ['Nature', 'Healing', 'Brainwave', 'Life'];

type ImmersivePlayerRouteProp = RouteProp<RootStackParamList, 'ImmersivePlayer'>;

const ImmersivePlayerNew = () => {
  const navigation = useNavigation();
  const route = useRoute<ImmersivePlayerRouteProp>();
  const { currentScene, isPlaying, togglePlayback } = useAudio();
  const pagerRef = useRef<PagerView>(null);
  
  const [ambientSheetVisible, setAmbientSheetVisible] = useState(false); // Default Hidden
  const [currentAmbient, setCurrentAmbient] = useState<'none' | 'rain' | 'fire'>('none');

  // 根据当前场景确定初始页面索引
  const initialPageIndex = useMemo(() => {
    if (!currentScene) return 0;
    const catIndex = MAIN_CATEGORIES.indexOf(currentScene.category);
    return catIndex >= 0 ? catIndex : 0;
  }, []);

  // 过滤出每个分类的代表性场景（目前简化为每个分类取第一个）
  const displayScenes = useMemo(() => {
    return MAIN_CATEGORIES.map(cat => {
      return SCENES.find(s => s.category === cat) || SCENES[0];
    });
  }, []);

  // 处理传入的 sceneId 并自动跳转到对应页面
  useEffect(() => {
    const sceneId = route.params?.sceneId;
    if (sceneId) {
      const targetScene = SCENES.find(s => s.id === sceneId);
      if (targetScene) {
        if (targetScene.id !== currentScene?.id) {
          AudioService.switchSoundscape(targetScene);
        }
        // 跳转到对应的 Pager 页面
        const catIndex = MAIN_CATEGORIES.indexOf(targetScene.category);
        if (catIndex >= 0 && pagerRef.current) {
          pagerRef.current.setPage(catIndex);
        }
      }
    }
  }, [route.params?.sceneId]);

  const handlePageSelected = (e: any) => {
    const index = e.nativeEvent.position;
    const targetScene = displayScenes[index];
    if (targetScene && targetScene.id !== currentScene?.id) {
      AudioService.switchSoundscape(targetScene);
    }
  };

  const handleToggle = async () => {
    if (currentScene) {
      await togglePlayback(currentScene);
    }
  };

  const toggleAmbientSheet = () => {
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

  const renderScenePage = (scene: Scene, index: number) => {
    return (
      <View key={scene.id} style={styles.page}>
        <ImageBackground 
          source={scene.backgroundUrl ? { uri: scene.backgroundUrl } : { uri: 'placeholder' }} 
          style={[styles.absolute, { backgroundColor: scene.primaryColor || '#000' }]}
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
              <Text style={styles.title}>{scene.title}</Text>
              <Text style={styles.subTitle}>{scene.category}</Text>

              <TouchableOpacity 
                style={styles.ambientTrigger}
                onPress={toggleAmbientSheet}
              >
                <Icon name="options-outline" size={24} color="#fff" />
                <Text style={styles.ambientTriggerText}>氛围点缀</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.controlCenter}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={handleToggle}
              >
                {isPlaying && currentScene?.id === scene.id ? (
                  <View style={styles.pauseIconContainer}>
                    <View style={styles.pauseBar} />
                    <View style={styles.pauseBar} />
                  </View>
                ) : (
                  <View style={styles.playIcon} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <View style={styles.indicatorContainer}>
                {MAIN_CATEGORIES.map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.indicator, 
                      index === i && styles.indicatorActive
                    ]} 
                  />
                ))}
              </View>
              <Text style={styles.statusText}>左右滑动切换场景：Sleep, Study, Relax, Party</Text>
            </View>
          </SafeAreaView>
        </ImageBackground>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PagerView 
        ref={pagerRef}
        style={styles.container} 
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
      >
        {displayScenes.map((scene, index) => renderScenePage(scene, index))}
      </PagerView>

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
  page: { width: SCREEN_WIDTH, flex: 1 },
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
  footer: { marginBottom: 50, alignItems: 'center' },
  indicatorContainer: { flexDirection: 'row', marginBottom: 15 },
  indicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 5 },
  indicatorActive: { backgroundColor: '#fff', width: 20 },
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