import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';

// 导入所有必要的页面
import { ResourceDownloadScreen } from '../screens/ResourceDownloadScreen';
import NameEntryScreen from '../screens/NameEntryScreen';
import { MainTabNavigator } from './MainTabNavigator';
import ImmersivePlayerNew from '../screens/ImmersivePlayerNew';

export type RootStackParamList = {
  ResourceDownload: undefined;
  NameEntry: undefined;
  MainTabs: undefined;
  ImmersivePlayer: { sceneId?: string } | undefined;
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
    </Stack.Navigator>
  );
}