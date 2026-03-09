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

// 获取系统语言 - 增强 RN 0.73 兼容性
const getSystemLanguage = (): string => {
  try {
    let locale: string | null | undefined;
    
    if (Platform.OS === 'ios') {
      // iOS: 尝试从 SettingsManager 获取
      const settings = NativeModules.SettingsManager?.settings;
      if (settings?.AppleLanguages && Array.isArray(settings.AppleLanguages)) {
        locale = settings.AppleLanguages[0];
      }
      // 备用方案：尝试从 I18nManager 获取
      if (!locale) {
        locale = (I18nManager as any).localeIdentifier;
      }
    } else {
      // Android: 多方案降级获取
      locale = NativeModules.I18nManager?.localeIdentifier || 
               NativeModules.I18nManager?.getConstants?.()?.localeIdentifier ||
               (NativeModules as any).Configuration?.locale ||
               (NativeModules as any).I18nUtil?.localeIdentifier;
      
      // 最后的尝试：从 I18nManager.getConstants() 获取
      if (!locale) {
        try {
          const constants = (I18nManager as any).getConstants?.();
          locale = constants?.localeIdentifier;
        } catch (e) {
          // 忽略错误
        }
      }
    }

    // 如果获取失败，默认返回 'en'
    if (!locale) {
      console.log('[i18n] Cannot detect system locale, using default: en');
      return 'en';
    }
    
    // 标准化 locale 格式：en-US -> en, zh-CN -> zh
    const lowerLocale = locale.toLowerCase().replace('_', '-');
    
    // 提取语言代码（处理 en-US, zh-CN, ja-JP 等）
    const languageCode = lowerLocale.split('-')[0];
    
    // 只支持我们有的语言包
    if (['zh', 'en', 'ja'].includes(languageCode)) {
      console.log(`[i18n] Detected language: ${languageCode} from ${locale}`);
      return languageCode;
    }
    
    // 不支持的语言，回退到英文
    console.log(`[i18n] Language ${languageCode} not supported, falling back to en`);
    return 'en';
  } catch (error) {
    console.warn('[i18n] getSystemLanguage error:', error);
    return 'en';
  }
};

// 配置 i18next - 增加错误保护和 en-US 兼容性
try {
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
      lng: getSystemLanguage(),
      fallbackLng: 'en',
      // 关键配置：支持 en-US -> en 的语言回退
      load: 'languageOnly',
      // 非严格模式，允许语言代码大小写不敏感
      cleanCode: true,
      // 语言回退路径：en-US -> en
      nonExplicitSupportedLngs: true,
      interpolation: {
        escapeValue: false,
      },
      // 兼容性配置
      react: {
        useSuspense: false,
      },
    });
} catch (error) {
  console.error('[i18n] i18next initialization failed:', error);
  // 紧急回退：使用最基本的配置
  try {
    i18n.init({
      resources: {
        en: {
          translation: { tabs: { scenes: 'Scenes', profile: 'Profile' } },
        },
      },
      lng: 'en',
      fallbackLng: 'en',
      load: 'languageOnly',
    });
  } catch (fallbackError) {
    console.error('[i18n] Emergency fallback failed:', fallbackError);
  }
}

// 初始化语言 - 增加错误保护
export const initLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('@settings_language');
    if (savedLanguage) {
      await i18n.changeLanguage(savedLanguage);
      console.log(`[i18n] Loaded saved language: ${savedLanguage}`);
    } else {
      const systemLng = getSystemLanguage();
      await i18n.changeLanguage(systemLng);
      console.log(`[i18n] Using system language: ${systemLng}`);
    }
  } catch (error) {
    console.error('[i18n] Language initialization failed:', error);
    // 紧急回退到英文
    try {
      await i18n.changeLanguage('en');
    } catch (fallbackError) {
      console.error('[i18n] Emergency language fallback failed:', fallbackError);
    }
  }
};

// 快速切换语言的函数
export const changeLanguage = async (language: 'zh' | 'en' | 'ja' | 'system') => {
  if (language === 'system') {
    await AsyncStorage.removeItem('@settings_language');
    const systemLng = getSystemLanguage();
    await i18n.changeLanguage(systemLng);
    console.log(`[i18n] Switched to system language: ${systemLng}`);
  } else {
    await i18n.changeLanguage(language);
    await AsyncStorage.setItem('@settings_language', language);
    console.log(`[i18n] Switched to language: ${language}`);
  }
};

export default i18n;

// 导出类型
export type { TranslationKeys, TranslationResources };
