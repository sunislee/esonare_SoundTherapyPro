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
        console.log('[CheckAndNavigate] 开始启动检查...');
        
        // 【强制重构】只做一件事：进入 DownloadScreen，让它自己判断
        console.log('[CheckAndNavigate] 进入 DownloadScreen');
        navigation.replace('Download');
      } catch (e) {
        console.error('[CheckAndNavigate] 检查失败:', e);
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