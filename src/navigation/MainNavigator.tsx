import React, { useState, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

// 导入所有必要的页面
import LandingScreen from '../screens/LandingScreen';
import { ResourceDownloadScreen } from '../screens/ResourceDownloadScreen';
import NameEntryScreen from '../screens/NameEntryScreen';
import { MainTabNavigator } from './MainTabNavigator';
import ImmersivePlayerNew from '../screens/ImmersivePlayerNew';
import BreathDetailScreen from '../screens/BreathDetailScreen';
import MiniPlayer from '../components/MiniPlayer';
// import RemixSchemeManagerScreen from '../screens/RemixSchemeManagerScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AboutScreen from '../screens/AboutScreen';
import { DownloadService } from '../services/DownloadService';
import PermissionService from '../services/PermissionService';
import { GLOBAL_TOTAL_SIZE, ASSET_LIST, AUDIO_MANIFEST, getLocalPath as getLocalPathHelper } from '../constants/audioAssets';

// 导入类型
export type RootStackParamList = {
  CheckAndNavigate: undefined;
  Landing: undefined;
  Download: undefined;
  NameEntry: undefined;
  MainTabs: undefined;
  ImmersivePlayer: { sceneId?: string } | undefined;
  BreathDetail: { sceneId?: string } | undefined;
  RemixSchemeManager: undefined;
  History: undefined;
  Settings: undefined;
  About: undefined;
  Mixer: { presetId?: string } | undefined;
};

type NavigationType = NavigationProp<RootStackParamList>;

const Stack = createNativeStackNavigator<RootStackParamList>();

// 启动检查组件
const CheckAndNavigate = ({ navigation }: { navigation: NavigationType }) => {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAndNavigate = async () => {
      try {
        // 1. 请求通知权限
        console.log('[CheckAndNavigate] 请求通知权限...');
        const notificationGranted = await PermissionService.requestNotificationPermission();
        console.log(`[CheckAndNavigate] 通知权限: ${notificationGranted}`);
        
        if (!notificationGranted) {
          console.warn('[CheckAndNavigate] 通知权限被拒绝');
          // 显示权限被拒绝的提示
          PermissionService.showPermissionDeniedAlert();
        }
        
        // 2. 检查 AsyncStorage 中的状态
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        const resourceReady = await DownloadService.isResourceReady();
        
        // 2. 物理文件校验
        let localTotalSize = 0;
        for (const asset of ASSET_LIST) {
          const audioAsset = AUDIO_MANIFEST.find(a => a.id === asset.id);
          if (!audioAsset) continue;
          
          const localPath = getLocalPathHelper(audioAsset.category, audioAsset.filename);
          const fileExists = await RNFS.exists(localPath);
          
          if (fileExists) {
            try {
              const fileStat = await RNFS.stat(localPath);
              localTotalSize += Number(fileStat.size);
            } catch (e) {
              console.log(`[CheckAndNavigate] 文件读取失败: ${asset.id}, ${e}`);
            }
          }
        }
        
        const isReady = localTotalSize >= GLOBAL_TOTAL_SIZE;
        const resourcesReady = (isReady || resourceReady);
        
        // 打印详细日志
        console.log(`[CheckAndNavigate] 启动检查: Resources: ${resourcesReady}, Name: ${userName ? '存在' : '不存在'}, Skipped: ${hasSkipped === 'true'}`);
        console.log(`[CheckAndNavigate] 物理校验: ${localTotalSize} bytes / ${GLOBAL_TOTAL_SIZE} bytes`);
        
        // 3. 【关键修复】优先级：用户名 > 资源
        // 如果用户已设置名字，直接进主页（资源可以在后台下载）
        if (userName || hasSkipped === 'true') {
          console.log('[CheckAndNavigate] ✅ 用户已注册，跳转到 LandingScreen');
          navigation.navigate('Landing');
        } else if (!resourcesReady) {
          console.log('[CheckAndNavigate] ⚠️  资源未就绪且用户未注册，跳转到下载页');
          navigation.navigate('Download');
        } else {
          console.log('[CheckAndNavigate] 资源就绪但未设置名字，跳转到 NameEntry');
          navigation.navigate('NameEntry');
        }
      } catch (e) {
        console.error('[CheckAndNavigate] 检查失败:', e);
        navigation.navigate('Download');
      } finally {
        setIsChecking(false);
      }
    };
    
    checkAndNavigate();
  }, [navigation]);

  // 检查过程中显示加载界面
  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // 检查完成后会自动导航，这里不需要返回任何内容
  return null;
};

export function MainNavigator() {
  return (
    <>
      <Stack.Navigator
        initialRouteName="CheckAndNavigate"
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen 
          name="CheckAndNavigate" 
          component={CheckAndNavigate} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Landing" 
          component={LandingScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Download" 
          component={ResourceDownloadScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="NameEntry" 
          component={NameEntryScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabNavigator} 
        />
        <Stack.Screen 
          name="ImmersivePlayer" 
          component={ImmersivePlayerNew} 
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="BreathDetail" 
          component={BreathDetailScreen} 
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            headerShown: false,
          }}
        />
        {/* 
        <Stack.Screen 
          name="RemixSchemeManager" 
          component={RemixSchemeManagerScreen} 
        />
        */}
        <Stack.Screen 
          name="History" 
          component={HistoryScreen} 
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen} 
        />
        <Stack.Screen 
          name="About" 
          component={AboutScreen} 
        />
        {/* 
        <Stack.Screen 
          name="Mixer" 
          component={MixerScreen} 
          options={{
            headerShown: false,
            presentation: 'modal',
            tabBarStyle: { display: 'none' }, // 物理隔离 TabBar，防止穿透
          }}
        />
        */}
      </Stack.Navigator>
      <MiniPlayer />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});