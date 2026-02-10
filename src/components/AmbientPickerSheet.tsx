import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Portal } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudio } from '../context/AudioContext';
import AudioService from '../services/AudioService';
import ToastUtil from '../utils/ToastUtil';

const SimpleJsSlider = ({ value, onValueChange, onSlidingComplete, activeColor = '#D4AF37', disabled = false }: any) => {
  const [width, setWidth] = useState(0);
  
  const getDynamicColor = () => {
    if (disabled) return 'rgba(100, 100, 100, 0.3)';
    if (activeColor !== '#D4AF37') return activeColor;
    const opacity = 0.3 + (value * 0.7);
    return `rgba(212, 175, 55, ${opacity})`;
  };

  return (
    <View 
      style={{ width: '100%', height: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      <PanGestureHandler
        enabled={!disabled}
        onGestureEvent={(e) => {
          if (width > 0) {
            const newVal = e.nativeEvent.x / width;
            onValueChange(Math.max(0, Math.min(1, newVal)));
          }
        }}
        onHandlerStateChange={(e) => {
          if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
            const newVal = e.nativeEvent.x / width;
            onSlidingComplete(Math.max(0, Math.min(1, newVal)));
          }
        }}
      >
        <View style={{ width: '100%', height: 44, justifyContent: 'center' }}>
          <View style={{height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', width: '100%', position: 'absolute'}} />
          <View style={{height: 6, borderRadius: 3, backgroundColor: getDynamicColor(), width: `${value * 100}%`, position: 'absolute'}} />
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: disabled ? '#666' : '#fff',
            position: 'absolute', left: `${value * 100}%`, marginLeft: -12,
            elevation: 4, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.3, shadowRadius: 3
          }} />
        </View>
      </PanGestureHandler>
    </View>
  );
};

type AmbientType = 'none' | 'fireplace' | 'summer';
type MixPreset = { id: string; name: string; sceneId: string; mainVolume: number; rainVolume: number; fireVolume: number; ambientType: AmbientType; };

type Props = {
  visible: boolean;
  currentAmbient: AmbientType;
  currentSceneId: string;
  onClose: () => void;
  onSelect: (type: AmbientType) => void;
  onRestoreMix: (mix: MixPreset) => void;
};

export const AmbientPickerSheet: React.FC<Props> = ({
  visible,
  currentAmbient,
  currentSceneId,
  onClose,
  onSelect,
  onRestoreMix,
}) => {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  const sheetHeight = screenHeight * 0.75;
  
  const hiddenValue = sheetHeight + 100; // Extra padding to ensure hidden
  const visibleValue = 0; 
  const translateY = useRef(new Animated.Value(hiddenValue)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  const handleOpacity = dragY.interpolate({
    inputRange: [0, 150],
    outputRange: [0.4, 0.8],
    extrapolate: 'clamp',
  });

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: dragY } }],
    { useNativeDriver: true }
  );

  const animatedDragY = dragY.interpolate({
    inputRange: [0, 500],
    outputRange: [0, 350], 
    extrapolate: 'clamp',
  });

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      if (event.nativeEvent.translationY > 150) {
        onClose();
      } else {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      }
    }
  };

  const { 
    updateAmbientVolume, 
    setAmbient, 
    getAmbientVolumeById,
    activeSmallSceneIds,
    isPlaying: globalIsPlaying 
  } = useAudio();
  
  const [mainVolume, setMainVolume] = useState(1.0);
  const [fireplaceVolume, setFireplaceVolume] = useState(0.3);
  const [summerVolume, setSummerVolume] = useState(0.3);
  const [isEditing, setIsEditing] = useState(false);
  const [mixName, setMixName] = useState('');
  const [savedMixes, setSavedMixes] = useState<MixPreset[]>([]);

  const loadMixes = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem('@mix_presets');
      if (json) setSavedMixes(JSON.parse(json));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (visible) {
      loadMixes();
      setMainVolume(AudioService.getVolume());
      setFireplaceVolume(getAmbientVolumeById('life_fireplace'));
      setSummerVolume(getAmbientVolumeById('life_summer'));
      
      dragY.setValue(0); 
      Animated.spring(translateY, {
        toValue: visibleValue,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: hiddenValue,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, hiddenValue, visibleValue, loadMixes, getAmbientVolumeById]);

  const saveMix = async () => {
    const name = mixName.trim() || t('player.ambient.defaultMixName', {
      month: new Date().getMonth() + 1,
      day: new Date().getDate()
    });
    const newMix = { id: Date.now().toString(), name, sceneId: currentSceneId, mainVolume, rainVolume: 0, fireVolume: fireplaceVolume, ambientType: currentAmbient };
    const updated = [newMix, ...savedMixes];
    setSavedMixes(updated);
    await AsyncStorage.setItem('@mix_presets', JSON.stringify(updated));
    setIsEditing(false);
    setMixName('');
    Alert.alert(t('player.ambient.success'), t('player.ambient.saveSuccess'));
  };

  const handleVolumeChange = (type: 'main' | 'fireplace' | 'summer', val: number) => {
    if (type === 'main') { 
      setMainVolume(val); 
      AudioService.setVolume(val); 
    }
    else if (type === 'fireplace') { 
      setFireplaceVolume(val); 
      if (getIsActive('fireplace')) updateAmbientVolume(val); 
    }
    else if (type === 'summer') { 
      setSummerVolume(val); 
      if (getIsActive('summer')) updateAmbientVolume(val); 
    }
  };

  const handleSelect = async (type: AmbientType) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    
    await setAmbient(null);

    if (type === 'none') {
      onSelect('none');
      return;
    }

    const idMap: Record<string, string | null> = {
      'fireplace': 'life_fireplace',
      'summer': 'life_summer'
    };
    
    const targetId = idMap[type];
    
    if (targetId) {
      await setAmbient(targetId);
    }
    
    onSelect(type);
  };

  if (!visible) return null;

  const getIsActive = (type: AmbientType) => {
    if (type === 'fireplace') return (activeSmallSceneIds || []).includes('life_fireplace');
    if (type === 'summer') return (activeSmallSceneIds || []).includes('life_summer');
    return false;
  };

  const getAmbientIcon = (type: AmbientType) => {
    switch(type) {
      case 'fireplace': return "flame-outline";
      case 'summer': return "sunny-outline";
      default: return "musical-notes-outline";
    }
  };

  const getAmbientLabel = (type: AmbientType) => {
    switch(type) {
      case 'fireplace': return `  ${t('player.labels.fireplace')}`;
      case 'summer': return `  ${t('player.labels.summer')}`;
      default: return "";
    }
  };

  return (
    <Portal>
      <View style={styles.overlay}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View 
            renderToHardwareTextureAndroid={false}
            needsOffscreenAlphaCompositing={false}
            style={[
              styles.sheet, 
              { 
                height: sheetHeight,
                marginBottom: insets.bottom + 20,
                transform: [
                  { translateY: Animated.add(translateY, animatedDragY) }
                ],
                backgroundColor: '#121212',
                opacity: 1
              }
            ]}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#121212', zIndex: -1 }]} />
     
            <View style={{ 
              paddingTop: insets.top, 
              backgroundColor: '#121212', 
              width: '100%',
            }}>
              <View style={styles.handleContainer}>
                <Animated.View style={styles.handle} />
              </View>
            </View>
          
          <View style={styles.navHeader}>
            <TouchableOpacity style={styles.backButton} onPress={onClose}>
              <Icon name="chevron-down" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitleText}>{t('player.ambient.controlTitle')}</Text>
            <View style={{ width: 50 }} /> 
          </View>

          <ScrollView 
            style={{ flex: 1, backgroundColor: '#121212' }} 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.saveSection}>
              {isEditing ? (
                <View style={styles.inputBox}>
                  <TextInput 
                    style={styles.textInput} 
                    value={mixName} 
                    onChangeText={setMixName} 
                    placeholder={t('player.ambient.inputPlaceholder')}
                    placeholderTextColor="#555"
                    autoFocus
                  />
                  <TouchableOpacity onPress={saveMix}>
                    <Icon name="checkmark-circle" size={32} color="#D4AF37" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.saveButton} onPress={() => setIsEditing(true)}>
                  <Icon name="save-outline" size={20} color="#000" />
                  <Text style={styles.saveButtonText}>{t('player.ambient.saveMix')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.groupLabel}>{t('player.ambient.mainVolume')}</Text>
            <View style={styles.volumeCard}>
              <SimpleJsSlider value={mainVolume} onValueChange={(v:any)=>handleVolumeChange('main',v)} onSlidingComplete={()=>{}} activeColor="#fff" />
            </View>

            <Text style={styles.groupLabel}>{t('player.ambient.ambientOverlay')}</Text>
            {(['fireplace', 'summer'] as AmbientType[]).map((type) => {
              const isActive = getIsActive(type);
              const volume = type === 'fireplace' ? fireplaceVolume : summerVolume;
              return (
                <View key={type} style={[styles.volumeCard, isActive && styles.activeCard]}>
                  <TouchableOpacity style={styles.cardHeader} onPress={() => {
                    handleSelect(isActive ? 'none' : type);
                  }}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                       <Icon name={getAmbientIcon(type)} size={20} color={isActive ? "#D4AF37" : "#666"} />
                       <Text style={[styles.cardTitle, isActive && {color: '#fff', fontWeight: 'bold'}]}>
                         {getAmbientLabel(type)}
                       </Text>
                    </View>
                    <Icon name={isActive ? "radio-button-on" : "radio-button-off"} size={22} color={isActive ? "#D4AF37" : "#444"} />
                  </TouchableOpacity>
                  
                  <SimpleJsSlider 
                    value={volume} 
                    onValueChange={(v: any) => handleVolumeChange(type as any, v)}
                    onSlidingComplete={() => {}}
                    disabled={!isActive}
                  />
                </View>
              );
            })}

            <View style={styles.presetSection}>
              <Text style={styles.groupLabel}>{t('player.ambient.myFavorites')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 10}}>
                {savedMixes.map(mix => (
                  <TouchableOpacity key={mix.id} style={styles.presetItem} onPress={() => {
                    onRestoreMix(mix);
                    setMainVolume(mix.mainVolume); 
                    setFireplaceVolume(mix.fireVolume); 
                    ToastUtil.success(t('player.ambient.applied', { name: mix.name }));
                  }}>
                    <Text style={{color: '#fff', fontWeight: 'bold'}} numberOfLines={1}>{mix.name}</Text>
                    <Text style={{color: '#555', fontSize: 11, marginTop: 4}}>{t('player.ambient.mainVolumeLabel')} {Math.round(mix.mainVolume*100)}%</Text>
                  </TouchableOpacity>
                ))}
                {savedMixes.length === 0 && (
                  <Text style={{color: '#333', fontSize: 13, marginTop: 10, fontStyle: 'italic'}}>{t('player.ambient.noPresets')}</Text>
                )}
              </ScrollView>
            </View>
          </ScrollView>
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: { 
    ...StyleSheet.absoluteFillObject, 
    zIndex: 9999, 
    elevation: 9999 
  },
  sheet: {
    position: 'absolute', 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: '#121212', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: -20 }, 
    shadowOpacity: 0.8, 
    shadowRadius: 30,
    elevation: 20,
    overflow: 'visible',
  },
  handleContainer: { 
    alignItems: 'center', 
    paddingVertical: 12,
    marginTop: 10,
  },
  handle: { 
    width: 40, 
    height: 4, 
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  navHeader: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 15, 
    height: 50, 
    backgroundColor: '#121212'
  },
  backButton: { padding: 5 },
  headerTitleText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 }, 
  saveSection: { marginVertical: 10 },
  saveButton: {
    backgroundColor: '#D4AF37', height: 52, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center'
  },
  saveButtonText: { color: '#000', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  inputBox: {
    backgroundColor: '#1a1a1a', height: 52, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15,
    borderWidth: 1, borderColor: '#333'
  },
  textInput: { flex: 1, color: '#fff', fontSize: 16 },
  groupLabel: { color: '#444', fontSize: 12, fontWeight: 'bold', marginTop: 25, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  volumeCard: { backgroundColor: '#181818', borderRadius: 24, padding: 18, marginBottom: 15 },
  activeCard: { backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#D4AF3733' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: '#777', fontSize: 16 },
  presetSection: { marginTop: 30, borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 20 },
  presetItem: { backgroundColor: '#181818', padding: 16, borderRadius: 18, marginRight: 12, minWidth: 120, borderWidth: 1, borderColor: '#222' }
});
