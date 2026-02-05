import zh from './locales/zh.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

// 定义翻译资源类型
export type TranslationResources = {
  zh: {
    translation: typeof zh;
  };
  en: {
    translation: typeof en;
  };
  ja: {
    translation: typeof ja;
  };
};

// 定义翻译键类型
export type TranslationKeys = keyof typeof zh | 
  keyof typeof zh.categories | 
  keyof typeof zh.actions | 
  keyof typeof zh.slogans | 
  keyof typeof zh.greetings |
  `${keyof typeof zh}.${keyof typeof zh.categories}` |
  `${keyof typeof zh}.${keyof typeof zh.actions}` |
  `${keyof typeof zh}.${keyof typeof zh.slogans}` |
  `${keyof typeof zh}.${keyof typeof zh.greetings}`;

// 扩展 i18next 类型
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: TranslationResources;
    defaultNS: 'translation';
  }
}
