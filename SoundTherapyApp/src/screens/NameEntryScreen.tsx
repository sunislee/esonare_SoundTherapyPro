import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { Typography } from '../theme/Typography';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const NameEntryScreen: React.FC = () => {
  const [name, setName] = useState('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleStart = async () => {
    const finalName = name.trim();
    if (finalName) {
      // 触觉反馈
      ReactNativeHapticFeedback.trigger('impactMedium');
      
      await AsyncStorage.setItem('USER_NAME', finalName);
      await AsyncStorage.setItem('HAS_SET_NAME', 'true');
      navigation.replace('MainTabs');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('HAS_SET_NAME', 'true');
    navigation.replace('MainTabs');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Text style={styles.title}>如何称呼您？</Text>
        <Text style={styles.subtitle}>让我们为您开启专属的治愈之旅</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="请输入您的名称"
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
          style={[styles.button, !name.trim() && styles.buttonDisabled]} 
          onPress={handleStart}
          disabled={!name.trim()}
        >
          <Text style={styles.buttonText}>开启之旅</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>暂时跳过</Text>
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
