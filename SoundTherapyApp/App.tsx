import React, { useEffect, useState } from 'react';
import { View, StatusBar, LogBox, StyleSheet, Platform, Text, ActivityIndicator, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import Toast from 'react-native-toast-message';

// Navigation
import { MainNavigator } from './src/navigation/MainNavigator';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/RootNavigation';

// Services
import AudioService from './src/services/AudioService';

// Components
import toastConfig from './src/config/toastConfig';
import { AudioProvider } from './src/context/AudioContext';

// Ignore common logs
LogBox.ignoreLogs(['Attempting to run JS driven animation']);

function StateAwareRouter() {
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // 全局状态检查：App 唤醒时如果正在播放，跳转到播放页
        if (AudioService.isPlaying()) {
          const scene = AudioService.getCurrentScene();
          if (scene) {
            console.log('[StateAwareRouter] App active & Audio playing, jumping to ImmersivePlayer:', scene.id);
            if (navigationRef.isReady()) {
              navigationRef.navigate('ImmersivePlayer', { sceneId: scene.id });
            }
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // App 启动时的初始检查
    const timer = setTimeout(() => {
      if (AudioService.isPlaying()) {
        const scene = AudioService.getCurrentScene();
        if (scene) {
          console.log('[StateAwareRouter] Initial check: Audio playing, jumping to ImmersivePlayer:', scene.id);
          if (navigationRef.isReady()) {
            navigationRef.navigate('ImmersivePlayer', { sceneId: scene.id });
          }
        }
      }
    }, 500); // 稍微延迟，等待导航系统就绪

    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);

  return null;
}

function AppContent() {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={styles.root}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent={true} 
      />
      
      <NavigationContainer ref={navigationRef}>
        <StateAwareRouter />
        <View style={styles.navContainer}>
          <MainNavigator />
        </View>
      </NavigationContainer>
      
      {/* Global Toast */}
      <Toast config={toastConfig} />
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log('[App] Initializing...');
    setIsReady(true);
  }, []);
  
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#6C5DD3" />
        <Text style={styles.loadingText}>正在初始化系统...</Text>
      </View>
    );
  }

  console.log('[App] Rendering Main Application Content');
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <AudioProvider>
            <AppContent />
          </AudioProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  navContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  subLoadingText: {
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
    fontSize: 12,
  },
  islandContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 999999,
    elevation: 100, // Android Elevation
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 20,
    marginTop: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
