import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  BackHandler,
  Animated,
  ScrollView,
  Easing,
  Platform,
  Alert,
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
  warmupAudio,
} from '../services/NoiseAudioService';
import {
  init8TrackAudio,
  play8TrackAudio,
  stop8TrackAudio,
  cleanup8TrackAudio,
} from '../services/8TrackAudioService';
import AudioService from '../services/AudioService';
// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import * as RNFS from '@dr.pogodin/react-native-fs';
import { getLocalPath } from '../constants/audioAssets';

const { width, height } = Dimensions.get('window');

// 场景背景图配置（真实高清图片）
const SCENE_BACKGROUNDS = {
  noise_wind: require('../assets/images/nc_backgrounds/noise_wind.jpg'),
  noise_balanced: require('../assets/images/nc_backgrounds/noise_balanced.jpg'),
  noise_crowd: require('../assets/images/nc_backgrounds/noise_crowd.jpg'),
  noise_traffic: require('../assets/images/nc_backgrounds/noise_traffic.jpg'),
};

// 默认背景（兜底）
const DEFAULT_BACKGROUND = require('../assets/images/nc_backgrounds/noise_balanced.jpg');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * 检查指定音频组对应的8个轨道文件是否全部存在于本地。
 * @param audioGroupId 音频组 ID，如 'balanced_noise'、'wind_noise'
 * @returns true 表示8个文件全部就绪（可播放）
 */
const checkNoiseResourcesReady = async (audioGroupId: string): Promise<boolean> => {
  try {
    console.warn('[NC] checkNoiseResourcesReady START', audioGroupId);
    // audioGroupId 格式如：balanced_noise, wind_noise, crowd_noise, traffic_noise
    const folderName = audioGroupId; // 直接使用 audioGroupId 作为文件夹名

    for (let trackNum = 1; trackNum <= 8; trackNum++) {
      const filename = `${folderName}_track_${trackNum}.mp3`;
      // 根据 8TrackAudioService.ts 中的路径构造逻辑（第397-400行）：
      // getLocalPath('noise_reduction', `noise reduction/${filename}`)
      const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);

      console.warn('[NC] RNFS.exists check:', { trackNum, filename, localPath });
      const exists = await RNFS.exists(localPath);
      if (!exists) {
        console.warn('[NC] ❌ 资源未就绪：缺少', filename, 'localPath:', localPath);
        return false;
      }
    }

    console.log(`[NoiseCancellationRoom] ✅ 8-track 资源全部就绪: ${audioGroupId}`);
    // 🔍 Alert 调试：资源检查结果
    Alert.alert('🔍 资源检查结果', `ready = true\naudioGroupId = ${audioGroupId}`);
    return true;
  } catch (error) {
    console.warn('[NC] ❌ checkNoiseResourcesReady catch block, error:', error instanceof Error ? error.message : String(error));
    return false;
  }
};

/**
 * NoiseCancellationRoom - 降噪冥想室
 * 
 * 功能：
 * 1. 实时显示环境噪音的低/中/高频分布（背景跳动条）
 * 2. 提供三个可调节滑块，分别控制低/中/高频的白噪音音量
 * 3. AI 仅提供视觉参考，控制权完全在用户手中
 */
