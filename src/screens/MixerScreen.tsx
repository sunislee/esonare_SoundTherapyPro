import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Alert,
  TextInput,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import Slider from '@react-native-community/slider';
import Video from 'react-native-video';
import { AUDIO_MANIFEST, REMOTE_RESOURCE_BASE_URL } from '../constants/audioAssets';
import ToastUtil from '../utils/ToastUtil';
import { BlurView } from '@react-native-community/blur';
import { useTranslation } from 'react-i18next';

import { useNavigation, useRoute } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GOLD = '#D4AF37';
const BG_DARK = '#121212';
const CARD_BG = 'rgba(255, 255, 255, 0.05)';

interface TrackState {
  id: string;
  volume: number;
  isActive: boolean;
  title: string;
  filename: string;
}

interface SavedPreset {
  id: string;
  name: string;
  tracks: { id: string; volume: number; isActive: boolean }[];
  createdAt: number;
}

export const MixerScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const presetId = route.params?.presetId;


  useEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { display: 'none' }
      });
    }
    return () => {
      if (parent) {
        parent.setOptions({
          tabBarStyle: { 
            display: 'flex',
            backgroundColor: '#1C1E2D',
            borderTopWidth: 0,
            elevation: 0,
            height: 64,
            paddingBottom: 10,
            position: 'absolute',
          }
        });
      }
    };
  }, [navigation]);

  const [tracks, setTracks] = useState<TrackState[]>(
    AUDIO_MANIFEST.map(asset => ({
      id: asset.id,
      volume: 0.5,
      isActive: false,
      title: asset.title,
      filename: asset.filename,
    }))
  );

  // Initial load preset
  useEffect(() => {
    if (presetId) {
      loadPresetFromId(presetId);
    }
  }, [presetId]);

  const loadPresetFromId = async (id: string) => {
    try {
      const presetsJson = await AsyncStorage.getItem('@mixer_presets');
      if (presetsJson) {
        const presets: SavedPreset[] = JSON.parse(presetsJson);
        const preset = presets.find(p => p.id === id);
        if (preset) {
          setCurrentSceneName(preset.name);
          setTracks(prev => prev.map(t => {
            const savedTrack = preset.tracks.find(st => st.id === t.id);
            if (savedTrack) {
              return { ...t, volume: savedTrack.volume, isActive: true };
            }
            return { ...t, isActive: false };
          }));
          ToastUtil.success(t('mixer.presetLoaded', { name: preset.name }));
        }
      }
    } catch (e) {
      console.log('Failed to load preset', e);
    }
  };

  const [sleepTimer, setSleepTimer] = useState<number | null>(null); // minutes
  const [timeLeft, setTimeLeft] = useState<number | null>(null); // seconds
  const timerRef = useRef<any>(null);
  const [presetName, setPresetName] = useState('');
  const [currentSceneName, setCurrentSceneName] = useState<string>(() => t('mixer.labTitle'));
  const [showSaveModal, setShowSaveModal] = useState(false);


  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (timeLeft === 0) {
      stopAllTracks();
      setTimeLeft(null);
      setSleepTimer(null);
      ToastUtil.success(t('player.sleepTimer.finished'));
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft]);

  const stopAllTracks = () => {
    setTracks(prev => prev.map(t => ({ ...t, isActive: false })));
  };

  const toggleTrack = (id: string) => {
    setTracks(prev =>
      prev.map(t => (t.id === id ? { ...t, isActive: !t.isActive } : t))
    );
  };

  const updateVolume = (id: string, volume: number) => {
    setTracks(prev =>
      prev.map(t => (t.id === id ? { ...t, volume } : t))
    );
  };

  const savePreset = async () => {
    if (!presetName.trim()) {
      Alert.alert(t('common.error'), t('mixer.presetNamePlaceholder'));
      return;
    }

    try {
      const activeTracks = tracks
        .filter(t => t.isActive)
        .map(t => ({ id: t.id, volume: t.volume, isActive: true }));
      
      if (activeTracks.length === 0) {
        Alert.alert(t('common.error'), t('mixer.emptyTracksError'));
        return;
      }

      const newPreset: SavedPreset = {
        id: Date.now().toString(),
        name: presetName.trim(),
        tracks: activeTracks,
        createdAt: Date.now(),
      };

      const existingPresetsJson = await AsyncStorage.getItem('@mixer_presets');
      const existingPresets: SavedPreset[] = existingPresetsJson ? JSON.parse(existingPresetsJson) : [];
      
      await AsyncStorage.setItem(
        '@mixer_presets',
        JSON.stringify([newPreset, ...existingPresets])
      );

      ToastUtil.success(t('common.success'));
      setShowSaveModal(false);
      setPresetName('');
    } catch (e) {
      ToastUtil.error(t('common.error'));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderTrackCard = (track: TrackState) => {
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      let loop: Animated.CompositeAnimation | null = null;
      if (track.isActive) {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        );
        loop.start();
      } else {
        glowAnim.setValue(0);
      }
      return () => {
        if (loop) loop.stop();
      };
    }, [track.isActive]);

    return (
      <View key={track.id} style={styles.trackCard}>
        {track.isActive && (
          <Animated.View 
            style={[
              styles.glowBorder, 
              { opacity: glowAnim }
            ]} 
          />
        )}
        <View style={styles.trackHeader}>
          <Text style={[styles.trackTitle, track.isActive && { color: GOLD }]}>
            {t(track.title)}
          </Text>
          <TouchableOpacity 
            onPress={() => toggleTrack(track.id)}
            style={[styles.toggleBtn, track.isActive && styles.toggleBtnActive]}
          >
            <Icon 
              name={track.isActive ? "pause" : "play"} 
              size={18} 
              color={track.isActive ? BG_DARK : GOLD} 
            />
          </TouchableOpacity>
        </View>
        
        <View style={styles.sliderRow}>
          <Icon name="volume-1" size={16} color="rgba(255,255,255,0.4)" />
          <Slider
            style={styles.slider}
            value={track.volume}
            minimumValue={0}
            maximumValue={1}
            minimumTrackTintColor={GOLD}
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor={GOLD}
            onValueChange={(v) => updateVolume(track.id, v)}
          />
          <Icon name="volume-2" size={16} color="rgba(255,255,255,0.4)" />
        </View>

        {track.isActive && (
          <Video
            source={{ uri: `${REMOTE_RESOURCE_BASE_URL}${track.filename}` }}
            repeat
            paused={!track.isActive}
            volume={track.volume}
            playInBackground
            playWhenInactive
            ignoreSilentSwitch="ignore"
          />
        )}
      </View>
    );
  };

  return (
    <View style={{ 
      flex: 1, 
      backgroundColor: '#121212', 
      paddingTop: Platform.OS === 'ios' ? 50 : 30, 
    }}> 
      <ScrollView bounces={false} style={{ flex: 1 }}> 
 
         <View style={{ height: 60, justifyContent: 'center', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}> 
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
              <Icon name="chevron-left" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 18 }}>{t('mixer.title')}</Text> 
         </View> 
  
 
         <View style={{ marginTop: 40, paddingHorizontal: 20 }}> 
            <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#fff' }}> 
               {currentSceneName} 
            </Text> 
         </View> 
 
 
         <TouchableOpacity 
           onPress={() => setShowSaveModal(true)}
           style={{ 
             marginTop: 30, 
             marginHorizontal: 20, 
             height: 54, 
             backgroundColor: '#D4AF37', 
             borderRadius: 12, 
             alignItems: 'center', 
             justifyContent: 'center' 
           }}
         > 
            <Text style={{ color: '#000', fontWeight: 'bold' }}>{t('mixer.saveConfig')}</Text> 
         </TouchableOpacity> 
 
 
         <View style={{ marginTop: 30, paddingHorizontal: 20, paddingBottom: 50 }}> 
            <View style={styles.tracksGrid}>
              {tracks.map(renderTrackCard)}
            </View>
         </View> 
      </ScrollView> 
 
      {showSaveModal && (
        <View style={styles.modalOverlay}>
          <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={10} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('mixer.saveConfig')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('mixer.presetNamePlaceholder')}
              placeholderTextColor="#555"
              value={presetName}
              onChangeText={setPresetName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                onPress={() => setShowSaveModal(false)}
                style={styles.modalBtn}
              >
                <Text style={styles.modalBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={savePreset}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                <Text style={styles.modalBtnTextPrimary}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tracksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  trackCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
    overflow: 'hidden',
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: 20,
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: GOLD,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    height: 40,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  modalBtnPrimary: {
    backgroundColor: GOLD,
    marginLeft: 12,
  },
  modalBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  modalBtnTextPrimary: {
    color: BG_DARK,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
