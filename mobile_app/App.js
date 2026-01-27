import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Alert,
  Easing,
} from 'react-native';
import TrackPlayer, {
  Capability,
  State,
  usePlaybackState,
  RepeatMode
} from 'react-native-track-player';

// RainDrop 雨滴粒子组件
const RainDrop = ({ index, volume, rainDrops }) => {
  const translateY = useState(new Animated.Value(-100))[0];
  const translateX = useState(new Animated.Value(0))[0];
  const opacity = useState(new Animated.Value(0))[0];
  const scale = useState(new Animated.Value(0.8))[0];
  const rotate = useState(new Animated.Value(0))[0];
  const tailOpacity = useState(new Animated.Value(0.5))[0];

  // 随机生成雨滴特性，每次动画循环都重新生成，增加自然感
  const getRainProperties = () => {
    // 随机大小：0.6-1.2
    const randomScale = 0.6 + Math.random() * 0.6;
    // 随机旋转角度：-10到10度
    const randomRotation = (Math.random() * 20 - 10) * Math.PI / 180;
    // 随机水平偏移：-30到30
    const randomOffset = Math.random() * 60 - 30;
    // 随机风力影响：-10到10
    const windEffect = Math.random() * 20 - 10;
    // 随机振幅（左右摇摆幅度）：5到15
    const swingAmplitude = 5 + Math.random() * 10;
    // 随机频率（摇摆速度）：0.5到2
    const swingFrequency = 0.5 + Math.random() * 1.5;
    
    return {
      randomScale,
      randomRotation,
      randomOffset,
      windEffect,
      swingAmplitude,
      swingFrequency
    };
  };

  // 根据音量计算基础下落速度（音量越大，速度越快）
  const getBaseSpeed = () => {
    // 音量范围 0-1，基础速度范围 4000-1000 毫秒
    const baseSpeed = 4000 - (volume * 3000);
    // 增加随机波动：±20%
    return baseSpeed * (0.8 + Math.random() * 0.4);
  };

  // 启动雨滴动画
  useEffect(() => {
    const animateRain = () => {
      // 获取本次动画的随机特性
      const rainProps = getRainProperties();
      
      // 重置动画值
      translateY.setValue(-100);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(rainProps.randomScale * 0.8);
      rotate.setValue(0);
      tailOpacity.setValue(0.5);
      
      // 下落动画
      const fallDuration = getBaseSpeed();
      
      // 生成摆动路径（使用正弦函数模拟自然摆动）
      const swingAnimation = Animated.timing(translateX, {
        toValue: rainProps.randomOffset + rainProps.windEffect,
        duration: fallDuration,
        easing: (t) => {
          // 自定义缓动函数：先慢后快，带有摆动效果
          const swing = Math.sin(t * Math.PI * rainProps.swingFrequency) * rainProps.swingAmplitude;
          const forward = t * t; // 二次缓动，模拟重力加速
          return forward * (rainProps.randomOffset + rainProps.windEffect) + swing;
        },
        useNativeDriver: true,
      });
      
      // 组合动画
      Animated.parallel([
        // 垂直下落 - 模拟真实重力加速度，使用三次缓动
        Animated.timing(translateY, {
          toValue: 300, // 超出屏幕底部，避免突兀消失
          duration: fallDuration,
          easing: (t) => t * t * t, // 三次缓动，更真实的重力效果
          useNativeDriver: true,
        }),
        
        // 摆动动画
        swingAnimation,
        
        // 透明度变化 - 更自然的淡入淡出
        Animated.sequence([
          // 快速淡入
          Animated.timing(opacity, {
            toValue: 0.9 + Math.random() * 0.1, // 随机不透明度
            duration: fallDuration * 0.15,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          // 保持不透明度
          Animated.timing(opacity, {
            toValue: 0.9 + Math.random() * 0.1,
            duration: fallDuration * 0.6,
            useNativeDriver: true,
          }),
          // 快速淡出
          Animated.timing(opacity, {
            toValue: 0,
            duration: fallDuration * 0.25,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        ]),
        
        // 拖尾透明度变化
        Animated.sequence([
          Animated.timing(tailOpacity, {
            toValue: 0,
            duration: fallDuration * 0.8,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          })
        ]),
        
        // 缩放变化 - 更自然的形态变化
        Animated.sequence([
          Animated.timing(scale, {
            toValue: rainProps.randomScale,
            duration: fallDuration * 0.2,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: rainProps.randomScale * 0.7,
            duration: fallDuration * 0.8,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        ]),
        
        // 旋转动画 - 更自然的旋转效果
        Animated.timing(rotate, {
          toValue: rainProps.randomRotation,
          duration: fallDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ]).start(({ finished }) => {
        if (finished) {
          // 动画完成后，延迟随机时间重新开始，增加无序感
          const delay = Math.random() * 800;
          setTimeout(() => {
            animateRain();
          }, delay);
        }
      });
    };

    // 启动第一次动画，带有随机延迟
    const initialDelay = rainDrops[index].delay + Math.random() * 500;
    setTimeout(() => {
      animateRain();
    }, initialDelay);

    // 当音量变化时重新启动动画
    return () => {
      translateY.setValue(-100);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.8);
      rotate.setValue(0);
    };
  }, [volume, index, rainDrops]);

  const drop = rainDrops[index];

  return (
    <>
      {/* 雨滴主体 */}
      <Animated.View
        key={`${drop.id}-main`}
        style={[
          styles.rainDrop,
          {
            top: `${drop.top}%`,
            left: `${drop.left}%`,
            height: drop.length,
            opacity: opacity,
            transform: [
              { translateX },
              { translateY },
              { scale },
              { rotate: rotate.interpolate({ inputRange: [-Math.PI/9, Math.PI/9], outputRange: ['-10deg', '10deg'] }) }
            ],
            zIndex: 10,
          }
        ]}
      />
      {/* 雨滴拖尾效果，增强真实感 */}
      <Animated.View
        key={`${drop.id}-tail`}
        style={[
          styles.rainDrop,
          styles.rainTail,
          {
            top: `${drop.top}%`,
            left: `${drop.left}%`,
            height: drop.length * 0.8,
            opacity: tailOpacity.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.3, 0.5]
            }),
            transform: [
              { translateX },
              { translateY: translateY.interpolate({ inputRange: [-100, 300], outputRange: [-80, 280] }) },
              { scale: scale.interpolate({ inputRange: [0.5, 1.2], outputRange: [0.6, 0.9] }) },
              { rotate: rotate.interpolate({ inputRange: [-Math.PI/9, Math.PI/9], outputRange: ['-10deg', '10deg'] }) }
            ],
            zIndex: 9,
          }
        ]}
      />
    </>
  );
};

const App = () => {
  const playbackState = usePlaybackState();
  const [isLoading, setIsLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [statusAnim] = useState(new Animated.Value(0));
  const [breathAnim] = useState(new Animated.Value(1));
  const [volume, setVolume] = useState(0.5);
  
  // 雨滴动画状态
  const rainDrops = useRef([]);
  const [rainAnimations, setRainAnimations] = useState([]);
  
  // 监听音量变化
  useEffect(() => {
    // 可以根据需要添加音量持久化或其他逻辑
  }, [volume]);
  
  // 初始化雨滴动画
  useEffect(() => {
    const drops = [];
    const animations = [];
    for (let i = 0; i < 30; i++) {
      drops.push({
        id: i,
        top: Math.random() * -20, // 从屏幕上方开始
        left: Math.random() * 100,
        delay: Math.random() * 2000,
        length: 15 + Math.random() * 15
      });
      animations.push(new Animated.Value(0));
    }
    rainDrops.current = drops;
    setRainAnimations(animations);
  }, []);
  
  // 呼吸灯动画
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathAnim, {
            toValue: 1.2,
            duration: 2000,
            useNativeDriver: true
          }),
          Animated.timing(breathAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      breathAnim.setValue(1);
    }
  }, [isPlaying]);

  // 优化播放状态判断，考虑更多状态
  const getPlaybackStatus = () => {
    switch (playbackState.state) {
      case State.Playing:
        return {
          isPlaying: true,
          isBuffering: false,
          statusText: '雨落书屋中...',
          buttonIcon: '⏸',
          buttonText: '暂停'
        };
      case State.Paused:
      case State.Ready:
      case State.Stopped:
        return {
          isPlaying: false,
          isBuffering: false,
          statusText: '已暂停',
          buttonIcon: '▶',
          buttonText: '播放'
        };
      case State.Buffering:
        return {
          isPlaying: false,
          isBuffering: true,
          statusText: '缓冲中...',
          buttonIcon: '⏸',
          buttonText: '缓冲中'
        };
      default:
        return {
          isPlaying: false,
          isBuffering: false,
          statusText: '准备中...',
          buttonIcon: '▶',
          buttonText: '准备'
        };
    }
  };

  // 获取当前播放状态
  const playbackStatus = getPlaybackStatus();
  const { isPlaying, isBuffering, statusText, buttonIcon, buttonText } = playbackStatus;

  useEffect(() => {
    setupAudio();
    return () => {
      // 组件卸载时的逻辑
    };
  }, []);

  // 监听播放状态执行音量动画
  useEffect(() => {
    if (isPlaying) {
      startVolumeFadeIn();
    } else {
      startVolumeFadeOut();
    }
  }, [isPlaying]);

  // 监听状态变化，触发文字平滑过渡
  useEffect(() => {
    // 先淡出
    Animated.timing(statusAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      // 然后淡入新状态
      Animated.timing(statusAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });
  }, [statusText]);

  // 初始化状态动画
  useEffect(() => {
    Animated.timing(statusAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const setupAudio = async () => {
    console.log('=== 开始初始化TrackPlayer (mobile_app) ===');
    setIsLoading(true);
    
    try {
      // 1. 检查当前状态
      let currentState;
      try {
        currentState = await TrackPlayer.getState();
        console.log('初始化前TrackPlayer状态:', currentState);
      } catch (stateError) {
        console.log('初始化前无法获取状态，可能未初始化:', stateError.message);
      }
      
      // 2. 尝试初始化播放器
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
      });
      console.log('✅ TrackPlayer初始化完成');
      
      // 3. 配置播放器选项
      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
        ],
      });
      console.log('✅ 播放器选项配置完成');
      
      // 4. 重置播放器状态
      await TrackPlayer.reset();
      console.log('✅ 播放器状态重置完成');
      
      // 5. 安全加载音频文件
      let audioUrl;
      try {
        audioUrl = require('./assets/audio/final_healing_rain.wav');
        console.log('✅ 音频文件加载成功');
      } catch (requireError) {
        console.error('❌ 主音频文件加载失败:', requireError.message);
        setIsLoading(false);
        return;
      }
      
      // 6. 添加音频轨道
      await TrackPlayer.add({
        id: 'healing-rain',
        url: audioUrl,
        title: '雨夜书屋',
        artist: '李上',
      });
      console.log('✅ 音频轨道添加完成');
      
      // 7. 设置重复模式
      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      console.log('✅ 循环模式设置完成');
      
      // 8. 设置初始音量
      const initialVolume = 0.5;
      await TrackPlayer.setVolume(initialVolume);
      const actualVolume = await TrackPlayer.getVolume();
      console.log(`✅ 音量设置完成: 请求值=${initialVolume}, 实际值=${actualVolume}`);
      
      // 9. 自动播放音频
      await TrackPlayer.play();
      console.log('✅ 开始自动播放');
      
      // 10. 延迟检查播放状态
      setTimeout(async () => {
        const updatedState = await TrackPlayer.getState();
        const updatedVolume = await TrackPlayer.getVolume();
        console.log('=== 最终播放状态 ===');
        console.log('当前状态:', updatedState);
        console.log('当前音量:', updatedVolume);
      }, 1000);
      
    } catch (error) {
      console.error('❌ TrackPlayer初始化错误:', error.name, error.message);
      console.error('错误堆栈:', error.stack);
    }
    
    setIsLoading(false);
    console.log('=== TrackPlayer初始化完成 (mobile_app) ===');
  };

  const startVolumeFadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();
  };

  const startVolumeFadeOut = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 3000,
      useNativeDriver: false,
    }).start();
  };

  const togglePlayback = async () => {
    try {
      console.log('切换播放状态，当前状态:', isPlaying ? '播放中' : '已暂停');
      
      if (isPlaying) {
        console.log('执行暂停操作...');
        await TrackPlayer.pause();
        console.log('暂停成功');
      } else {
        console.log('执行播放操作...');
        await TrackPlayer.play();
        console.log('播放成功');
      }
    } catch (error) {
      console.error('播放状态切换失败:', error);
      Alert.alert('播放错误', `操作失败: ${error.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent={true} 
      />
      
      {/* 深蓝黑色背景 */}
      <View style={styles.gradientBackground}>
        
        {/* 雨滴动画层 - rainContainer */}
        <View style={[styles.rainContainer, { zIndex: 999 }]}>
          {Array.from({ length: 30 }).map((_, index) => (
            <RainDrop 
              key={index} 
              index={index} 
              volume={volume} 
              rainDrops={rainDrops.current} 
            />
          ))}
        </View>
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>雨夜书屋</Text>
            <Text style={styles.subtitle}>沉浸式音频体验</Text>
            <Text style={styles.description}>让心灵在雨中静谧成长</Text>
          </View>

          {/* 呼吸感背景 */}
          <Animated.View style={[styles.breathBackground, { 
            opacity: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.4],
            }),
            transform: [{
              scale: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2],
              })
            }]
          }]} />

          <View style={styles.controlArea}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot, 
                (isPlaying || isBuffering) && styles.statusDotActive, 
                isBuffering && styles.statusDotBuffering
              ]} />
              <Animated.Text 
                style={[styles.statusText, {
                  opacity: statusAnim,
                  transform: [{
                    translateY: statusAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0]
                    })
                  }]
                }]}
              >
                {isLoading ? '加载中...' : statusText}
              </Animated.Text>
            </View>
            
            {/* 播放按钮 - 带有呼吸灯效果 */}
            <TouchableOpacity
              style={styles.buttonContainer}
              onPress={togglePlayback}
              disabled={isLoading || isBuffering}>
              <Animated.View 
                style={[styles.buttonOuterRing, {
                  transform: [{ scale: breathAnim }]
                }]}
              />
              <Animated.View 
                style={[
                  styles.playButton, 
                  isPlaying && styles.playingButton,
                  isBuffering && styles.bufferingButton,
                  {
                    transform: [{ scale: breathAnim.interpolate({
                      inputRange: [1, 1.2],
                      outputRange: [1, 0.9]
                    })}]
                  }
                ]}
              >
                <Text style={[
                  styles.playButtonText, 
                  isPlaying && styles.playingButtonText,
                  isBuffering && styles.bufferingButtonText
                ]}>
                  {buttonIcon}
                </Text>
              </Animated.View>
              <Text style={[
                styles.buttonLabel,
                isPlaying && styles.playingButtonText,
                isBuffering && styles.bufferingButtonText
              ]}>
                {isLoading ? '加载中' : buttonText}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>内核版本: 0.75.4 | 开发者: 李上</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  // 深蓝黑色背景
  gradientBackground: {
    flex: 1,
    backgroundColor: '#0a0a12',
    position: 'relative',
    overflow: 'hidden'
  },

  // 雨滴容器样式
  rainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  // 雨滴样式
  rainDrop: {
    position: 'absolute',
    width: 2,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1,
    opacity: 0.8,
    zIndex: 99,
  },
  // 雨滴拖尾样式
  rainTail: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    width: 1,
    zIndex: 98,
  },
  content: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    position: 'relative',
    zIndex: 1
  },
  header: { alignItems: 'center', marginBottom: 60 },
  title: { fontSize: 42, color: '#fff', fontWeight: '200', letterSpacing: 5, textShadowColor: 'rgba(74, 144, 226, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  subtitle: { fontSize: 16, color: '#aaa', marginTop: 10 },
  description: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 5 },
  breathBackground: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#4a90e2',
    opacity: 0.1,
    filter: 'blur(50px)',
  },
  controlArea: { alignItems: 'center', zIndex: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#444', marginRight: 10 },
  statusDotActive: { 
    backgroundColor: '#4a90e2',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5
  },
  statusDotBuffering: { 
    backgroundColor: '#ffd700',
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    animationName: 'pulse',
    animationDuration: '1s',
    animationIterationCount: 'infinite'
  },
  statusText: { 
    color: '#888', 
    fontSize: 14,
    fontWeight: '300'
  },
  // 按钮容器，包含外圆环和按钮
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  // 呼吸灯外圆环
  buttonOuterRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4a90e2',
    opacity: 0.2,
    transform: [{ scale: 1 }],
    zIndex: 0
  },
  playButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 26, 0.8)',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    position: 'relative',
    zIndex: 1
  },
  playingButton: { 
    borderColor: '#4a90e2',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  bufferingButton: { 
    borderColor: '#ffd700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  playButtonText: { 
    color: '#fff', 
    fontSize: 32,
    fontWeight: '200'
  },
  playingButtonText: { 
    color: '#4a90e2',
    textShadowColor: 'rgba(74, 144, 226, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5
  },
  bufferingButtonText: { 
    color: '#ffd700',
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5
  },
  buttonLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 15,
    fontWeight: '300'
  },
  footer: { 
    position: 'absolute', 
    bottom: 30,
    opacity: 0.5
  },
  footerText: { 
    color: '#666', 
    fontSize: 10,
    fontWeight: '300'
  },
});

export default App;