import { useEffect, useCallback } from 'react';
import { BackHandler, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

/**
 * 全局物理返回键处理钩子
 * 如果当前页面不是首页，执行普通返回操作
 * 如果当前页面是首页，弹出确认对话框
 * 
 * @param isHomeScreen - 是否为首页
 * @param navigation - 导航对象，用于执行返回操作
 */
export const useBackHandler = (isHomeScreen: boolean, navigation: any) => {
  const { t } = useTranslation();
  
  const handleBackPress = useCallback(() => {
    if (isHomeScreen) {
      // 在首页，显示确认对话框 - 使用 i18n.t() 实时获取当前语言
      Alert.alert(
        i18n.t('profile.modals.exitTitle'),
        i18n.t('profile.modals.exitMsg'),
        [
          {
            text: i18n.t('profile.modals.cancel'),
            onPress: () => {
              // 用户取消，不执行任何操作
            },
            style: 'cancel',
          },
          {
            text: i18n.t('profile.modals.exitConfirm') || i18n.t('profile.modals.confirm'),
            onPress: () => {
              // 用户确认退出应用
              BackHandler.exitApp();
            },
          },
        ],
        { cancelable: false }
      );
      return true; // 阻止默认返回行为
    } else {
      // 不在首页，执行普通返回操作
      if (navigation && navigation.canGoBack()) {
        navigation.goBack();
        return true; // 阻止默认返回行为
      }
      return false; // 允许默认返回行为
    }
  }, [isHomeScreen, navigation, i18n.language]); // 添加 i18n.language 依赖，确保语言切换时重新创建函数

  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        handleBackPress
      );

      return () => {
        backHandler.remove();
      };
    }, [handleBackPress])
  );
};