const NoiseCancellationRoom: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  
  const noiseModes = useMemo(() => [
    {
      id: 'noise_wind',
      title: t('noise_breeze_title'),
      subtitle: t('noise_breeze_desc'),
      icon: 'water-outline',
      color: '#4A90E2',
    },
    {
      id: 'noise_traffic',
      title: t('noise_downpour_title'),
      subtitle: t('noise_downpour_desc'),
      icon: 'cloudy-outline',
      color: '#F5A623',
    },
    {
      id: 'noise_crowd',
      title: t('noise_fireplace_title'),
      subtitle: t('noise_fireplace_desc'),
      icon: 'flame-outline',
      color: '#D0021B',
    },
    {
      id: 'noise_balanced',
      title: t('noise_deepspace_title'),
      subtitle: t('noise_deepspace_desc'),
      icon: 'planet-outline',
      color: '#7ED321',
    },
  ], [t, i18n.language]);
  
  const [frequencyDist, setFrequencyDist] = useState<FrequencyDistribution | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  
  // 降噪模式状态
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 【关键修复】当前播放的场景 ID（强一致状态）
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  
  // 三个频段的音量值（0-100）
  const [volumeValues, setVolumeValues] = useState({ low: 50, mid: 50, high: 50 });
  
  // 背景频率条的动画高度
  const lowBarHeight = useRef(new Animated.Value(0)).current;
  const midBarHeight = useRef(new Animated.Value(0)).current;
  const highBarHeight = useRef(new Animated.Value(0)).current;
  
  // 【核心】背景淡入淡出动画
  const backgroundOpacity = useRef(new Animated.Value(1)).current;
  const prevSceneRef = useRef('noise_balanced');

  // 页面获得焦点时启动音频分析器
  useFocusEffect(
    useCallback(() => {
      console.log('[NoiseCancellationRoom] 页面聚焦，启动音频分析器');
      
      // 【关键修复】进入降噪房间时，停止主场景音频（互斥播放）
      const stopMainAudio = async () => {
        try {
          const audioService = AudioService.getInstance();
          console.log('[NoiseCancellationRoom] 🛑 停止主场景音频，确保与降噪场景互斥');
          await audioService.stopAllAmbient();
          await audioService.stop();
          console.log('[NoiseCancellationRoom] ✅ 主场景音频已停止');
        } catch (e) {
          console.error('[NoiseCancellationRoom] 停止主场景音频失败:', e);
        }
      };
      stopMainAudio();
      
      // 【关键修复】静默预热：强迫 react-native-sound 底层初始化
      console.log('[NoiseCancellationRoom] 🔥 开始预热音频底层...');
      warmupAudio();
      
      // 初始化 8 轨音频服务（替代单轨降噪音频）
      init8TrackAudio();
      
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
        const audioGroupId = lastMode.replace('noise_', '') + '_noise';
        play8TrackAudio(audioGroupId);
      }
      
      // 页面失焦时停止分析器
      return () => {
        console.log('[NoiseCancellationRoom] 页面失焦，停止音频分析器');
        AudioAnalyzer.stop();
        stop8TrackAudio();
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

  /**
   * 【新增】播放前检查资源并下载（如果需要）
   * @param modeId 模式 ID，如 'noise_balanced'
   * @returns true 表示资源就绪并已/正在播放；false 表示已跳转下载页
   */
  const playWithResourceCheck = async (modeId: string): Promise<boolean> => {
    console.warn('[NC] playWithResourceCheck START', modeId);
    // 转换 ID 格式：noise_balanced -> balanced_noise
    const audioGroupId = modeId.replace('noise_', '') + '_noise';

    // 检查资源是否就绪
    const ready = await checkNoiseResourcesReady(audioGroupId);
    console.warn('[NC] checkNoiseResourcesReady returned', { audioGroupId, ready });

    if (!ready) {
      console.log(`[NoiseCancellationRoom] 📥 资源未就绪，跳转到下载页面: ${audioGroupId}`);
      
      // 构建 targetFiles：8个轨道文件的本地路径
      const targetFiles: string[] = [];
      for (let trackNum = 1; trackNum <= 8; trackNum++) {
        const filename = `${audioGroupId}_track_${trackNum}.mp3`;
        const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
        targetFiles.push(localPath);
      }

      console.warn('[NC] 准备跳转下载页，targetFiles count:', targetFiles.length, 'first:', targetFiles[0]);
      
      // 🔍 Alert 调试：准备跳转下载页
      Alert.alert(
        '🔍 准备跳转下载页',
        `audioGroupId = ${audioGroupId}\ntargetFiles count = ${targetFiles.length}`
      );
      
      try {
        // @ts-ignore - navigation type already added to RootStackParamList
        navigation.navigate('ResourceDownloadScreen', { targetFiles });
        console.warn('[NC] navigation.navigate 调用成功');
      } catch (navError) {
        console.warn('[NC] navigation.navigate 抛出异常', navError);
      }
      
      return false;
    }

    // 🔍 Alert 调试：准备播放
    Alert.alert('🔍 准备播放', `audioGroupId = ${audioGroupId}`);
    
    // 资源就绪，直接播放
    // @ts-ignore - play8TrackAudio exists
    await play8TrackAudio(audioGroupId);
    
    // 🔍 Alert 调试：播放调用完成
    Alert.alert('🔍 播放调用完成', `audioGroupId = ${audioGroupId}`);
    return true;
  };

  // 处理模式切换（统一播放状态管理）
  const handleModePress = async (modeId: string) => {
    // 🔍 Alert 调试：handleModePress 是否被调用
    Alert.alert('🔍 handleModePress 触发', `modeId = ${modeId}`);
    console.warn('[NC] handleModePress called:', modeId);
    
    // 【关键修复】如果点击的是当前正在播放的模式，则停止播放
    if (currentSceneId === modeId && isPlaying) {
      console.log('[NoiseCancellationRoom] 停止当前模式');
      setIsLoading(true);
      await stop8TrackAudio();
      setIsPlaying(false);
      setCurrentSceneId(null);
      setSelectedMode(null);
      setIsLoading(false);
      triggerHaptic();
      return;
    }
    
    // 【关键修复】否则播放新模式（自动停止旧场景）
    console.log('[NoiseCancellationRoom] 切换到新模式:', modeId);
    setIsLoading(true);
    
    // 【核心】背景淡入淡出动画（1.5 秒平滑过渡）
    Animated.timing(backgroundOpacity, {
      toValue: 0,
      duration: 750,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease),
    }).start(() => {
      // 更新场景引用
      prevSceneRef.current = modeId;
      
      // 淡入新背景（1.5 秒总时长）
      Animated.timing(backgroundOpacity, {
        toValue: 1,
        duration: 750,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    });
    
    // 【关键修复】立即更新 UI 状态（其他卡片立即失去播放态）
    setCurrentSceneId(modeId);
    setSelectedMode(modeId);
    
    console.warn('[NC] 即将调用 playWithResourceCheck', modeId);
    
    // 【新增】使用带资源检查的播放函数
    const played = await playWithResourceCheck(modeId);
    
    console.warn('[NC] playWithResourceCheck 返回结果', { modeId, played });
    
    if (played) {
      setIsPlaying(true);
    }
    setIsLoading(false);
    triggerHaptic();
  };

  // 停止所有降噪（同步播放按钮状态）
  const handleStopAll = async () => {
    console.log('[NoiseCancellationRoom] 停止所有降噪');
    setIsLoading(true);
    await stop8TrackAudio();
    setCurrentSceneId(null);
    setSelectedMode(null);
    setIsPlaying(false);
    setIsLoading(false);
    triggerHaptic();
  };

  // EQ 控制面板播放状态变化
  const handleEQPlayStateChange = useCallback((newIsPlaying: boolean) => {
    console.log('[NoiseCancellationRoom] EQ 播放状态变化:', newIsPlaying);
    if (newIsPlaying) {
      setSelectedMode(null);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, []);

  // 处理滑块值变化
  const handleVolumeChange = (type: 'low' | 'mid' | 'high', value: number) => {
    setVolumeValues(prev => ({ ...prev, [type]: value }));
    triggerHaptic();
    console.log(`[NoiseCancellationRoom] ${type} volume changed to ${Math.round(value)}`);
  };

  // 获取当前场景的背景图片
  const background = SCENE_BACKGROUNDS[(selectedMode || 'noise_balanced') as keyof typeof SCENE_BACKGROUNDS] || DEFAULT_BACKGROUND;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* 【核心】真实图片背景 + 模糊效果 + 淡入淡出动画 */}
      <Animated.View style={[styles.backgroundContainer, { opacity: backgroundOpacity }]}>
        <ImageBackground
          source={background}
          style={styles.backgroundImage}
          imageStyle={{
            resizeMode: 'cover',
            // 模糊效果：blurRadius 只在 Android 上有效，iOS 需要使用 BlurView
            blurRadius: Platform.OS === 'android' ? 15 : 0,
          }}
        />
      </Animated.View>

      {/* 蒙层（降低背景干扰，opacity: 0.5） */}
      <View style={styles.overlay} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-down" size={32} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('common.noiseCancellation.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* ScrollView 包裹主体内容 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {/* 提示文案 */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            {t('noise_room_desc')}
          </Text>
          <Text style={styles.infoSubText}>
            {t('noise_room_ai_hint')}
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

        {/* 降噪模式选择 */}
        <View style={styles.modesSection}>
          <Text style={styles.modesTitle}>{t('common.noiseCancellation.modes')}</Text>
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
              <Text style={styles.stopAllText}>{t('common.noiseCancellation.stopAll')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 底部说明 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 {t('common.noiseCancellation.statusDesc')}
          </Text>
        </View>

        {/* 8 段均衡器控制面板 */}
        <EQControlPanel 
          sceneName={selectedMode ? `${selectedMode.replace('noise_', '')}_noise` : 'balanced_noise'}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onTogglePlay={async () => {
            if (isPlaying) {
              await handleStopAll();
            } else {
              if (selectedMode) {
                setIsLoading(true);
                const audioGroupId = selectedMode.replace('noise_', '') + '_noise';
                // 【新增】EQ 面板播放也使用资源检查
                const ready = await checkNoiseResourcesReady(audioGroupId);
                if (ready) {
                  await play8TrackAudio(audioGroupId);
                  setIsPlaying(true);
                } else {
                  // 未就绪，跳转下载页
                  const targetFiles: string[] = [];
                  for (let trackNum = 1; trackNum <= 8; trackNum++) {
                    const filename = `${audioGroupId}_track_${trackNum}.mp3`;
                    const localPath = getLocalPath('noise_reduction', `noise reduction/${filename}`);
                    targetFiles.push(localPath);
                  }
                  navigation.navigate('ResourceDownloadScreen' as never, {
                    targetFiles,
                  } as never);
                }
                setIsLoading(false);
              }
            }
          }}
          onPlayStateChange={handleEQPlayStateChange}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: width,
    height: height,
  },
  backgroundImage: {
    flex: 1,
    width: width,
    height: height,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
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
    paddingBottom: 40,
  },
  infoContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
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
    marginBottom: 20,
  },
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
    marginBottom: 8,
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
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modeCardActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.2,
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