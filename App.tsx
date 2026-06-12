import React, { useState, useEffect } from 'react';
import { StatusBar, useColorScheme, ActivityIndicator, View, Text, Platform, DeviceEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainNavigator } from './src/navigation/MainNavigator';
import { AudioProvider } from './src/context/AudioContext';
import AudioService from './src/services/AudioService';
import { initLanguage } from './src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { NativeModules } from 'react-native';
import { DownloadService } from './src/services/DownloadService';
import { preloadBackgroundAvailability } from './src/constants/scenes';

// 【v1.4.1 关键修复】获取当前应用版本号
const APP_VERSION_CODE = NativeModules?.PackageInfo?.versionCode || 141;
const STORAGE_KEY_LAST_VERSION = '@soundtherapy_last_version';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      const startTime = Date.now();
      try {
        console.log('[App] ====== 开始初始化应用 ======');
        
        // 第一步：初始化语言
        console.log('[App] [1/3] 初始化语言...');
        await initLanguage();
        console.log('[App] [1/3] ✅ 语言初始化完成');
        
        // 【v1.4.1 关键修复】检查版本升级，强制重置 TrackPlayer
        console.log('[App] [2/3] 检查版本升级...');
        const lastVersion = await AsyncStorage.getItem(STORAGE_KEY_LAST_VERSION);
        const currentVersion = APP_VERSION_CODE;
        
        if (!lastVersion || parseInt(lastVersion) < currentVersion) {
          console.log(`[App] 🔄 检测到版本升级：${lastVersion || '首次安装'} -> ${currentVersion}`);
          
          // 【关键修复】强制重置 TrackPlayer，清理旧版本状态
          try {
            console.log('[App] 🧹 强制重置 TrackPlayer...');
            await TrackPlayer.reset();
            console.log('[App] ✅ TrackPlayer 已重置');
          } catch (resetError: any) {
            console.warn('[App] ⚠️ TrackPlayer 重置失败（可能未初始化）:', resetError?.message);
          }
          
          // 保存当前版本号
          await AsyncStorage.setItem(STORAGE_KEY_LAST_VERSION, currentVersion.toString());
          console.log('[App] ✅ 已保存新版本号');
        } else {
          console.log('[App] ✅ 版本一致，跳过重置');
        }
        
        // 第三步：初始化 AudioService
        console.log('[App] [3/3] 初始化 AudioService...');
        const audioService = AudioService.getInstance();
        
        // 【防御性检查】确保 TrackPlayer 已就绪
        try {
          await audioService.setupPlayer();
          console.log('[App] [3/3] ✅ AudioService 初始化完成');
          
           // 【新增】预加载背景图片文件状态，避免RNFS.exists()异步问题
           console.log('[App] 预加载背景图片文件状态...');
           await preloadBackgroundAvailability();
           DeviceEventEmitter.emit('backgroundImagesReady');
          console.log('[App] ✅ 背景图片文件状态预加载完成');
        } catch (audioError: any) {
          console.error('[App] ❌ AudioService 初始化失败:', audioError?.message);
          // 尝试重新 setup
          console.log('[App] 🔄 尝试重新初始化 AudioService...');
          await new Promise(resolve => setTimeout(resolve, 500));
          await audioService.setupPlayer();
          console.log('[App] ✅ AudioService 重试成功');
        }
        
        const initTime = Date.now() - startTime;
        console.log(`[App] ⏱️ 应用初始化总耗时：${initTime}ms`);
        console.log('[App] ====== 应用初始化完成 ======');
        
        // 设置 isAudioReady 为 true，显示主界面
        setIsAudioReady(true);
        
        // 【关键修复】移除 App.tsx 中的后台下载逻辑
        // 下载任务统一由 ResourceDownloadScreen 负责，避免双重下载和进度冲突
        console.log('[App] 下载任务由 ResourceDownloadScreen 统一管理');
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
          <Text style={{ color: 'red' }}>初始化失败：{error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AudioProvider>
            <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
            <MainNavigator />
          </AudioProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
