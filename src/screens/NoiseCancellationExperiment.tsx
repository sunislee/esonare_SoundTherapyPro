import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import Icon from 'react-native-vector-icons/Ionicons';
import { AudioAnalyzer, FrequencyDistribution } from '../services/AudioAnalyzer';
import { SCENES } from '../constants/scenes';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * NoiseCancellationExperiment - AI 降噪实验室（独立实验页面）
 * 
 * 功能：
 * 1. 实时显示环境噪音的低/中/高频分布
 * 2. 仅做展示，不干预任何音频播放逻辑
 * 3. 权限拒绝时自动隐藏频谱条，不影响使用
 */
const NoiseCancellationExperiment: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  
  const [frequencyDist, setFrequencyDist] = useState<FrequencyDistribution | null>(null);
  const [hasPermission, setHasPermission] = useState(true);

  // 页面获得焦点时启动音频分析器
  useFocusEffect(
    useCallback(() => {
      console.log('[NoiseCancellationExperiment] 页面聚焦，启动音频分析器');
      
      // 启动音频分析器
      AudioAnalyzer.start((distribution) => {
        setFrequencyDist(distribution);
        setHasPermission(true);
      });
      
      // 页面失焦时停止分析器
      return () => {
        console.log('[NoiseCancellationExperiment] 页面失焦，停止音频分析器');
        AudioAnalyzer.stop();
      };
    }, [])
  );

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }
    return true;
  };

  // 注册系统返回键拦截
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => sub.remove();
    }, [])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* 背景图 */}
      <Image 
        source={require('../assets/logo.png')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <View style={styles.overlay} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-down" size={32} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>AI 降噪实验室</Text>
        <View style={styles.placeholder} />
      </View>

      {/* 提示文案 */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          实时显示环境噪音的频率分布
        </Text>
        <Text style={styles.infoSubText}>
          （仅展示，不影响音频播放）
        </Text>
        {!hasPermission && (
          <Text style={styles.permissionWarning}>
            ⚠️ 麦克风权限未授予，无法显示频谱
          </Text>
        )}
      </View>

      {/* 环境噪音频谱显示条（只读，不可交互） */}
      {frequencyDist && hasPermission ? (
        <View style={styles.frequencyBarsContainer}>
          <Text style={styles.frequencyLabel}>环境噪音分布</Text>
          <View style={styles.frequencyBars}>
            {/* 低频 */}
            <View style={styles.frequencyBar}>
              <View style={styles.frequencyBarBackground}>
                <View 
                  style={[
                    styles.frequencyBarFill, 
                    { 
                      width: `${frequencyDist.low}%`,
                      backgroundColor: '#FF6B6B' // 红色
                    }
                  ]} 
                />
              </View>
              <Text style={styles.frequencyBarText}>低频{'\n'}20-300Hz</Text>
            </View>
            
            {/* 中频 */}
            <View style={styles.frequencyBar}>
              <View style={styles.frequencyBarBackground}>
                <View 
                  style={[
                    styles.frequencyBarFill, 
                    { 
                      width: `${frequencyDist.mid}%`,
                      backgroundColor: '#4ECDC4' // 青色
                    }
                  ]} 
                />
              </View>
              <Text style={styles.frequencyBarText}>中频{'\n'}300-2kHz</Text>
            </View>
            
            {/* 高频 */}
            <View style={styles.frequencyBar}>
              <View style={styles.frequencyBarBackground}>
                <View 
                  style={[
                    styles.frequencyBarFill, 
                    { 
                      width: `${frequencyDist.high}%`,
                      backgroundColor: '#FFE66D' // 黄色
                    }
                  ]} 
                />
              </View>
              <Text style={styles.frequencyBarText}>高频{'\n'}2k-20kHz</Text>
            </View>
          </View>
          <Text style={styles.frequencyDBText}>总强度：{frequencyDist.totalDB} dB</Text>
        </View>
      ) : hasPermission ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在分析环境噪音...</Text>
        </View>
      ) : null}

      {/* 底部说明 */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          数据基于麦克风实时采集，每 100ms 更新一次
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width,
    height,
    opacity: 0.1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
  },
  placeholder: {
    width: 44,
  },
  infoContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  infoSubText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
  permissionWarning: {
    color: '#FF6B6B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  frequencyBarsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    marginHorizontal: 24,
    marginVertical: 20,
    paddingVertical: 30,
  },
  frequencyLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  frequencyBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  frequencyBar: {
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  frequencyBarBackground: {
    width: '100%',
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  frequencyBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  frequencyBarText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 14,
  },
  frequencyDBText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
  },
});

export default NoiseCancellationExperiment;
