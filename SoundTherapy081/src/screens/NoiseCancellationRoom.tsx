import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  BackHandler,
  Animated,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AudioAnalyzer, FrequencyDistribution } from '../services/AudioAnalyzer';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import EQControlPanel from '../components/EQControlPanel';
import {
  initNoiseAudio,
  playNoiseAudio,
  stopNoiseAudio,
  cleanupNoiseAudio,
  getCurrentMode,
} from '../services/NoiseAudioService';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * NoiseCancellationRoom - 降噪冥想室
 * 
 * 功能：
 * 1. 实时显示环境噪音的低/中/高频分布（背景跳动条）
 * 2. 提供三个可调节滑块，分别控制低/中/高频的白噪音音量
 * 3. AI 仅提供视觉参考，控制权完全在用户手中
 */
const NoiseCancellationRoom: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  
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
  
  const [frequencyDist, setFrequencyDist] = useState<FrequencyDistribution | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  
  // 降噪模式状态
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // 三个频段的音量值（0-100）
  const [volumeValues, setVolumeValues] = useState({ low: 50, mid: 50, high: 50 });
  
  // 背景频率条的动画高度
  const lowBarHeight = useRef(new Animated.Value(0)).current;
  const midBarHeight = useRef(new Animated.Value(0)).current;
  const highBarHeight = useRef(new Animated.Value(0)).current;

  // 页面获得焦点时启动音频分析器
  useFocusEffect(
    useCallback(() => {
      console.log('[NoiseCancellationRoom] 页面聚焦，启动音频分析器');
      
      // 初始化降噪音频服务
      initNoiseAudio();
      
      // 启动音频分析器
      AudioAnalyzer.start((distribution) => {
        setFrequencyDist(distribution);
        setHasPermission(true);
        
        // 更新背景条高度（视觉参考）
        const { low, mid, high } = distribution;
        
        // 平滑过渡动画
        Animated.parallel([
          Animated.spring(lowBarHeight, {
            toValue: low,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(midBarHeight, {
            toValue: mid,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
          Animated.spring(highBarHeight, {
            toValue: high,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }),
        ]).start();
      });
      
      // 恢复上次播放的模式
      const lastMode = getCurrentMode();
      if (lastMode) {
        setSelectedMode(lastMode);
        setIsPlaying(true);
        playNoiseAudio(lastMode);
      }
      
      // 页面失焦时停止分析器
      return () => {
        console.log('[NoiseCancellationRoom] 页面失焦，停止音频分析器');
        AudioAnalyzer.stop();
        stopNoiseAudio();
      };
    }, [])
  );

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return true;
  };

  // 注册系统返回键拦截
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => sub.remove();
    }, [])
  );

  // 触发震动反馈
  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  // 处理模式切换
  const handleModePress = (modeId: string) => {
    console.log('[NoiseCancellationRoom] 点击模式:', modeId);
    
    // 如果点击的是当前正在播放的模式，则停止播放
    if (selectedMode === modeId && isPlaying) {
      console.log('[NoiseCancellationRoom] 停止当前模式');
      stopNoiseAudio();
      setIsPlaying(false);
      setSelectedMode(null);
      return;
    }
    
    // 否则播放新模式
    setSelectedMode(modeId);
    setIsPlaying(true);
    playNoiseAudio(modeId);
    triggerHaptic();
  };

  // 停止所有降噪
  const handleStopAll = () => {
    console.log('[NoiseCancellationRoom] 停止所有降噪');
    stopNoiseAudio();
    setSelectedMode(null);
    setIsPlaying(false);
    triggerHaptic();
  };

  // 处理滑块值变化
  const handleVolumeChange = (type: 'low' | 'mid' | 'high', value: number) => {
    setVolumeValues(prev => ({ ...prev, [type]: value }));
    triggerHaptic();
    console.log(`[NoiseCancellationRoom] ${type} volume changed to ${Math.round(value)}`);
    // TODO: 这里将来可以连接实际的音频引擎，调节对应频段的音量
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* 背景渐变（使用 View 模拟） */}
      <View style={styles.backgroundGradient} />
      <View style={styles.overlay} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-down" size={32} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>降噪冥想室</Text>
        <View style={styles.placeholder} />
      </View>

      {/* ScrollView 包裹主体内容 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {/* 提示文案 - 优化间距 */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            背景条显示环境噪音分布，滑动调节对冲音量
          </Text>
          <Text style={styles.infoSubText}>
            AI 仅提供视觉参考，控制权在您手中
          </Text>
        </View>

        {/* 频率显示与调节区域 */}
        {hasPermission && frequencyDist && (
          <View style={styles.freqContainer}>
            {/* 低频 */}
            <View style={styles.freqRow}>
              <View style={styles.freqLabelContainer}>
                <Icon name="volume-low" size={20} color="#FF6B6B" />
                <Text style={[styles.freqLabel, { color: '#FF6B6B' }]}>低频</Text>
              </View>
              
              {/* 背景频率条（只读，视觉参考） */}
              <View style={styles.freqBarBackground}>
                <Animated.View 
                  style={[
                    styles.freqBar,
                    { 
                      width: lowBarHeight.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: '#FF6B6B',
                    }
                  ]} 
                />
              </View>
              
              {/* 前景调节滑块 */}
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.slider}
                  value={volumeValues.low}
                  onValueChange={(val) => handleVolumeChange('low', val)}
                  minimumValue={0}
                  maximumValue={100}
                  minimumTrackTintColor="#FF6B6B"
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor="#FF6B6B"
                />
              </View>
              
              <Text style={[styles.freqValue, { color: '#FF6B6B' }]}>
                {Math.round(volumeValues.low)}%
              </Text>
            </View>

            {/* 中频 */}
            <View style={styles.freqRow}>
              <View style={styles.freqLabelContainer}>
                <Icon name="volume-medium" size={20} color="#4ECDC4" />
                <Text style={[styles.freqLabel, { color: '#4ECDC4' }]}>中频</Text>
              </View>
              
              {/* 背景频率条 */}
              <View style={styles.freqBarBackground}>
                <Animated.View 
                  style={[
                    styles.freqBar,
                    { 
                      width: midBarHeight.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: '#4ECDC4',
                    }
                  ]} 
                />
              </View>
              
              {/* 前景调节滑块 */}
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.slider}
                  value={volumeValues.mid}
                  onValueChange={(val) => handleVolumeChange('mid', val)}
                  minimumValue={0}
                  maximumValue={100}
                  minimumTrackTintColor="#4ECDC4"
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor="#4ECDC4"
                />
              </View>
              
              <Text style={[styles.freqValue, { color: '#4ECDC4' }]}>
                {Math.round(volumeValues.mid)}%
              </Text>
            </View>

            {/* 高频 */}
            <View style={styles.freqRow}>
              <View style={styles.freqLabelContainer}>
                <Icon name="volume-high" size={20} color="#FFE66D" />
                <Text style={[styles.freqLabel, { color: '#FFE66D' }]}>高频</Text>
              </View>
              
              {/* 背景频率条 */}
              <View style={styles.freqBarBackground}>
                <Animated.View 
                  style={[
                    styles.freqBar,
                    { 
                      width: highBarHeight.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: '#FFE66D',
                    }
                  ]} 
                />
              </View>
              
              {/* 前景调节滑块 */}
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.slider}
                  value={volumeValues.high}
                  onValueChange={(val) => handleVolumeChange('high', val)}
                  minimumValue={0}
                  maximumValue={100}
                  minimumTrackTintColor="#FFE66D"
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor="#FFE66D"
                />
              </View>
              
              <Text style={[styles.freqValue, { color: '#FFE66D' }]}>
                {Math.round(volumeValues.high)}%
              </Text>
            </View>
          </View>
        )}

        {/* 无权限提示 */}
        {!hasPermission && (
          <View style={styles.permissionContainer}>
            <Icon name="mic-off-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.permissionText}>
              麦克风权限未授权
            </Text>
            <Text style={styles.permissionSubText}>
              无法显示环境噪音分析
            </Text>
          </View>
        )}

        {/* 降噪模式选择 - 优化间距 */}
        <View style={styles.modesSection}>
          <Text style={styles.modesTitle}>降噪模式</Text>
          <View style={styles.modesGrid}>
            {noiseModes.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[
                  styles.modeCard,
                  selectedMode === mode.id && styles.modeCardActive,
                  { borderColor: mode.color },
                ]}
                onPress={() => handleModePress(mode.id)}
              >
                <View style={[styles.modeIconContainer, { backgroundColor: mode.color }]}>
                  <Icon name={mode.icon} size={24} color="#FFF" />
                </View>
                <Text style={styles.modeTitle}>{mode.title}</Text>
                <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
                {selectedMode === mode.id && isPlaying && (
                  <View style={styles.playingIndicator}>
                    <Icon name="play" size={12} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
          
          {/* 停止所有按钮 */}
          {selectedMode && (
            <TouchableOpacity style={styles.stopAllButton} onPress={handleStopAll}>
              <Icon name="stop-circle-outline" size={24} color="#FF453A" />
              <Text style={styles.stopAllText}>停止所有降噪</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 底部说明 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 提示：调节滑块播放对应频段的白噪音，对冲环境噪音
          </Text>
        </View>

        {/* 8 段均衡器控制面板 */}
        <EQControlPanel />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16, // 【优化】从 24 降至 16
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
  },
  placeholder: {
    width: 48,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40, // 【优化】底部留白，防止被系统操作杆遮挡
  },
  infoContainer: {
    paddingHorizontal: 24,
    marginBottom: 20, // 【优化】从 32 降至 20
  },
  infoText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  infoSubText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
  freqContainer: {
    paddingHorizontal: 24,
    marginBottom: 20, // 【优化】添加底部间距
  },
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24, // 【优化】从 32 降至 24
    position: 'relative',
  },
  freqLabelContainer: {
    width: 60,
    alignItems: 'center',
    flexDirection: 'row',
  },
  freqLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  freqBarBackground: {
    position: 'absolute',
    left: 70,
    right: 100,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  freqBar: {
    height: '100%',
    borderRadius: 4,
    opacity: 0.6,
  },
  sliderContainer: {
    position: 'absolute',
    left: 70,
    right: 100,
    top: -10,
    bottom: -10,
  },
  slider: {
    flex: 1,
  },
  freqValue: {
    position: 'absolute',
    right: 0,
    fontSize: 14,
    fontWeight: '600',
    width: 80,
    textAlign: 'right',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginTop: 16,
  },
  permissionSubText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    marginBottom: 8,
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modesSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    marginBottom: 8, // 【优化】减小与 8 段均衡器标题的间距
  },
  modesTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  modesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modeCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    position: 'relative',
  },
  modeCardActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  modeSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  playingIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6C5DD3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,69,58,0.1)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  stopAllText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default NoiseCancellationRoom;
