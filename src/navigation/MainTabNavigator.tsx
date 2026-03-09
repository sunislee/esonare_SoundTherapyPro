import React from 'react';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export type MainTabParamList = {
  HomeTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [isReady, setIsReady] = React.useState(false);
  
  React.useEffect(() => {
    // Ensure translation is ready before rendering
    if (i18n && typeof t === 'function') {
      setIsReady(true);
    }
  }, [i18n, t]);
  
  const triggerHaptic = () => {
    ReactNativeHapticFeedback.trigger('impactLight', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };
  
  // Prevent rendering until ready
  if (!isReady || !t || !i18n) {
    return null;
  }
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6C5DD3',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          <View style={styles.tabBarBackground} />
        ),
        tabBarLabel: ({ focused, color }) => {
          if (route.name === 'HomeTab') {
            return <Text style={[styles.tabBarLabel, { color }]}>{t('tabs.scenes')}</Text>;
          } else {
            return <Text style={[styles.tabBarLabel, { color }]}>{t('tabs.profile')}</Text>;
          }
        },
      })}
      screenListeners={{
        tabPress: () => {
          triggerHaptic();
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
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
