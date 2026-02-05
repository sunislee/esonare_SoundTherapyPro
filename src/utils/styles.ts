import { StyleSheet, Platform, Dimensions, StatusBar, Easing } from 'react-native';
import { Typography } from '../theme/Typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = SCREEN_WIDTH - 40;

export const CommonStyles = StyleSheet.create({
  // 容器样式
  container: {
    flex: 1,
    backgroundColor: '#080912',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080912',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
  },
  section: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  sectionTitle: {
    width: ITEM_WIDTH,
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 20,
    fontFamily: Typography.fontFamily,
    letterSpacing: 0.5,
  },

  // 卡片样式
  cardWrapper: {
    width: ITEM_WIDTH,
    height: 110,
    marginBottom: 20,
    zIndex: 1,
    position: 'relative',
  },
  cardContainer: {
    width: ITEM_WIDTH,
    height: 110,
  },
  cardClip: {
    width: ITEM_WIDTH,
    height: 110,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  focusGlow: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 5,
    right: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  pressOverlay: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 2,
  },
  card: {
    width: ITEM_WIDTH,
    height: 110,
    borderRadius: 20,
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardPressed: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cardInner: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
  },
  cardBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  cardTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    fontFamily: Typography.fontFamily,
  },

  // 按钮样式
  cardPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cardPauseButton: {
    backgroundColor: '#6C5DD3',
  },
  cardPlayIcon: {
    fontSize: 20,
    color: '#333',
    marginLeft: 2,
  },
  cardPauseIcon: {
    color: '#FFF',
  },
  playIcon: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 30,
    borderRightWidth: 0,
    borderBottomWidth: 20,
    borderTopWidth: 20,
    borderLeftColor: '#fff',
    borderRightColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 8,
  },
  pauseIconContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 24,
  },
  pauseBar: {
    width: 8,
    height: 32,
    backgroundColor: '#fff',
    borderRadius: 4,
  },

  // 文本样式
  title: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Typography.fontFamily,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
    fontFamily: Typography.fontFamily,
  },
  userName: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
});

export const AnimatedStyles = {
  // 动画配置
  scaleDown: {
    toValue: 0.95,
    duration: 100,
    useNativeDriver: true,
  },
  scaleUp: {
    toValue: 1,
    friction: 5,
    tension: 40,
    useNativeDriver: true,
  },
  opacityDown: {
    toValue: 0.8,
    duration: 100,
    useNativeDriver: true,
  },
  opacityUp: {
    toValue: 1,
    duration: 100,
    useNativeDriver: true,
  },
  breathAnimation: {
    duration: 800,
    easing: Easing.inOut(Easing.sin),
    useNativeDriver: true,
  },
};

export const Constants = {
  SCREEN_WIDTH,
  ITEM_WIDTH,
};
