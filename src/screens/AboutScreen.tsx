import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import packageJson from '../../package.json';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useBackHandler } from '../hooks/useBackHandler';

const AboutScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  // 预加载协议页面
  useEffect(() => {
    console.log('[AboutScreen] Preloading policy pages...');
    
    // 预加载隐私政策和用户协议
    const privacyUrl = 'https://sunislee.github.io/esonare_SoundTherapyPro/legal/index.html';
    const termsUrl = 'https://sunislee.github.io/esonare_SoundTherapyPro/legal/terms.html';
    
    // 使用 Image.prefetch 预加载（虽然不是图片，但可以触发网络请求）
    Image.prefetch(privacyUrl).catch(() => {});
    Image.prefetch(termsUrl).catch(() => {});
    
    console.log('[AboutScreen] Preload initiated for policy pages');
  }, []);
  
  const handleOpenPrivacyPolicy = () => {
    const url = 'https://sunislee.github.io/esonare_SoundTherapyPro/legal/index.html';
    
    // 使用 WebView 打开
    navigation.navigate('PolicyWebView', { url, title: t('about.privacy') });
  };

  const handleOpenTermsOfService = () => {
    const url = 'https://sunislee.github.io/esonare_SoundTherapyPro/legal/terms.html';
    
    // 使用 WebView 打开
    navigation.navigate('PolicyWebView', { url, title: t('about.terms') });
  };

  // 使用全局返回键处理逻辑（非首页）
  useBackHandler(false, navigation);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={styles.backText}>{`< ${t('settings.back')}`}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('about.header')}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>{t('appTitle')}</Text>
          <Text style={styles.version}>{t('settings.version')} {packageJson.version}</Text>
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('about.kernelVersion')}</Text>
            <Text style={styles.infoValue}>React Native 0.73</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.infoItem} onPress={handleOpenPrivacyPolicy}>
            <Text style={styles.infoLabel}>{t('about.privacy')}</Text>
            <Text style={styles.infoValue}>{`>`}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.infoItem} onPress={handleOpenTermsOfService}>
            <Text style={styles.infoLabel}>{t('about.terms')}</Text>
            <Text style={styles.infoValue}>{`>`}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('settings.developer')}</Text>
            <Text style={styles.infoValue}>sunis_fakecoder</Text>
          </View>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} Sound Meditation Pro. All rights reserved.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F111A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    backgroundColor: '#0F111A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  backText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  infoContainer: {
    width: '100%',
    backgroundColor: '#1C1E2D',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  infoValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
  },
  copyright: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
});

export default AboutScreen;
