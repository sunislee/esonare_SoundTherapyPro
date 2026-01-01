import React, {useState, useEffect} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Alert,
} from 'react-native';
import TrackPlayer from 'react-native-track-player';

const App = () => {
  // 音频播放状态管理
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0)); // 音量动画值

  // 音频配置和初始化
  useEffect(() => {
    initializeAudio();
    return () => {
      // 清理音频播放器
      TrackPlayer.destroy();
    };
  }, []);

  // 初始化音频播放器
  const initializeAudio = async () => {
    try {
      setIsLoading(true);
      
      // 配置音频轨道
      await TrackPlayer.setupPlayer({
        capabilities: [
          TrackPlayer.CAPABILITY_PLAY,
          TrackPlayer.CAPABILITY_PAUSE,
        ],
        compactCapabilities: [
          TrackPlayer.CAPABILITY_PLAY,
          TrackPlayer.CAPABILITY_PAUSE,
        ],
      });

      // 添加音频轨道 - 使用本地文件
      await TrackPlayer.add({
        id: 'rainy-study-track',
        url: require('./assets/audio/final_healing_rain.wav'),
        title: '雨夜书屋 - 沉浸式音频体验',
        artist: '雨夜书屋团队',
        artwork: require('./assets/audio/final_healing_rain.wav'),
      });

      // 设置循环播放
      await TrackPlayer.setRepeatMode(TrackPlayer.REPEAT_MODE_TRACK);
      
      // 监听播放状态变化
      TrackPlayer.addEventListener('playback-state', (state) => {
        const isPlaying = state.state === TrackPlayer.STATE_PLAYING;
        setIsPlaying(isPlaying);
        
        if (isPlaying) {
          startVolumeFadeIn();
        } else {
          startVolumeFadeOut();
        }
      });

      setIsLoading(false);
    } catch (error) {
      console.error('音频初始化失败:', error);
      setIsLoading(false);
      Alert.alert('初始化错误', '音频播放器初始化失败，请检查音频文件是否存在。');
    }
  };

  // 音量渐入效果 (0 -> 1)
  const startVolumeFadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 3000, // 3秒
      useNativeDriver: false,
    }).start();
  };

  // 音量渐出效果 (1 -> 0)
  const startVolumeFadeOut = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 3000, // 3秒
      useNativeDriver: false,
    }).start();
  };

  // 播放/暂停切换
  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        // 暂停播放
        await TrackPlayer.pause();
      } else {
        // 开始播放
        await TrackPlayer.play();
      }
    } catch (error) {
      console.error('播放控制失败:', error);
      Alert.alert('播放错误', '音频播放出现问题，请重试。');
    }
  };

  // 渲染播放按钮
  const renderPlayButton = () => {
    return (
      <TouchableOpacity
        style={[styles.playButton, isPlaying && styles.playingButton]}
        onPress={togglePlayback}
        disabled={isLoading}
        activeOpacity={0.7}>
        <Text style={[styles.playButtonText, isPlaying && styles.playingButtonText]}>
          {isLoading ? '加载中...' : isPlaying ? '暂停' : '播放'}
        </Text>
      </TouchableOpacity>
    );
  };

  // 渲染状态指示器
  const renderStatusIndicator = () => {
    return (
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isPlaying && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            {isLoading ? '初始化中...' : isPlaying ? '正在播放' : '已暂停'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#0a0a0a"
        translucent={false}
      />
      
      {/* 主内容区域 */}
      <View style={styles.content}>
        {/* 标题区域 */}
        <View style={styles.header}>
          <Text style={styles.title}>雨夜书屋</Text>
          <Text style={styles.subtitle}>沉浸式音频体验</Text>
          <Text style={styles.description}>让心灵在雨中静谧成长</Text>
        </View>

        {/* 动画呼吸效果背景 */}
        <Animated.View style={[styles.breathBackground, { opacity: fadeAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.1, 0.3],
        })}]} />

        {/* 播放控制区域 */}
        <View style={styles.controlArea}>
          {renderStatusIndicator()}
          {renderPlayButton()}
        </View>

        {/* 底部信息 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>专业音频处理 | Superpowered SDK</Text>
          <Text style={styles.footerSubtext}>循环播放 | 音量渐变 | 呼吸感体验</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a', // 深度沉浸式黑色
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: '300',
    color: '#ffffff',
    marginBottom: 12,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#cccccc',
    marginBottom: 8,
    fontWeight: '300',
  },
  description: {
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic',
  },
  breathBackground: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#4a90e2',
  },
  controlArea: {
    alignItems: 'center',
    marginBottom: 80,
  },
  statusContainer: {
    marginBottom: 30,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666666',
    marginRight: 10,
  },
  statusDotActive: {
    backgroundColor: '#4a90e2',
  },
  statusText: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '300',
  },
  playButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 50,
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  playingButton: {
    borderColor: '#4a90e2',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 1,
  },
  playingButtonText: {
    color: '#4a90e2',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  footerText: {
    color: '#666666',
    fontSize: 12,
    marginBottom: 4,
  },
  footerSubtext: {
    color: '#444444',
    fontSize: 10,
  },
});

export default App;