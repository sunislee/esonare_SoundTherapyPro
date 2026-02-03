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
import AudioService from '../services/AudioService';
import ToastUtil from '../utils/ToastUtil';

const { width } = Dimensions.get('window');

// 助手函数：安全获取原生模块引用
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
          console.error('Failed to get player count', e);
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
    ToastUtil.info('正在重启音频引擎...');
    try {
      // 1. JS 层停止
      await AudioService.stop();
      
      // 2. 物理杀掉所有原生 ExoPlayer
      const mod = getNativeAudioModule();
      if (mod) {
        try {
          // 调用 Native 层物理清理接口
          if (typeof mod.stop === 'function') {
            await mod.stop();
          }
          
          // 如果有 getPlayerCount，验证是否归零
          if (typeof mod.getPlayerCount === 'function') {
            const count = await mod.getPlayerCount();
            console.log(`[Restart] 原生播放器计数: ${count}`);
          }
        } catch (nativeError) {
          console.warn('Native cleanup failed', nativeError);
        }
      }

      // 3. 强制延迟，确保底层资源释放
      await new Promise<void>(resolve => setTimeout(resolve, 1200));

      // 4. 重新初始化 JS Player
      await AudioService.setupPlayer();
      
      ToastUtil.success('音频引擎已彻底重置');
      onClose(); // 重启成功后关闭面板
    } catch (e) {
      console.error('Restart audio failed', e);
      ToastUtil.error('重启失败: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  };

  const toggleDebugLog = async (value: boolean) => {
    setDebugLogEnabled(value);
    await AsyncStorage.setItem('@debug_log_enabled', value ? 'true' : 'false');
    ToastUtil.info(value ? '调试日志已开启' : '调试日志已关闭');
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
              <Text style={styles.title}>高级调试</Text>

              {/* 1. 一键音频重启 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>救命功能</Text>
                <TouchableOpacity 
                  style={styles.restartButton}
                  onPress={handleRestartAudio}
                >
                  <Text style={styles.restartButtonText}>🚀 一键音频重启</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>声音卡死或逻辑异常时点此复活</Text>
              </View>

              {/* 2. 原生状态监视器 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>原生状态监视器</Text>
                <View style={styles.statsContainer}>
                  <Text style={styles.statsText}>Active Scene: <Text style={styles.statsValue}>{currentSceneId}</Text></Text>
                  <Text style={styles.statsText}>Native Players: <Text style={styles.statsValue}>{allPlayersCount}</Text></Text>
                </View>
              </View>

              {/* 3. 日志开关 */}
              <View style={styles.section}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles.sectionTitle}>日志开关</Text>
                    <Text style={styles.hint}>开启后显示 RENDER_CHECK 日志</Text>
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
                <Text style={styles.closeButtonText}>关闭</Text>
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
