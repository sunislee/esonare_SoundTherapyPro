import React, { useState, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
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
import PolicyWebView from '../screens/PolicyWebView';
import { DownloadService } from '../services/DownloadService';
import { OfflineService } from '../services/OfflineService';
import { GLOBAL_TOTAL_SIZE, ASSET_LIST, AUDIO_MANIFEST, getLocalPath as getLocalPathHelper } from '../constants/audioAssets';

// 导入类型
export type RootStackParamList = {
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
  PolicyWebView: { url: string; title: string };
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
        // 【暴力修复 1】物理清空标记！不管本地有没有，先当成没有处理！
        console.log('[CheckAndNavigate] 物理清空资源就绪标记...');
        await AsyncStorage.removeItem('RESOURCES_READY_KEY');
        
        // 【暴力修复 2】异步等待空窗期：强制加一个 500ms 的 Loading 状态
        console.log('[CheckAndNavigate] 强制等待 500ms 确保状态加载完成...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 1. 检查 AsyncStorage 中的状态
        const userName = await AsyncStorage.getItem('USER_NAME');
        const hasSkipped = await AsyncStorage.getItem('HAS_SET_NAME');
        
        // 2. 【关键修复】调用新的 checkFullIntegrity() 方法，检查完整资源
        console.log('[CheckAndNavigate] 开始完整资源检查...');
        const fullIntegrity = await OfflineService.checkFullIntegrity();
        
        // 打印详细日志，显示所有缺失和损坏的文件
        console.log('[CheckAndNavigate] 完整资源检查结果:');
        fullIntegrity.details.forEach((detail, index) => {
          console.log(`  [${index + 1}] ${detail}`);
        });
        
        // 3. 根据检查结果导航
        // 【关键修复】强制重定向：如果完整资源检查失败，强制跳转到下载页
        if (!fullIntegrity.isComplete) {
          console.log('[CheckAndNavigate] 资源不完整，强制跳转到下载页');
          console.log(`[CheckAndNavigate] 缺失文件：${fullIntegrity.missingFiles.length}个 - ${fullIntegrity.missingFiles.join(', ')}`);
          console.log(`[CheckAndNavigate] 损坏文件：${fullIntegrity.corruptedFiles.length}个 - ${fullIntegrity.corruptedFiles.join(', ')}`);
          navigation.replace('Download');
          return;
        }
        
        console.log('[CheckAndNavigate] 资源完整，检查用户信息...');
        
        // 4. 资源完整的情况下，检查用户信息
        const hasUserInfo = userName || hasSkipped === 'true';
        
        if (hasUserInfo) {
          // 用户已经设置过信息，直接进入主应用
          console.log('[CheckAndNavigate] 用户已设置信息，直接进入主应用');
          navigation.replace('MainTabs');
        } else {
          // 资源完整但用户未设置名字，跳转到起名页
          console.log('[CheckAndNavigate] 资源完整但未设置名字，跳转到起名页');
          navigation.replace('NameEntry');
        }
      } catch (e) {
        console.error('[CheckAndNavigate] 检查失败:', e);
        // 检查失败时，跳转到下载页
        navigation.replace('Download');
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
        {/* 启动检查路由 */}
        <Stack.Screen 
          name="CheckAndNavigate" 
          component={CheckAndNavigate} 
        />
        <Stack.Screen 
          name="Landing" 
          component={LandingScreen} 
        />
        <Stack.Screen 
          name="Download" 
          component={ResourceDownloadScreen} 
        />
        <Stack.Screen 
          name="NameEntry" 
          component={NameEntryScreen} 
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
        <Stack.Screen 
          name="PolicyWebView" 
          component={PolicyWebView} 
          options={{
            headerShown: false,
          }}
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