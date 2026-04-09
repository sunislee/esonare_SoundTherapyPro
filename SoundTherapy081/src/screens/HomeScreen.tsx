import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  InteractionManager,
  Easing,
  Alert,
  findNodeHandle
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import AudioService from '../services/AudioService';
import { RainDrop } from '../components/RainDrop';
import { SCENES, Scene } from '../constants/scenes';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useAudio } from '../context/AudioContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { ScrollView } from 'react-native-gesture-handler';
import { Typography } from '../theme/Typography';
import { useTranslation } from 'react-i18next';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_WIDTH = SCREEN_WIDTH - 40;
const BUTTON_SIZE = 80;

// 抽离 SceneItem 组件
const SceneItem = React.memo(({ item, isPlaying, currentBaseSceneId, togglePlayback, navigation, isFocused, scrollOffset, scrollViewRef }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);
  const [itemY, setItemY] = useState<number | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const viewRef = useRef<View>(null);
  const { t } = useTranslation();

  const isThisPlaying = isPlaying && currentBaseSceneId === item.id;

  const triggerHaptic = () => {
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true });
  };

  useEffect(() => {
    if (isFocused && !hasAnimated && itemY !== null) {
      const isVisible = scrollOffset + SCREEN_HEIGHT > itemY + 20 && scrollOffset < itemY + 110;
      if (isVisible) {
        setHasAnimated(true);
        Animated.sequence([
          Animated.timing(highlightAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start();
      }
    }
  }, [isFocused, hasAnimated, itemY, scrollOffset]);

  const highlightScale = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const highlightOpacity = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });

  return (
    <View 
      ref={viewRef}
      style={styles.cardWrapper}
      onLayout={() => {
        if (viewRef.current && scrollViewRef.current) {
          const scrollNode = findNodeHandle(scrollViewRef.current);
          if (scrollNode) {
            viewRef.current.measureLayout(scrollNode, (_x, y) => setItemY(y), () => {});
          }
        }
      }}
    >
      <Animated.View style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.cardClip}>
          {isFocused && (
            <Animated.View 
              pointerEvents="none" 
              style={[styles.memoryHighlight, { opacity: highlightOpacity, transform: [{ scale: highlightScale }] }]} 
            />
          )}
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.card, isPressed && styles.cardPressed]}
            onPressIn={() => {
              setIsPressed(true);
              Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
            }}
            onPressOut={() => {
              setIsPressed(false);
              Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
            }}
            onPress={() => {
              triggerHaptic();
              setTimeout(() => {
                if (item.id.includes('breath')) navigation.navigate('BreathDetail', { sceneId: item.id });
                else navigation.navigate('ImmersivePlayer', { sceneId: item.id });
              }, 50);
            }}
          >
            <View style={styles.cardInner}>
              <View style={[styles.cardBg, { backgroundColor: item.primaryColor }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{t(`scenes.${item.id}.title`, { defaultValue: item.title })}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{t(`categories.${item.category.toLowerCase()}`)}</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.cardPlayButton, isThisPlaying && styles.cardPauseButton]} 
                  onPress={() => { triggerHaptic(); togglePlayback(item); }}
                >
                  <Text style={[styles.cardPlayIcon, isThisPlaying && styles.cardPauseIcon]}>{isThisPlaying ? '||' : '▶'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
});

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPlaying, currentBaseSceneId, togglePlayback } = useAudio();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [userName, setUserName] = useState('');
  const [slogan, setSlogan] = useState('');
  const greetingFadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // 【核心修改】初始化 Pan 坐标，设在底部中央
  const pan = useRef(new Animated.ValueXY({ 
    x: SCREEN_WIDTH / 2 - BUTTON_SIZE / 2, 
    y: SCREEN_HEIGHT - 260 
  })).current;

  useBackHandler(true, navigation);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('LAST_VIEWED_SCENE_ID').then(id => id && setFocusedSceneId(id));
      return () => setFocusedSceneId(null);
    }, [])
  );

  const categories = ['Nature', 'Life', 'Healing', 'Brainwave'];
  const groupedScenes = useMemo(() => {
    return categories.map(cat => ({
      title: cat,
      label: t(`categories.${cat.toLowerCase()}`),
      baseScenes: SCENES.filter(s => s.category === cat && s.isBaseScene),
    }));
  }, [t, i18n.language]);

  useEffect(() => {
    AsyncStorage.getItem('USER_NAME').then(name => setUserName(name || ''));
    const slogans = [t('slogans.journey'), t('slogans.peace'), t('slogans.silence')];
    setSlogan(slogans[Math.floor(Math.random() * slogans.length)]);
    Animated.timing(greetingFadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [t]);

  // 【核心修改】PanResponder 逻辑：去掉了回弹跳变，增加 flattenOffset
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.extractOffset(); // 锁定当前位置为起点
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gestureState) => {
        pan.flattenOffset(); // 合并偏移量

        // 如果是点击（移动距离极小）
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          navigation.navigate('NoiseCancellation');
          return;
        }

        // 计算吸附目标
        const targetX = pan.x._value < (SCREEN_WIDTH / 2 - BUTTON_SIZE / 2) ? 20 : (SCREEN_WIDTH - BUTTON_SIZE - 20);
        const minY = insets.top + 20;
        const maxY = SCREEN_HEIGHT - BUTTON_SIZE - 120;
        const targetY = Math.min(Math.max(pan.y._value, minY), maxY);

        // 丝滑吸附动画，不回弹
        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 7,
          tension: 40,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.gradientBackground}>
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollOffset(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
            <Icon name="leaf-outline" size={40} color="rgba(255,255,255,0.4)" style={styles.headerIcon} />
            <Text style={styles.title}>{t('appTitle')}</Text>
            <Animated.View style={{ opacity: greetingFadeAnim }}>
              <Text style={styles.subtitle}>
                {t('greetings.hello')}{userName ? `, ${userName}` : ''}. {slogan}
              </Text>
            </Animated.View>
          </View>

          {groupedScenes.map((group) => (
            <View key={group.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.label}</Text>
              {group.baseScenes.map((scene: Scene) => (
                <SceneItem 
                  key={scene.id} item={scene} isPlaying={isPlaying} 
                  currentBaseSceneId={currentBaseSceneId} togglePlayback={togglePlayback} 
                  navigation={navigation} isFocused={focusedSceneId === scene.id}
                  scrollOffset={scrollOffset} scrollViewRef={scrollViewRef}
                />
              ))}
            </View>
          ))}
        </ScrollView>
        
        {/* 【核心修改】简化的悬浮按钮：只用 Transform 控制 */}
        <Animated.View
          style={[styles.noiseContainer, { transform: pan.getTranslateTransform() }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity 
            style={styles.noiseCancelHexagon} 
            activeOpacity={0.8}
            onPress={() => {
              navigation.navigate('NoiseCancellation');
            }}
          >
            <Icon name="volume-mute-outline" size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.noiseCancelLabel}>一键降噪</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080912' },
  gradientBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: '#080912' },
  scrollContent: { paddingBottom: 120, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  headerIcon: { marginBottom: 10 },
  title: { fontSize: 32, color: '#fff', fontWeight: '700', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', marginTop: 8 },
  section: { width: '100%', alignItems: 'center', marginBottom: 40 },
  sectionTitle: { width: ITEM_WIDTH, fontSize: 22, color: '#fff', fontWeight: '700', marginBottom: 20 },
  cardWrapper: { width: ITEM_WIDTH, height: 110, marginBottom: 20 },
  cardContainer: { width: ITEM_WIDTH, height: 110 },
  cardClip: { width: ITEM_WIDTH, height: 110, overflow: 'hidden', borderRadius: 20 },
  memoryHighlight: { position: 'absolute', top: 10, bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', zIndex: 3 },
  card: { width: ITEM_WIDTH, height: 110, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  cardPressed: { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.1)' },
  cardInner: { flex: 1, borderRadius: 20, justifyContent: 'center' },
  cardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.15 },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  cardText: { flex: 1, marginRight: 16 },
  cardTitle: { fontSize: 20, color: '#fff', fontWeight: '700' },
  cardSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  cardPlayButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  cardPlayIcon: { fontSize: 20, color: '#333', marginLeft: 2 },
  cardPauseButton: { backgroundColor: '#6C5DD3' },
  cardPauseIcon: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  // 悬浮按钮容器
  noiseContainer: {
    position: 'absolute',
    left: 0, // 初始偏移靠 pan 控制
    top: 0,
    width: BUTTON_SIZE,
    alignItems: 'center',
    zIndex: 10000,
  },
  noiseCancelHexagon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 8,
    shadowColor: '#4A90E2',
    shadowRadius: 10,
    shadowOpacity: 0.6,
  },
  noiseCancelLabel: { marginTop: 8, fontSize: 12, color: '#fff', fontWeight: '600' },
});