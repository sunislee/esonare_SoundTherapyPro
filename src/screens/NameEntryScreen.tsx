import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  BackHandler,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { Typography } from '../theme/Typography';
import { useTranslation } from 'react-i18next';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

// 错误边界组件
const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>加载失败，请重试</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setHasError(false)}>
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundaryInner onError={() => setHasError(true)}>
      {children}
    </ErrorBoundaryInner>
  );
};

class ErrorBoundaryInner extends React.Component<{ children: React.ReactNode; onError: () => void }> {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[NameEntryScreen] 错误边界捕获:', error, errorInfo);
    this.props.onError();
  }

  render() {
    return this.props.children;
  }
}

const NameEntryScreen: React.FC = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  // 防御性检查：确保翻译函数已准备好
  const [isTranslationReady, setIsTranslationReady] = useState(false);
  
  useEffect(() => {
    if (t && typeof t === 'function') {
      setIsTranslationReady(true);
    }
  }, [t]);
  
  // 安全的翻译函数
  const safeT = (key: string, defaultValue?: string) => {
    if (!isTranslationReady || !t || typeof t !== 'function') {
      return defaultValue || key;
    }
    return t(key);
  };

  // 【关键修复】拦截返回键，防止黑屏
  useEffect(() => {
    const onBackPress = () => {
      Alert.alert(
        safeT('common.confirmExit', '确认退出'),
        safeT('common.confirmExitMessage', '确定要退出应用吗？'),
        [
          { text: safeT('common.cancel', '取消'), style: 'cancel' },
          { 
            text: safeT('common.exit', '退出'), 
            style: 'destructive',
            onPress: () => {
              // 双击返回或确认后退出
              BackHandler.exitApp();
            }
          }
        ]
      );
      return true; // 阻止默认返回行为
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      // 【修复】RN 0.81 兼容性：使用 remove() 方法代替 removeEventListener
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, []);

  const handleStart = async () => {
    // 【关键日志】记录点击事件
    console.log('[NameEntryScreen] --- CRITICAL: Confirm button clicked');
    
    const finalName = name.trim();
    if (finalName && !isLoading) {
      setIsLoading(true);
      
      console.log('[NameEntryScreen] --- CRITICAL: 开始处理用户名输入 ---');
      
      try {
        // 【关键修复】防御性检查 HapticFeedback
        if (ReactNativeHapticFeedback && typeof ReactNativeHapticFeedback.trigger === 'function') {
          ReactNativeHapticFeedback.trigger('impactMedium');
        } else {
          console.warn('[NameEntryScreen] ⚠️ HapticFeedback 不可用，跳过触觉反馈');
        }
        
        await AsyncStorage.setItem('USER_NAME', finalName);
        console.log('[NameEntryScreen] ✅ USER_NAME 保存成功:', finalName);
        
        await AsyncStorage.setItem('HAS_SET_NAME', 'true');
        console.log('[NameEntryScreen] ✅ HAS_SET_NAME 保存成功');
        
        // 验证读取
        const verifyName = await AsyncStorage.getItem('USER_NAME');
        const verifySkip = await AsyncStorage.getItem('HAS_SET_NAME');
        console.log('[NameEntryScreen] 验证读取 - USER_NAME:', verifyName, '| HAS_SET_NAME:', verifySkip);
        
        console.log('[NameEntryScreen] --- CRITICAL: 准备跳转到 MainTabs ---');
        
        // 添加延迟，确保 AudioService 有足够时间初始化
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('[NameEntryScreen] 跳转到 MainTabs');
        
        // 【关键修复】防御性导航调用
        if (navigation && typeof navigation.replace === 'function') {
          navigation.replace('MainTabs');
        } else {
          console.error('[NameEntryScreen] ❌ 导航不可用，无法跳转');
          // 即使导航失败，也要重置加载状态
          setIsLoading(false);
        }
        
      } catch (error) {
        console.error('[NameEntryScreen] ❌ 全局错误捕获:', error);
        console.error('[NameEntryScreen] ❌ 错误堆栈:', error?.stack);
        
        // 即使出错也要允许用户继续使用应用
        console.log('[NameEntryScreen] ⚠️ 出错后强制跳转到 MainTabs');
        if (navigation && typeof navigation.replace === 'function') {
          navigation.replace('MainTabs');
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      console.warn('[NameEntryScreen] ⚠️ 用户名为空或加载中，忽略点击');
    }
  };

  const handleSkip = async () => {
    console.log('[NameEntryScreen] --- CRITICAL: 用户跳过命名 ---');
    
    try {
      // 跳过时也保存一个默认用户名，防止 LandingScreen 再次跳转回来
      // 硬编码默认值，不依赖 t() 函数，避免翻译未初始化
      const defaultName = '旅行者';
      await AsyncStorage.setItem('USER_NAME', defaultName);
      console.log('[NameEntryScreen] ✅ USER_NAME 保存成功 (skip, default):', defaultName);
      
      await AsyncStorage.setItem('HAS_SET_NAME', 'true');
      console.log('[NameEntryScreen] ✅ HAS_SET_NAME 保存成功 (skip)');
      
      // 验证读取
      const verifyName = await AsyncStorage.getItem('USER_NAME');
      const verifySkip = await AsyncStorage.getItem('HAS_SET_NAME');
      console.log('[NameEntryScreen] 验证读取 - USER_NAME:', verifyName, '| HAS_SET_NAME:', verifySkip);
      console.log('[NameEntryScreen] DEBUG_SAVE_END: 保存完成');
      
      // 添加延迟，确保 AudioService 有足够时间初始化
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[NameEntryScreen] 跳过命名，跳转到 MainTabs');
      
      // 【关键修复】防御性导航调用
      if (navigation && typeof navigation.replace === 'function') {
        navigation.replace('MainTabs');
      } else {
        console.error('[NameEntryScreen] ❌ 导航不可用，无法跳转');
      }
      
    } catch (error) {
      console.error('[NameEntryScreen] ❌ 跳过时保存失败:', error);
      console.error('[NameEntryScreen] ❌ 错误堆栈:', error?.stack);
      
      // 即使出错也要允许用户继续使用应用
      console.log('[NameEntryScreen] ⚠️ 出错后强制跳转到 MainTabs');
      if (navigation && typeof navigation.replace === 'function') {
        navigation.replace('MainTabs');
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{safeT('nameEntry.title', '请输入您的名字')}</Text>
        <Text style={styles.subtitle}>{safeT('nameEntry.subtitle', '这将作为您的个性化标识')}</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={safeT('nameEntry.placeholder', '请输入名字')}
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={12}
            selectionColor="#6C5DD3"
          />
          <View style={styles.underline} />
        </View>

        <TouchableOpacity 
          style={[styles.button, (!name.trim() || isLoading) && styles.buttonDisabled]} 
          onPress={handleStart}
          disabled={!name.trim() || isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Loading...' : safeT('nameEntry.button', '确定')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>{safeT('nameEntry.skip', '跳过')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 28,
    color: '#fff',
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: Typography.fontFamily,
    marginBottom: 60,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 60,
  },
  input: {
    fontSize: 24,
    color: '#fff',
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    paddingVertical: 10,
  },
  underline: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: '#6C5DD3',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#6C5DD3",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(108, 93, 211, 0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: Typography.fontFamily,
    fontWeight: 'bold',
  },
  skipButton: {
    marginTop: 24,
    padding: 10,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontFamily: Typography.fontFamily,
  },
});

// 使用错误边界包装 NameEntryScreen
export default function NameEntryScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <NameEntryScreen />
    </ErrorBoundary>
  );
}
