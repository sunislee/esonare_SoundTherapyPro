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
  NativeModules,
} from 'react-native';

const { NativeAudioModule } = NativeModules;
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioService from '../services/AudioService';
import { Typography } from '../theme/Typography';
import ToastUtil from '../utils/ToastUtil';
import { useFocusEffect } from '@react-navigation/native';

type MixPreset = {
  id: string;
  name: string;
  sceneId: string;
  mainVolume: number;
  rainVolume: number;
  fireVolume: number;
  ambientType: AmbientType;
};

const SimpleJsSlider = ({ value, onValueChange, onSlidingComplete, activeColor = '#4a90e2' }: any) => {
  const [width, setWidth] = useState(0);
  const isDragging = useRef(false);

  return (
    <View 
      style={{ width: '100%', height: 40, justifyContent: 'center' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setWidth(w);
      }}
    >
      <PanGestureHandler
        onGestureEvent={(e) => {
          if (width > 0) {
            const newVal = e.nativeEvent.x / width;
            const safeValue = Math.max(0.001, Math.min(0.999, newVal));
            onValueChange(safeValue);
          }
        }}
        onHandlerStateChange={(e) => {
          if (e.nativeEvent.state === State.BEGAN) {
            isDragging.current = true;
            const newVal = e.nativeEvent.x / width;
            const safeValue = Math.max(0.001, Math.min(0.999, newVal));
            onValueChange(safeValue);
          }
          if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
            isDragging.current = false;
            const newVal = e.nativeEvent.x / width;
            const safeValue = Math.max(0.001, Math.min(0.999, newVal));
            onSlidingComplete(safeValue);
          }
        }}
        activeOffsetX={[-10, 10]} // Help distinguish from ScrollView scroll
      >
        <Animated.View style={StyleSheet.absoluteFill}>
          <View style={{ width: '100%', height: 40, justifyContent: 'center' }}>
            {/* Visual Track & Thumb */}
            <View style={{height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', width: '100%', position: 'absolute'}} pointerEvents="none"/>
            <View style={{height: 6, borderRadius: 3, backgroundColor: activeColor, width: `${value * 100}%`, position: 'absolute'}} pointerEvents="none"/>
            <View style={{
              width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
              position: 'absolute', left: `${value * 100}%`, marginLeft: -10,
              shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5
            }} pointerEvents="none"/>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};

type AmbientType = 'none' | 'rain' | 'fire';

type Props = {
  visible: boolean;
  currentAmbient: AmbientType;
  currentSceneId: string;
  onClose: () => void;
  onSelect: (type: AmbientType) => void;
  onRestoreMix: (mix: MixPreset) => void;
};

const SNAP_THRESHOLD = 50;

export const AmbientPickerSheet: React.FC<Props> = ({
  visible,
  currentAmbient,
  currentSceneId,
  onClose,
  onSelect,
  onRestoreMix,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const [mainVolume, setMainVolume] = useState(1.0);
  const [rainVolume, setRainVolume] = useState(0.3);
  const [fireVolume, setFireVolume] = useState(0.3);
  
  // Mix Presets
  const [isSaving, setIsSaving] = useState(false);
  const [mixName, setMixName] = useState('');
  const [savedMixes, setSavedMixes] = useState<MixPreset[]>([]);

  const loadMixes = useCallback(() => {
    AsyncStorage.getItem('@mix_presets')
      .then(json => {
        if (json) {
          setSavedMixes(JSON.parse(json));
        } else {
          setSavedMixes([]);
        }
      })
      .catch(err => console.error('Failed to load mixes:', err));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMixes();
    }, [loadMixes])
  );

  useEffect(() => {
    if (visible) {
      loadMixes();
    }
  }, [visible, loadMixes]);

  const [isEditing, setIsEditing] = useState(false);

  const saveMix = async (name: string) => {
    const finalName = name.trim() || mixName.trim();
    if (!finalName) {
      ToastUtil.error('请输入方案名称');
      return;
    }
    
    const newMix: MixPreset = {
      id: Date.now().toString(),
      name: finalName,
      sceneId: currentSceneId,
      mainVolume: AudioService.getVolume(),
      rainVolume: rainVolume,
      fireVolume: fireVolume,
      ambientType: currentAmbient,
    };
    
    const newMixes = [newMix, ...savedMixes];
    setSavedMixes(newMixes);
    await AsyncStorage.setItem('@mix_presets', JSON.stringify(newMixes));
    
    Alert.alert('保存成功', `已保存为：${finalName}`);
    setIsEditing(false);
    setMixName('');
  };

  const startEditing = () => {
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}月${now.getDate()}日 混音`;
    setMixName(timeStr);
    setIsEditing(true);
  };

  const handleDeleteMix = async (id: string) => {
    const newMixes = savedMixes.filter(m => m.id !== id);
    setSavedMixes(newMixes);
    await AsyncStorage.setItem('@mix_presets', JSON.stringify(newMixes));
  };

  useEffect(() => {
    if (visible) {
      const onBackPress = () => {
        onClose();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      // Load stored volumes
      setMainVolume(AudioService.getVolume());
      AudioService.getStoredVolume('healing_rain').then(setRainVolume);
      AudioService.getStoredVolume('life_fire_pure').then(setFireVolume);

      // Open animation
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 12,
      }).start();
    } else {
      // Force pop up for debug if needed - set to 0 to keep open
      // toValue: 0, 
      
      // Close animation
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, screenHeight, translateY]);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY, velocityY } = event.nativeEvent;
      const isClosing = translationY > SNAP_THRESHOLD || velocityY > 500;

      if (isClosing) {
        onClose();
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
          speed: 12,
        }).start();
      }
    }
  };

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  const handleVolumeChange = (type: 'main' | 'rain' | 'fire', value: number) => {
    if (type === 'main') {
      setMainVolume(value);
      AudioService.setVolume(value); 
    } else if (type === 'rain') {
      setRainVolume(value);
      if (currentAmbient === 'rain') {
        AudioService.updateAmbientVolume(value);
      }
    } else {
      setFireVolume(value);
      if (currentAmbient === 'fire') {
        AudioService.updateAmbientVolume(value);
      }
    }
  };

  const handleSlidingComplete = (type: 'main' | 'rain' | 'fire', value: number) => {
    if (type === 'main') {
      // Already handled
    } else if (type === 'rain') {
      if (currentAmbient === 'rain') {
        AudioService.updateAmbientVolume(value);
      } else {
        AsyncStorage.setItem('@ambient_volume_healing_rain', String(value)).catch(() => {});
      }
    } else {
      if (currentAmbient === 'fire') {
        AudioService.updateAmbientVolume(value);
      } else {
        AsyncStorage.setItem('@ambient_volume_life_fire_pure', String(value)).catch(() => {});
      }
    }
  };

  const renderMainVolume = () => {
    return (
      <View style={[styles.itemContainer, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.08)' }]}>
        <View style={styles.headerRow}>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemTitle, styles.itemTitleActive]}>🔊 场景主音量</Text>
            <Text style={styles.itemDesc}>控制当前场景的基础音量</Text>
          </View>
        </View>
        
        <View style={styles.sliderContainer}>
            <SimpleJsSlider
              value={mainVolume}
              activeColor="#fff"
              onValueChange={(v: number) => handleVolumeChange('main', v)}
              onSlidingComplete={(v: number) => handleSlidingComplete('main', v)}
            />
          </View>
      </View>
    );
  };

  const renderItem = (type: 'rain' | 'fire', title: string, volume: number) => {
    const isSelected = currentAmbient === type;
    
    return (
      <View style={[styles.itemContainer, isSelected && styles.itemSelected]}>
        <TouchableOpacity
          style={styles.headerRow}
          activeOpacity={0.7}
          onPress={() => {
            triggerHaptic();
            if (isSelected) {
              onSelect('none');
            } else {
              onSelect(type);
            }
          }}
        >
          <View style={styles.itemInfo}>
            <Text style={[styles.itemTitle, isSelected && styles.itemTitleActive]}>{title}</Text>
            <Text style={styles.itemDesc}>
              {isSelected ? '点击关闭' : '点击开启'}
            </Text>
          </View>
          <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
            {isSelected && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>
        
        <View style={styles.sliderContainer}>
            <SimpleJsSlider
              value={volume}
              activeColor={isSelected ? '#fff' : 'rgba(255,255,255,0.3)'}
              onValueChange={(v: number) => handleVolumeChange(type, v)}
              onSlidingComplete={(v: number) => handleSlidingComplete(type, v)}
            />
          </View>
      </View>
    );
  };

  if (!visible) return null;

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, screenHeight],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdropContainer, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: Animated.diffClamp(translateY, 0, screenHeight) }] },
        ]}
      >
        {/* iOS 返回按钮同步自 ImmersivePlayerScreen */}
        <TouchableOpacity 
          style={[
            styles.backButton, 
            Platform.select({
              ios: { 
                paddingTop: insets.top + 10,
                backgroundColor: 'transparent',
                elevation: 10,
                zIndex: 9999,
              },
              android: { top: 25 }
            })
          ]}
          onPress={onClose}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Icon name="chevron-back" size={30} color="#FFFFFF" style={{ opacity: 1, zIndex: 10000 }} />
        </TouchableOpacity>

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View style={[
            styles.handleContainer,
            Platform.OS === 'ios' && { paddingTop: insets.top + 40 }
          ]}>
            <View style={styles.handle} />
            <Text style={styles.headerTitle}>氛围点缀</Text>
          </Animated.View>
        </PanGestureHandler>

        <ScrollView style={{flex: 1}} contentContainerStyle={styles.content}>
          {isEditing ? (
            <View style={{
              height: 50, 
              width: '90%', 
              backgroundColor: 'rgba(255,255,255,0.1)', 
              borderRadius: 16, 
              flexDirection: 'row',
              alignItems: 'center', 
              marginVertical: 20,
              paddingHorizontal: 16,
              alignSelf: 'center'
            }}>
              <TextInput
                style={{
                  flex: 1,
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: 16,
                  height: '100%'
                }}
                value={mixName}
                onChangeText={setMixName}
                autoFocus={true}
                selectionColor="#4a90e2"
                onSubmitEditing={() => saveMix(mixName)}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={() => saveMix(mixName)} style={{marginLeft: 10, padding: 5}}>
                <Text style={{color: '#4a90e2', fontSize: 18, fontWeight: 'bold'}}>✅</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={{
                height: 50, 
                width: '90%', 
                backgroundColor: 'rgba(255,255,255,0.1)', 
                borderRadius: 12, 
                justifyContent: 'center', 
                alignItems: 'center', 
                marginVertical: 20,
                alignSelf: 'center'
              }} 
              onPress={startEditing} 
            > 
              <Text style={{color: 'white', fontWeight: 'bold', fontSize: 16}}>点击保存当前混音</Text> 
            </TouchableOpacity>
          )}

          {renderMainVolume()}
          {renderItem('rain', '治愈雨声', rainVolume)}
          {renderItem('fire', '壁炉篝火', fireVolume)}

          <View style={{ marginTop: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.headerTitle}>我的最爱混音</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
              {savedMixes.map(mix => (
                <TouchableOpacity
                  key={mix.id}
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.08)', 
                    borderRadius: 12, 
                    padding: 12, 
                    marginRight: 12,
                    minWidth: 100
                  }}
                  onPress={() => {
                    onRestoreMix(mix);
                    if (mix.mainVolume !== undefined) setMainVolume(mix.mainVolume);
                    if (mix.rainVolume !== undefined) setRainVolume(mix.rainVolume);
                    if (mix.fireVolume !== undefined) setFireVolume(mix.fireVolume);
                    ToastUtil.success(`已应用：${mix.name}`);
                  }}
                  onLongPress={() => {
                    Alert.alert('删除方案', `确定要删除 "${mix.name}" 吗？`, [
                      { text: '取消', style: 'cancel' },
                      { text: '删除', style: 'destructive', onPress: () => handleDeleteMix(mix.id) }
                    ]);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>{mix.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    主音量 {Math.round(mix.mainVolume * 100)}%
                  </Text>
                </TouchableOpacity>
              ))}
              {savedMixes.length === 0 && (
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>暂无保存的方案</Text>
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000, justifyContent: 'flex-end' },
  backdropContainer: { ...StyleSheet.absoluteFillObject },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: 'rgba(20, 23, 30, 0.98)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    width: '100%',
    height: '100%',
    position: 'absolute',
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 24,
    overflow: 'hidden',
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 10,
    paddingHorizontal: 20,
    zIndex: 9999,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    width: '100%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  itemContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  itemSelected: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 17,
    color: 'rgba(255,255,255,0.6)',
  },
  itemTitleActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  itemDesc: {
    fontFamily: Typography.fontFamily,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#fff',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  sliderContainer: {
    marginTop: 8,
  },
});
