import React, { useState, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, NavigationProp } from '@react-navigation/native';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入页面
import LandingScreen from '../screens/LandingScreen';
import NameEntryScreen from '../screens/NameEntryScreen';
import { MainTabNavigator } from './MainTabNavigator';
import ImmersivePlayerNew from '../screens/ImmersivePlayerNew';
import BreathDetailScreen from '../screens/BreathDetailScreen';
import MiniPlayer from '../components/MiniPlayer';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AboutScreen from '../screens/AboutScreen';
import PolicyWebView from '../screens/PolicyWebView';
import NoiseCancellationRoom from '../screens/NoiseCancellationRoom';

// 导入类型
export type RootStackParamList = {
  Landing: undefined;
  NameEntry: undefined;
  MainTabs: undefined;
  ImmersivePlayer: { sceneId?: string } | undefined;
  BreathDetail: { sceneId?: string } | undefined;
  History: undefined;
  Settings: undefined;
  About: undefined;
  PolicyWebView: { url: string; title: string };
  NoiseRoom: undefined;
};

type NavigationType = NavigationProp<RootStackParamList>;

const Stack = createNativeStackNavigator<RootStackParamList>();

// 启动路由：仅负责检查用户状态，直接分流到目标页面
const AppBootstrap = ({ navigation }: { navigation: NavigationType }) => {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        console.log('[AppBootstrap] 启动中，进入品牌展示页...');
        navigation.replace('Landing');
      } catch (e) {
        console.error('[AppBootstrap] 异常:', e);
        navigation.replace('Landing');
      } finally {
        setIsChecking(false);
      }
    };
    
    bootstrap();
  }, [navigation]);

  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return null;
};

export function MainNavigator() {
  return (
    <>
      <Stack.Navigator
        initialRouteName="AppBootstrap"
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
        }}
      >
        {/* 【核心】启动路由：直接分流，无中间页面 */}
        <Stack.Screen 
          name="AppBootstrap" 
          component={AppBootstrap} 
        />
        
        {/* 品牌展示页（1.2s Logo 动画） */}
        <Stack.Screen 
          name="Landing" 
          component={LandingScreen} 
        />
        
        {/* 新用户起名页 */}
        <Stack.Screen 
          name="NameEntry" 
          component={NameEntryScreen} 
        />
        
        {/* 【主入口】首页 Tab 导航 */}
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabNavigator} 
        />
        
        {/* 播放器页面 */}
        <Stack.Screen 
          name="ImmersivePlayer" 
          component={ImmersivePlayerNew} 
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            headerShown: false,
          }}
        />
        
        {/* 呼吸详情页 */}
        <Stack.Screen 
          name="BreathDetail" 
          component={BreathDetailScreen} 
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            headerShown: false,
          }}
        />
        
        {/* 其他功能页面 */}
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen 
          name="PolicyWebView" 
          component={PolicyWebView} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="NoiseRoom" 
          component={NoiseCancellationRoom} 
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            headerShown: false,
          }}
        />
      </Stack.Navigator>
      
      {/* 全局 MiniPlayer */}
      <MiniPlayer />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#080912',
    justifyContent: 'center',
    alignItems: 'center',
  },
});