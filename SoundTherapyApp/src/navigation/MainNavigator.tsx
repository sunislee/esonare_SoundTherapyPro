import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';

// 导入所有必要的页面
import { ResourceDownloadScreen } from '../screens/ResourceDownloadScreen';
import NameEntryScreen from '../screens/NameEntryScreen';
import { MainTabNavigator } from './MainTabNavigator';
import ImmersivePlayerNew from '../screens/ImmersivePlayerNew';
import RemixSchemeManagerScreen from '../screens/RemixSchemeManagerScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AboutScreen from '../screens/AboutScreen';

export type RootStackParamList = {
  ResourceDownload: undefined;
  NameEntry: undefined;
  MainTabs: undefined;
  ImmersivePlayer: { sceneId?: string } | undefined;
  RemixSchemeManager: undefined;
  History: undefined;
  Settings: undefined;
  About: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="ResourceDownload"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen 
        name="ResourceDownload" 
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
      />
      <Stack.Screen 
        name="RemixSchemeManager" 
        component={RemixSchemeManagerScreen} 
      />
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
    </Stack.Navigator>
  );
}