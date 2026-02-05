import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform, NativeModules, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入语言包
import zh from './locales/zh.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

// 导入类型定义
import { TranslationResources, TranslationKeys } from './types';

// 获取系统语言
const getSystemLanguage = (): string => {
  try {
    let locale: string | undefined;
    
    if (Platform.OS === 'ios') {
      locale = NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
    } else {
      // Android
      locale = NativeModules.I18nManager?.localeIdentifier || 
               (I18nManager as any).localeIdentifier ||
               NativeModules.I18nManager?.getConstants?.()?.localeIdentifier ||
               NativeModules.SettingsManager?.settings?.localeIdentifier; // 有时 Android 也会在这个位置
    }

    // 如果还是获取不到，尝试通过系统原生接口（部分版本可能需要）
    if (!locale && Platform.OS === 'android') {
      locale = NativeModules.Configuration?.locale || 
               NativeModules.I18nUtil?.localeIdentifier;
    }

    // 最后的挣扎：从 I18nManager.getConstants() 再次尝试
    if (!locale && Platform.OS === 'android') {
      try {
        const constants = (I18nManager as any).getConstants?.();
        locale = constants?.localeIdentifier;
      } catch (e) {}
    }

    console.log('[i18n] Detected raw locale:', locale);

    if (!locale) return 'en';
    
    const lowerLocale = locale.toLowerCase().replace('_', '-');
    if (lowerLocale.includes('zh')) return 'zh';
    if (lowerLocale.includes('ja')) return 'ja';
    return 'en';
  } catch (error) {
    console.warn('[i18n] getSystemLanguage error:', error);
    return 'en';
  }
};

// 配置 i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        translation: zh,
      },
      en: {
        translation: en,
      },
      ja: {
        translation: ja,
      },
    },
    lng: getSystemLanguage(), // 初始使用系统语言
    fallbackLng: 'en', // 回退语言设为英文
    interpolation: {
      escapeValue: false, // React 已经处理了转义
    },
  });

// 初始化语言
export const initLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('@settings_language');
    if (savedLanguage) {
      await i18n.changeLanguage(savedLanguage);
    } else {
      const systemLng = getSystemLanguage();
      await i18n.changeLanguage(systemLng);
    }
  } catch (error) {
    console.error('[i18n] Init failed:', error);
  }
};

// 快速切换语言的函数
export const changeLanguage = async (language: 'zh' | 'en' | 'ja' | 'system') => {
  if (language === 'system') {
    await AsyncStorage.removeItem('@settings_language');
    const systemLng = getSystemLanguage();
    await i18n.changeLanguage(systemLng);
  } else {
    await i18n.changeLanguage(language);
    await AsyncStorage.setItem('@settings_language', language);
  }
};

export default i18n;

// 导出类型
export type { TranslationKeys, TranslationResources };
