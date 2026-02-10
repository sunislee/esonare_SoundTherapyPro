import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Switch,
  NativeModules,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { State } from 'react-native-track-player';
import { useTranslation } from 'react-i18next';
import AudioService from '../services/AudioService';
import ToastUtil from '../utils/ToastUtil';

const { width } = Dimensions.get('window');

const getNativeAudioModule = () => {
  return NativeModules && NativeModules.NativeAudioModule ? NativeModules.NativeAudioModule : null;
};

interface AdvancedDebugModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AdvancedDebugModal: React.FC<AdvancedDebugModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  const [debugLogEnabled, setDebugLogEnabled] = useState(false);
  const [currentSceneId, setCurrentSceneId] = useState('none');
  const [allPlayersCount, setAllPlayersCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (visible) {
      setShowModal(true);
      
      // Load settings
      AsyncStorage.getItem('@debug_log_enabled').then(val => {
        setDebugLogEnabled(val === 'true');
      });

      // Update stats immediately and then periodically
      const updateStats = async () => {
    const scene = AudioService.getCurrentScene();
    setCurrentSceneId(scene?.id || 'none');
    
    const mod = getNativeAudioModule();
    try {
      if (mod && typeof mod.getPlayerCount === 'function') {
        const count = await mod.getPlayerCount();
        setAllPlayersCount(count);
      } else {
        // Fallback estimate
        let count = 0;
        if (AudioService.getCurrentState() === State.Playing) count++;
        if ((AudioService as any).ambientSound) count++;
        setAllPlayersCount(count);
      }
    } catch (e) {
      // Failed to get player count
    }
  };

      updateStats();
      interval = setInterval(updateStats, 2000);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [visible, fadeAnim, scaleAnim]);

  const handleRestartAudio = async () => {
    ToastUtil.info(t('player.debug.restarting'));
    try {
      await AudioService.stop();
      
      const mod = getNativeAudioModule();
      if (mod) {
        try {
          if (typeof mod.stop === 'function') {
            await mod.stop();
          }
          
          if (typeof mod.getPlayerCount === 'function') {
            const count = await mod.getPlayerCount();
            setAllPlayersCount(count);
          }
        } catch (nativeError) {
          console.warn('Native cleanup failed', nativeError);
        }
      }

      await new Promise<void>(resolve => setTimeout(resolve, 1200));

      await AudioService.setupPlayer();
      
      ToastUtil.success(t('player.debug.restartSuccess'));
      onClose(); 
    } catch (e) {
      console.error('Restart audio failed', e);
      const errorMessage = e instanceof Error ? e.message : t('player.debug.unknownError');
      ToastUtil.error(t('player.debug.restartFailed', { error: errorMessage }));
    }
  };

  const toggleDebugLog = async (value: boolean) => {
    setDebugLogEnabled(value);
    await AsyncStorage.setItem('@debug_log_enabled', value ? 'true' : 'false');
    ToastUtil.info(value ? t('player.debug.logEnabled') : t('player.debug.logDisabled'));
  };

  if (!showModal) return null;

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.modalContainer,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: fadeAnim,
                },
              ]}
            >
              <Text style={styles.title}>{t('player.debug.title')}</Text>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('player.debug.restartTitle')}</Text>
                <TouchableOpacity 
                  style={styles.restartButton}
                  onPress={handleRestartAudio}
                >
                  <Text style={styles.restartButtonText}>{t('player.debug.restartButton')}</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>{t('player.debug.restartHint')}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('player.debug.monitorTitle')}</Text>
                <View style={styles.statsContainer}>
                  <Text style={styles.statsText}>{t('player.debug.activeScene')}: <Text style={styles.statsValue}>{currentSceneId}</Text></Text>
                  <Text style={styles.statsText}>{t('player.debug.nativePlayers')}: <Text style={styles.statsValue}>{allPlayersCount}</Text></Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles.sectionTitle}>{t('player.debug.logToggle')}</Text>
                    <Text style={styles.hint}>{t('player.debug.logHint')}</Text>
                  </View>
                  <Switch
                    value={debugLogEnabled}
                    onValueChange={toggleDebugLog}
                    trackColor={{ false: '#3E3E3E', true: '#4A90E2' }}
                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : debugLogEnabled ? '#FFFFFF' : '#F4F3F4'}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
              >
                <Text style={styles.closeButtonText}>{t('player.debug.close')}</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.85,
    backgroundColor: '#1C1E2D',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  restartButton: {
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  restartButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
  },
  statsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 12,
  },
  statsText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statsValue: {
    color: '#4A90E2',
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
  },
});
