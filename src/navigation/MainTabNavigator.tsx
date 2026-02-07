import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LottieView from 'lottie-react-native';
import { useTranslation } from 'react-i18next';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import AnimationTestScreen from '../screens/AnimationTestScreen';

export type MainTabParamList = {
  HomeTab: undefined;
  ProfileTab: undefined;
  TestTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TabIcon = ({ focused, source, routeName }: { focused: boolean; source: any; routeName: string }) => {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (focused) {
      // 物理级修复：执行 0-20 帧精华动效
      animationRef.current?.play(0, 20);
    } else {
      animationRef.current?.reset();
    }
  }, [focused]);

  // 根据路由定义需要上色的核心图层
  const iconLayers = routeName === 'HomeTab' 
    ? ['Door', 'Bottom', 'Top'] 
    : ['Layer 3 Outlines'];

  const colorFilters = [
    {
      keypath: '**',
      color: focused ? '#6C5DD3' : '#A1A1A1',
    },
    ...iconLayers.map(layer => ({
      keypath: layer,
      color: focused ? '#6C5DD3' : '#A1A1A1',
    })),
    {
      keypath: 'Shape Layer 1', // 强制切除扩散背景大圆圈，放在最后确保覆盖 **
      color: 'transparent',
    }
  ];

  return (
    <LottieView
      ref={animationRef}
      source={source}
      style={{
        width: 24,
        height: 24,
      }}
      autoPlay={false}
      loop={false}
      progress={focused ? undefined : 0.8} // 未选中固定在第 20 帧（总帧数 25）
      resizeMode="contain"
      colorFilters={colorFilters}
    />
  );
};

export const MainTabNavigator: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => {
          let source;

          if (route.name === 'HomeTab') {
            source = require('../assets/animations/home_animation.json');
          } else if (route.name === 'ProfileTab') {
            source = require('../assets/animations/profile_animation.json');
          } else {
            source = require('../assets/animations/download_loading.json');
          }

          return <TabIcon focused={focused} source={source} routeName={route.name} />;
        },
        tabBarActiveTintColor: '#6C5DD3',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          <View style={styles.tabBarBackground} />
        ),
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.scenes'),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('tabs.profile'),
        }}
      />
      <Tab.Screen
        name="TestTab"
        component={AnimationTestScreen}
        options={{
          tabBarLabel: '120Hz Test',
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderTopWidth: 0,
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    paddingTop: 10,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    opacity: 0.95,
  },
});
