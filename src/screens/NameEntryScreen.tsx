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

const NameEntryScreen: React.FC = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // 【关键修复】拦截返回键，防止黑屏
  useEffect(() => {
    const onBackPress = () => {
      Alert.alert(
        t('common.confirmExit'),
        t('common.confirmExitMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { 
            text: t('common.exit'), 
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

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    };
  }, []);

  const handleStart = async () => {
    const finalName = name.trim();
    if (finalName && !isLoading) {
      setIsLoading(true);
      
      console.log('[NameEntryScreen] 开始保存用户名:', finalName);
      
      // Haptic feedback
      ReactNativeHapticFeedback.trigger('impactMedium');
      
      try {
        await AsyncStorage.setItem('USER_NAME', finalName);
        console.log('[NameEntryScreen] ✅ USER_NAME 保存成功:', finalName);
        
        await AsyncStorage.setItem('HAS_SET_NAME', 'true');
        console.log('[NameEntryScreen] ✅ HAS_SET_NAME 保存成功');
        
        // 验证读取
        const verifyName = await AsyncStorage.getItem('USER_NAME');
        const verifySkip = await AsyncStorage.getItem('HAS_SET_NAME');
        console.log('[NameEntryScreen] 验证读取 - USER_NAME:', verifyName, '| HAS_SET_NAME:', verifySkip);
      } catch (e) {
        console.error('[NameEntryScreen] ❌ 保存失败:', e);
      }
      
      // Add small delay to ensure proper initialization
      setTimeout(() => {
        console.log('[NameEntryScreen] 跳转到 MainTabs');
        navigation.replace('MainTabs');
      }, 100);
    }
  };

  const handleSkip = async () => {
    console.log('[NameEntryScreen] DEBUG_SAVE_START: 用户跳过命名，开始保存');
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
    } catch (e) {
      console.error('[NameEntryScreen] ❌ 跳过时保存失败:', e);
    }
    navigation.replace('MainTabs');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('nameEntry.title')}</Text>
        <Text style={styles.subtitle}>{t('nameEntry.subtitle')}</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={t('nameEntry.placeholder')}
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
            {isLoading ? 'Loading...' : t('nameEntry.button')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>{t('nameEntry.skip')}</Text>
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

export default NameEntryScreen;
