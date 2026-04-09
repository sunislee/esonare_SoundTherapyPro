import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  Alert,
  Easing,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';
import { RootStackParamList } from '../navigation/MainNavigator';
import { Typography } from '../theme/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  initNoiseAudio,
  playNoiseAudio,
  stopNoiseAudio,
  cleanupNoiseAudio,
  getCurrentMode,
} from '../services/NoiseAudioService';
import {
  requestMicrophonePermission,
  checkMicrophonePermission,
  openAppSettings,
  type PermissionStatus,
} from '../services/PermissionService';
import { AudioAnalyzer, type SceneType } from '../services/AudioAnalyzer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const NoiseCancellationScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  // 降噪模式选项
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // 智能场景识别状态
  const [isSmartEnabled, setIsSmartEnabled] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [currentScene, setCurrentScene] = useState<SceneType>('unknown');
  
  // 动画值
  const fadeAnim = new Animated.Value(0);
  const breathAnim = useRef(new Animated.Value(1)).current;
  
  // 初始化音频
  useEffect(() => {
    console.log('[NoiseCancellation] 初始化音频服务');
    initNoiseAudio();
    
    // 淡入动画
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // 恢复上次选择的模式
    const lastMode = getCurrentMode();
    if (lastMode) {
      setSelectedMode(lastMode);
      setIsPlaying(true);
      playNoiseAudio(lastMode);
    }
    
    // 检查权限状态
    checkMicrophonePermission().then(status => {
      setPermissionStatus(status);
      console.log('[NoiseCancellation] 权限状态:', status);
    });
    
    return () => {
      console.log('[NoiseCancellation] 页面卸载，清理资源');
      cleanupNoiseAudio();
      AudioAnalyzer.stop();
    };
  }, []);
  
  // 呼吸动画（智能卡片开启时 - 持续低频呼吸）
  useEffect(() => {
    console.log(`[NoiseCancellation] 呼吸动画：isSmartEnabled=${isSmartEnabled}`);
    if (isSmartEnabled) {
      console.log('[NoiseCancellation] 启动呼吸动画');
      // 低频呼吸动画（2 秒一次），让用户知道 App 还在"努力听"
      const breathAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.15,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breathAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      breathAnimation.start();
      console.log('[NoiseCancellation] 呼吸动画已启动');
      
      return () => {
        breathAnimation.stop();
        console.log('[NoiseCancellation] 呼吸动画已停止');
      };
    } else {
      breathAnim.setValue(1);
      console.log('[NoiseCancellation] 呼吸动画已重置');
    }
  }, [isSmartEnabled]);
  
  // 监听页面聚焦/离开
  useFocusEffect(
    React.useCallback(() => {
      console.log('[NoiseCancellation] 页面聚焦');
      // 页面聚焦时，如果已有模式，继续播放
      const lastMode = getCurrentMode();
      if (lastMode) {
        playNoiseAudio(lastMode);
        setIsPlaying(true);
      }
      
      // 如果智能场景已启用，继续采集
      if (isSmartEnabled) {
        startAudioAnalyzer();
      }
      
      return () => {
        console.log('[NoiseCancellation] 页面失焦，停止播放');
        // 页面失焦时停止播放（防止后台耗电）
        stopNoiseAudio();
        setIsPlaying(false);
        AudioAnalyzer.stop();
      };
    }, [isSmartEnabled])
  );
  
  // 处理模式切换
  const handleModePress = (modeId: string) => {
    console.log('[NoiseCancellation] 点击模式:', modeId);
    
    // 如果点击的是当前正在播放的模式，则停止播放
    if (selectedMode === modeId && isPlaying) {
      console.log('[NoiseCancellation] 停止当前模式');
      stopNoiseAudio();
      setIsPlaying(false);
      return;
    }
    
    // 否则播放新模式
    setSelectedMode(modeId);
    setIsPlaying(true);
    playNoiseAudio(modeId);
  };
  
  // 停止所有降噪
  const handleStopAll = () => {
    console.log('[NoiseCancellation] 停止所有降噪');
    stopNoiseAudio();
    setSelectedMode(null);
    setIsPlaying(false);
  };
  
  // 启动音频分析器
  const startAudioAnalyzer = async () => {
    try {
      console.log('[NoiseCancellation] 🚀 启动音频分析器（持续监测模式）');
      
      // 检查权限
      const status = await checkMicrophonePermission();
      if (status !== 'granted') {
        console.log('[NoiseCancellation] 权限未授予，申请权限');
        const result = await requestMicrophonePermission();
        
        if (!result.granted) {
          console.warn('[NoiseCancellation] 权限被拒绝');
          Alert.alert(
            t('common.noiseCancellation.smart'),
            result.message || t('common.noiseCancellation.smartEnable'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.settings'), onPress: () => openAppSettings() },
            ]
          );
          return;
        }
      }
      
      // 启动分析器（持续监测模式）
      console.log('[NoiseCancellation] 🎤 开始采集麦克风数据...');
      await AudioAnalyzer.start(
        (scene, confidence, dB) => {
          console.log(`[NoiseCancellation] 📩 收到场景更新：scene=${scene}, confidence=${(confidence * 100).toFixed(0)}%, dB=${dB.toFixed(1)}`);
          
          // 实时更新 UI
          setCurrentScene(scene);
          
          // 自动切换到识别的场景
          if (scene !== 'unknown') {
            const modeMap: Record<SceneType, string> = {
              traffic: 'noise_traffic',
              crowd: 'noise_crowd',
              wind: 'noise_wind',
              unknown: '',
            };
            
            const targetMode = modeMap[scene];
            if (targetMode && targetMode !== selectedMode) {
              console.log(`[NoiseCancellation] 🔄 自动切换模式：${targetMode}`);
              setSelectedMode(targetMode);
              setIsPlaying(true);
              playNoiseAudio(targetMode);
            }
          }
        },
        (error) => {
          console.error('[NoiseCancellation] ❌ 音频分析错误:', error);
          Alert.alert('错误', '音频分析失败，请重试');
        }
      );
    } catch (error) {
      console.error('[NoiseCancellation] ❌ 启动分析器失败:', error);
    }
  };
  
  // 切换智能场景识别
  const handleToggleSmart = async () => {
    if (isSmartEnabled) {
      // 关闭智能识别
      console.log('[NoiseCancellation] 关闭智能场景识别');
      setIsSmartEnabled(false);
      await AudioAnalyzer.stop();
    } else {
      // 开启智能识别
      console.log('[NoiseCancellation] 开启智能场景识别');
      await startAudioAnalyzer();
      setIsSmartEnabled(true);
    }
  };

  const noiseModes = [
    {
      id: 'noise_wind',
      title: t('common.noise.wind.title'),
      subtitle: t('common.noise.wind.subtitle'),
      icon: 'water-outline',
      color: '#4A90E2',
    },
    {
      id: 'noise_traffic',
      title: t('common.noise.traffic.title'),
      subtitle: t('common.noise.traffic.subtitle'),
      icon: 'bus-outline',
      color: '#F5A623',
    },
    {
      id: 'noise_crowd',
      title: t('common.noise.crowd.title'),
      subtitle: t('common.noise.crowd.subtitle'),
      icon: 'people-outline',
      color: '#D0021B',
    },
    {
      id: 'noise_balanced',
      title: t('common.noise.balanced.title'),
      subtitle: t('common.noise.balanced.subtitle'),
      icon: 'balance-outline',
      color: '#7ED321',
    },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* 头部 */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('common.noiseCancellation.title')}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* 内容区域 */}
        <Animated.ScrollView 
          style={{ opacity: fadeAnim }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* 状态指示器 */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Icon name="shield-checkmark-outline" size={32} color="#4A90E2" />
              <Text style={styles.statusTitle}>{t('common.noiseCancellation.status')}</Text>
            </View>
            <Text style={styles.statusDescription}>
              {t('common.noiseCancellation.statusDesc')}
            </Text>
            <TouchableOpacity 
              style={styles.toggleButton}
              onPress={() => {
                console.log('[NoiseCancellation] 切换开关');
                if (selectedMode) {
                  playNoiseAudio(selectedMode);
                }
              }}
            >
              <Text style={styles.toggleButtonText}>
                {t('common.noiseCancellation.toggle')}
              </Text>
              <Icon name="toggle" size={32} color="#4A90E2" />
            </TouchableOpacity>
          </View>

          {/* 降噪模式选择 */}
          <Text style={styles.sectionTitle}>{t('common.noiseCancellation.modes')}</Text>
          
          <View style={styles.modesGrid}>
            {noiseModes.map((mode) => {
              const isSelected = selectedMode === mode.id;
              const isCurrentPlaying = isSelected && isPlaying;
              
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[
                    styles.modeCard,
                    isCurrentPlaying && [
                      styles.modeCardSelected,
                      { borderColor: mode.color }
                    ]
                  ]}
                  onPress={() => handleModePress(mode.id)}
                >
                  <View style={[styles.modeIconContainer, { backgroundColor: mode.color + '20' }]}>
                    <Icon name={mode.icon} size={32} color={mode.color} />
                    {isCurrentPlaying && (
                      <View style={[styles.playingBadge, { backgroundColor: mode.color }]}>
                        <Icon name="play" size={16} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modeTitle}>{mode.title}</Text>
                  <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
                  {isCurrentPlaying && (
                    <View style={[styles.selectedIndicator, { backgroundColor: mode.color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 智能场景识别 */}
          <View style={styles.smartCard}>
            <View style={styles.smartHeader}>
              <Animated.View style={{ transform: [{ scale: breathAnim }] }}>
                <Icon name="sparkles-outline" size={24} color={isSmartEnabled ? '#9013FE' : '#9013FE80'} />
              </Animated.View>
              <Text style={styles.smartTitle}>{t('common.noiseCancellation.smart')}</Text>
              {isSmartEnabled && (
                <View style={styles.smartBadge}>
                  <Text style={styles.smartBadgeText}>ON</Text>
                </View>
              )}
            </View>
            <Text style={styles.smartDescription}>
              {t('common.noiseCancellation.smartDesc')}
            </Text>
            {currentScene !== 'unknown' && isSmartEnabled && (
              <View style={styles.sceneIndicator}>
                <Icon 
                  name={
                    currentScene === 'traffic' ? 'bus-outline' :
                    currentScene === 'crowd' ? 'people-outline' :
                    currentScene === 'wind' ? 'cloud-outline' : 'help-circle-outline'
                  } 
                  size={16} 
                  color="#9013FE" 
                />
                <Text style={styles.sceneIndicatorText}>
                  检测到：{
                    currentScene === 'traffic' ? '交通噪音' :
                    currentScene === 'crowd' ? '人声嘈杂' :
                    currentScene === 'wind' ? '风声' : '未知'
                  }
                </Text>
              </View>
            )}
            {isSmartEnabled && (
              <View style={styles.monitoringStatus}>
                <Animated.View style={[{ transform: [{ scale: breathAnim }] }]}>
                  <Icon name="radio-button-on" size={16} color="#9013FE" />
                </Animated.View>
                <Text style={styles.monitoringStatusText}>持续监测中...</Text>
              </View>
            )}
            <TouchableOpacity 
              style={[
                styles.smartButton,
                { backgroundColor: isSmartEnabled ? 'rgba(144, 19, 254, 0.3)' : 'rgba(144, 19, 254, 0.2)' }
              ]}
              onPress={handleToggleSmart}
            >
              <Text style={[
                styles.smartButtonText,
                { color: isSmartEnabled ? '#9013FE' : '#666' }
              ]}>
                {isSmartEnabled ? '关闭智能识别' : t('common.noiseCancellation.smartEnable')}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* 停止所有按钮 */}
          <TouchableOpacity
            style={styles.stopAllButton}
            onPress={handleStopAll}
            disabled={!isPlaying}
          >
            <Icon name="stop-circle-outline" size={24} color={isPlaying ? '#FF3B30' : '#666'} />
            <Text style={[
              styles.stopAllButtonText,
              { color: isPlaying ? '#FF3B30' : '#666' }
            ]}>
              {t('common.noiseCancellation.stopAll')}
            </Text>
          </TouchableOpacity>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080912',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statusCard: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
    marginLeft: 12,
  },
  statusDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Typography.fontFamily,
    marginBottom: 16,
    lineHeight: 20,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    padding: 12,
    borderRadius: 12,
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
    marginBottom: 16,
  },
  modesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modeCard: {
    width: (SCREEN_WIDTH - 60) / 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  modeCardSelected: {
    borderColor: '#4A90E2',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
  },
  modeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  playingBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#080912',
  },
  modeTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
    marginBottom: 4,
  },
  modeSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Typography.fontFamily,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smartCard: {
    backgroundColor: 'rgba(144, 19, 254, 0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(144, 19, 254, 0.3)',
  },
  smartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  smartTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
    marginLeft: 12,
  },
  smartDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Typography.fontFamily,
    marginBottom: 16,
    lineHeight: 20,
  },
  smartButton: {
    backgroundColor: 'rgba(144, 19, 254, 0.2)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  smartButtonText: {
    fontSize: 16,
    color: '#9013FE',
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },
  smartBadge: {
    backgroundColor: '#9013FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  smartBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },
  sceneIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(144, 19, 254, 0.1)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  sceneIndicatorText: {
    fontSize: 14,
    color: '#9013FE',
    fontFamily: Typography.fontFamily,
    marginLeft: 8,
  },
  monitoringStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(144, 19, 254, 0.2)',
  },
  monitoringStatusText: {
    fontSize: 11,
    color: '#9013FE',
    marginLeft: 6,
    fontStyle: 'italic',
  },
  stopAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  stopAllButtonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
    marginLeft: 8,
  },
});

export default NoiseCancellationScreen;
