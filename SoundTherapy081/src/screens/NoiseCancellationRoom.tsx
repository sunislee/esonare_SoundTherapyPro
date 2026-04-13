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
  Easing,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Filter, FeGaussianBlur, Rect } from 'react-native-svg';
import Animated from 'react-native-reanimated';

// 创建 Animated 版本的 SVG 组件
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
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

const { width, height } = Dimensions.get('window');

// SVG 弥散层色彩方案（每个场景 3-4 个圆，营造极光/雾气流深度）
const SCENE_SVG_COLORS = {
  noise_wind: {  // 微风轻拂：深灰底 + 浅青色圆
    base: '#1A1C20',
    circles: [
      { color: '#2A3F4F', opacity: 0.3 },  // 浅青
      { color: '#1F3A4A', opacity: 0.25 },  // 深青
      { color: '#2D4F5F', opacity: 0.2 },   // 蓝青
    ],
  },
  noise_balanced: {  // 深空专注：纯黑底 + 深紫圆 + 深蓝圆
    base: '#000000',
    circles: [
      { color: '#1A1A3E', opacity: 0.35 },  // 深紫
      { color: '#0F1A3A', opacity: 0.3 },   // 深蓝
      { color: '#2A1A4E', opacity: 0.25 },  // 极深紫
    ],
  },
  noise_crowd: {  // 围炉隔离：深褐底 + 暗红圆
    base: '#261514',
    circles: [
      { color: '#3E2723', opacity: 0.35 },  // 暗红
      { color: '#4A2A25', opacity: 0.3 },   // 深红褐
      { color: '#2E1A15', opacity: 0.25 },  // 暗褐红
    ],
  },
  noise_traffic: {  // 倾盆掩盖：墨黑底 + 深灰蓝色圆
    base: '#212629',
    circles: [
      { color: '#2F3A4A', opacity: 0.35 },  // 深灰蓝
      { color: '#253040', opacity: 0.3 },   // 深蓝灰
      { color: '#3A4550', opacity: 0.25 },  // 灰蓝
    ],
  },
};

