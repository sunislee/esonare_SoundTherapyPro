import React, { useState, useEffect } from 'react';
import { StatusBar, useColorScheme, ActivityIndicator, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainNavigator } from './src/navigation/MainNavigator';
import { AudioProvider } from './src/context/AudioContext';
import AudioService from './src/services/AudioService';
import { initLanguage } from './src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('[App] ====== 开始初始化应用 ======');
        
        // 【关键】第一步：初始化语言
        console.log('[App] [1/2] 初始化语言...');
        await initLanguage();
        console.log('[App] [1/2] ✅ 语言初始化完成');
        
        // 第二步：初始化 AudioService
        console.log('[App] [2/2] 初始化 AudioService...');
        const audioService = AudioService.getInstance();
        await audioService.setupPlayer();
        console.log('[App] [2/2] ✅ AudioService 初始化完成');
        
        setIsAudioReady(true);
        console.log('[App] ====== 应用初始化完成 ======');
      } catch (error: any) {
        console.error('[App] ❌ 初始化失败:', error);
        console.error('[App] ❌ 错误信息:', error?.message);
        console.error('[App] ❌ 错误堆栈:', error?.stack);
        setError(error?.message || 'Unknown error');
        setIsAudioReady(true);
      }
    };

    initApp();
  }, []);

  // 【已禁用】自动播放逻辑：用户要求打开 App 时世界是安静的
  // useEffect(() => {
  //   if (!isAudioReady) return;
  //   
  //   let hasAutoPlayed = false; // 【播放状态锁】确保只自动播放一次
  //   
  //   const checkDownloadStatus = async () => {
  //     // 【严格判定】如果已经自动播放过，直接返回
  //     if (hasAutoPlayed) {
  //       return;
  //     }
  //     
  //     try {
  //       const downloaded = await AsyncStorage.getItem('resourcesDownloaded');
  //       console.log('[App] 检查 resourcesDownloaded:', downloaded);
  //       
  //       if (downloaded === 'true') {
  //         console.log('[App] --- [触发下载后自动播放逻辑] ---');
  //         console.log('[App] 检测到资源已下载，准备触发默认场景播放');
  //         
  //         // 【播放状态锁】标记已自动播放
  //         hasAutoPlayed = true;
  //         
  //         // 延迟 1 秒确保页面跳转完成
  //         setTimeout(async () => {
  //           try {
  //             const audioService = AudioService.getInstance();
  //             
  //             // 【关键检查】如果已经在播放，跳过
  //             const isPlaying = await audioService.getRealIsPlaying();
  //             console.log('[App] 自动播放前状态检查:', isPlaying ? 'playing' : 'stopped');
  //             
  //             if (isPlaying) {
  //               console.log('[App] ⚠️ 已经在播放，跳过自动播放');
  //               return;
  //             }
  //             
  //             // 【默认场景】深海呼吸（如果存在）
  //             const defaultScene = {
  //               id: 'nature_deep_sea',
  //               filename: 'base/deep_ocean_abyss.m4a',
  //               category: 'base',
  //               title: '深海呼吸'
  //             };
  //             
  //             console.log('[App] 调用 playScene:', defaultScene.id);
  //             await audioService.playScene(defaultScene as any);
  //             console.log('[App] ✅ 自动播放已触发（仅此一次）');
  //           } catch (e: any) {
  //             console.error('[App] ❌ 自动播放失败:', e?.message);
  //           }
  //         }, 1000);
  //       }
  //     } catch (e) {
  //       console.error('[App] 检查下载状态失败:', e);
  //     }
  //   };
  //   
  //   // 立即检查一次，不再轮询
  //   checkDownloadStatus();
  //   
  //   // 清理函数
  //   return () => {
  //     console.log('[App] 清理自动播放检查器');
  //     hasAutoPlayed = true; // 防止清理后还在执行
  //   };
  // }, [isAudioReady]);

  if (!isAudioReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <ActivityIndicator size="large" color="#6C5DD3" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <Text style={{ color: 'red' }}>初始化失败: {error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AudioProvider>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <MainNavigator />
          </AudioProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