// 默认背景（兜底）
const DEFAULT_SCENE = {
  base: '#000000',
  circles: [
    { color: '#1A1A2E', opacity: 0.3 },
    { color: '#0F1A2A', opacity: 0.25 },
  ],
};

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
  const [isLoading, setIsLoading] = useState<boolean>(false); // 加载中状态
  
  // 【关键修复】当前播放的场景 ID（强一致状态）
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  
  // 三个频段的音量值（0-100）
  const [volumeValues, setVolumeValues] = useState({ low: 50, mid: 50, high: 50 });
  
  // 背景频率条的动画高度
  const lowBarHeight = useRef(new Animated.Value(0)).current;
  const midBarHeight = useRef(new Animated.Value(0)).current;
  const highBarHeight = useRef(new Animated.Value(0)).current;
  
  // 【核心】SVG 弥散层呼吸动画（极光/雾气流深度）
  const circleAnims = useRef(
    Array(3).fill(null).map(() => ({
      cx: new Animated.Value(width * 0.5),
      cy: new Animated.Value(height * 0.5),
      r: new Animated.Value(Math.max(width, height) * 0.4),
    }))
  ).current;
  const prevSceneRef = useRef('noise_balanced');

  // 页面获得焦点时启动音频分析器
  useFocusEffect(
    useCallback(() => {
      console.log('[NoiseCancellationRoom] 页面聚焦，启动音频分析器');
      
      // 【核心】启动 SVG 弥散层呼吸动画（极光/雾气流深度）
      const currentScene = prevSceneRef.current;
      const colors = SCENE_SVG_COLORS[currentScene as keyof typeof SCENE_SVG_COLORS] || DEFAULT_SCENE;
      
      // 为每个圆启动独立的呼吸动画（位置 + 半径）
      circleAnims.forEach((anim, index) => {
        const offsetX = (index - 1) * width * 0.15;
        const offsetY = (index - 1) * height * 0.1;
        
        // 坐标呼吸动画（不同圆有不同相位）
        Animated.loop(
          Animated.parallel([
            Animated.sequence([
              Animated.timing(anim.cx, {
                toValue: width * 0.5 + offsetX,
                duration: 8000 + index * 2000,  // 每个圆周期不同
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
              Animated.timing(anim.cx, {
                toValue: width * 0.5 - offsetX,
                duration: 8000 + index * 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
              Animated.timing(anim.cx, {
                toValue: width * 0.5,
                duration: 8000 + index * 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
            ]),
            Animated.sequence([
              Animated.timing(anim.cy, {
                toValue: height * 0.5 + offsetY,
                duration: 10000 + index * 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
              Animated.timing(anim.cy, {
                toValue: height * 0.5 - offsetY,
                duration: 10000 + index * 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
              Animated.timing(anim.cy, {
                toValue: height * 0.5,
                duration: 10000 + index * 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: false,
              }),
            ]),
          ])
        ).start();
        
        // 半径呼吸动画（营造膨胀/收缩感）
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim.r, {
              toValue: Math.max(width, height) * 0.5,
              duration: 6000 + index * 1000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim.r, {
              toValue: Math.max(width, height) * 0.35,
              duration: 6000 + index * 1000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ])
        ).start();
      });
      
      // 【关键修复】静默预热：强迫 react-native-sound 底层初始化
      console.log('[NoiseCancellationRoom] 🔥 开始预热音频底层...');
      warmupAudio();
      
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

  // 处理模式切换（统一播放状态管理）
  const handleModePress = async (modeId: string) => {
    console.log('[NoiseCancellationRoom] 点击模式:', modeId);
    
    // 【关键修复】如果点击的是当前正在播放的模式，则停止播放
    if (currentSceneId === modeId && isPlaying) {
      console.log('[NoiseCancellationRoom] 停止当前模式');
      setIsLoading(true);
      await stopNoiseAudio();
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
    
    // 【核心】切换场景时重启 SVG 弥散层动画
    prevSceneRef.current = modeId;
    const colors = SCENE_SVG_COLORS[modeId as keyof typeof SCENE_SVG_COLORS] || DEFAULT_SCENE;
    
    // 重启每个圆的动画（颜色已通过 SVG 自动更新）
    circleAnims.forEach((anim, index) => {
      // 重置位置到中心
      anim.cx.setValue(width * 0.5);
      anim.cy.setValue(height * 0.5);
      
      // 然后继续呼吸动画
      const offsetX = (index - 1) * width * 0.15;
      const offsetY = (index - 1) * height * 0.1;
      
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(anim.cx, {
              toValue: width * 0.5 + offsetX,
              duration: 8000 + index * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim.cx, {
              toValue: width * 0.5 - offsetX,
              duration: 8000 + index * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim.cx, {
              toValue: width * 0.5,
              duration: 8000 + index * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
          Animated.sequence([
            Animated.timing(anim.cy, {
              toValue: height * 0.5 + offsetY,
              duration: 10000 + index * 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim.cy, {
              toValue: height * 0.5 - offsetY,
              duration: 10000 + index * 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim.cy, {
              toValue: height * 0.5,
              duration: 10000 + index * 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
        ])
      ).start();
    });
    
    // 【关键修复】立即更新 UI 状态（其他卡片立即失去播放态）
    setCurrentSceneId(modeId);
    setSelectedMode(modeId);
    
    // 播放新场景（8TrackAudioService 会自动停止旧场景）
    await playNoiseAudio(modeId);
    
    setIsPlaying(true);
    setIsLoading(false);
    triggerHaptic();
  };

  // 停止所有降噪（同步播放按钮状态）
  const handleStopAll = async () => {
    console.log('[NoiseCancellationRoom] 停止所有降噪');
    setIsLoading(true);
    await stopNoiseAudio();
    setCurrentSceneId(null);
    setSelectedMode(null);
    setIsPlaying(false);
    setIsLoading(false);
    triggerHaptic();
  };

  // EQ 控制面板播放状态变化
  const handleEQPlayStateChange = useCallback((newIsPlaying: boolean) => {
    console.log('[NoiseCancellationRoom] EQ 播放状态变化:', newIsPlaying);
    // 如果 EQ 面板开始播放，清除页面级别的选中模式（避免冲突）
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
    // TODO: 这里将来可以连接实际的音频引擎，调节对应频段的音量
  };

  // 获取当前场景的 SVG 颜色配置
  const colors = SCENE_SVG_COLORS[(selectedMode || 'noise_balanced') as keyof typeof SCENE_SVG_COLORS] || DEFAULT_SCENE;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* 【核心】SVG 弥散层背景（高斯模糊 + 呼吸动画） */}
      <Svg style={styles.svgBackground} preserveAspectRatio="none">
        <Defs>
          {/* 高斯模糊滤镜：stdDeviation="60" 以上，营造极光/雾气效果 */}
          <Filter id="blurFilter">
            <FeGaussianBlur in="SourceGraphic" stdDeviation="60" />
          </Filter>
        </Defs>
        
        {/* 底色层 */}
        <Rect x="0" y="0" width={width} height={height} fill={colors.base} />
        
        {/* 弥散圆层（3 个圆，不同位置/颜色/大小） */}
        {colors.circles.map((circle, index) => (
          <Animated.Circle
            key={index}
            cx={circleAnims[index].cx}
            cy={circleAnims[index].cy}
            r={circleAnims[index].r}
            fill={circle.color}
            opacity={circle.opacity}
            filter="url(#blurFilter)"
          />
        ))}
      </Svg>

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

        {/* 8 段均衡器控制面板（绑定 8 轨音频，统一播放状态） */}
        <EQControlPanel 
          sceneName={selectedMode ? `${selectedMode.replace('noise_', '')}_noise` : 'balanced_noise'}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onTogglePlay={async () => {
            if (isPlaying) {
              // 如果正在播放，点击播放按钮=停止
              await handleStopAll();
            } else {
              // 如果已停止，点击播放按钮=播放当前选中的场景
              if (selectedMode) {
                setIsLoading(true);
                await playNoiseAudio(selectedMode);
                setIsPlaying(true);
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
  svgBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: width,
    height: height,
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
    backgroundColor: 'transparent',  // 完全透明
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',  // 极淡边框
    position: 'relative',
    // 软阴影（大范围，微弱，营造浮起感）
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,  // Android 阴影
  },
  modeCardActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',  // 选中时极淡高亮
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.2,  // 选中时阴影略强
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
