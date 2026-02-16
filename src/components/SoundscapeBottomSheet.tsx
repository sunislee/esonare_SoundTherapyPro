import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Platform,
  BackHandler,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { PanGestureHandler, State, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Typography } from '../theme/Typography';
import type { Scene, SceneCategory } from '../constants/scenes';

type Props = {
  visible: boolean;
  soundscapes: Scene[];
  selectedId: string;
  onClose: () => void;
  onSelect: (soundscape: Scene) => void;
};

const HANDLE_HEIGHT = 24;
const SNAP_THRESHOLD = 50;
const CATEGORIES: SceneCategory[] = ['Nature', 'Healing', 'Brainwave', 'Life'];

export const SoundscapeBottomSheet: React.FC<Props> = ({
  visible,
  soundscapes,
  selectedId,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const SHEET_HEIGHT = screenHeight * 0.65;
  
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const listRef = useRef<FlatList<Scene>>(null);

  const [selectedCategory, setSelectedCategory] = useState<SceneCategory>('Nature');

  useEffect(() => {
    if (visible) {
      const onBackPress = () => {
        onClose();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      // Open
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 12,
      }).start();
    } else {
      // Close
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, SHEET_HEIGHT, translateY]);

  useEffect(() => {
    if (!visible) return;
    const current = soundscapes.find((s) => s.id === selectedId);
    if (current) {
      setSelectedCategory(current.category);
    } else {
      setSelectedCategory('Nature');
    }
  }, [visible, soundscapes, selectedId]);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY, velocityY } = event.nativeEvent;
      const isClosing = translationY > SNAP_THRESHOLD || velocityY > 500;

      if (isClosing) {
        // Close
        onClose();
        // Animation handled by useEffect(visible) change in parent, 
        // but for immediate feedback we can animate here too, 
        // usually safer to rely on prop change.
        // But if onClose doesn't change visible immediately, we might flicker.
        // Let's rely on parent updating 'visible'.
      } else {
        // Snap back to open
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
          speed: 12,
        }).start(() => {
          triggerHaptic();
        });
      }
      // Reset offset for next gesture? 
      // Animated.event with translationY maps directly to value.
      // If we use setOffset, it accumulates. Here we just want absolute position from 0.
      // Wait, Animated.event replaces the value. When gesture ends, value stays.
      // If we spring to 0, it resets.
      // BUT, PanGestureHandler translationY starts from 0 each gesture.
      // So we need to use offset or extractOffset.
      // Actually, simplest way with Animated.event and spring back:
      // We are animating 'translateY'.
      // If we don't use extractOffset, next gesture starts from 0 translation, which causes jump if translateY is not 0.
      // But we always snap to 0 or close. So next gesture starts from 0.
      // So simple mapping is fine.
    }
  };

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };
    ReactNativeHapticFeedback.trigger('impactLight', options);
  };

  const filteredSoundscapes = soundscapes.filter((s) => s.category === selectedCategory);

  const renderItem = ({ item }: { item: Scene }) => {
    const isSelected = item.id === selectedId;
    const localizedTitle = t(item.title, {
      defaultValue: item.shortName || item.id,
    });
    const localizedDesc = t(`scenes.${item.id}.desc`, {
      defaultValue: t('soundscape.description'),
    });
    return (
      <TouchableOpacity
        style={[
          styles.item,
          isSelected && styles.itemSelected,
        ]}
        onPress={() => {
          triggerHaptic();
          onClose();
          Promise.resolve(onSelect(item)).catch(() => {});
        }}
        activeOpacity={0.7}>
        <View style={[styles.colorDot, { backgroundColor: item.primaryColor }]} />
        <View style={styles.itemInfo}>
          <Text
            style={[styles.itemTitle, isSelected && styles.itemTitleSelected]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {localizedTitle}
          </Text>
          <Text style={styles.itemDesc} numberOfLines={1} ellipsizeMode="tail">
            {localizedDesc}
          </Text>
        </View>
        {isSelected ? (
          <View style={styles.checkIcon}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdropContainer, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { height: SHEET_HEIGHT },
          { transform: [{ translateY: Animated.diffClamp(translateY, 0, SHEET_HEIGHT) }] },
        ]}>

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          simultaneousHandlers={listRef}
        >
          <Animated.View style={styles.gestureContent}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            <Text style={styles.headerTitle}>{t('soundscape.pickerTitle')}</Text>

            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => {
                const isActive = cat === selectedCategory;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryButton, isActive && styles.categoryButtonActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedCategory(cat);
                    }}
                  >
                    <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>
                      {t(`soundscape.categories.${cat}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.listWrapper}>
              <FlatList
                ref={listRef}
                data={filteredSoundscapes}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled
                style={styles.list}
              />
            </View>
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </View>
  );
};



const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000, justifyContent: 'flex-end' },
  backdropContainer: { ...StyleSheet.absoluteFillObject },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' }, // Darker backdrop
  sheet: {
    backgroundColor: 'rgba(20, 23, 30, 0.95)', // Dark glass-like
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 40,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    // Shadow/Elevation
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    width: '100%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gestureContent: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  categoryButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  categoryLabel: {
    fontFamily: Typography.fontFamily,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  categoryLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listWrapper: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: { paddingHorizontal: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  itemSelected: { 
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorDot: { width: 40, height: 40, borderRadius: 20, marginRight: 16 },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemTitle: {
    fontFamily: Typography.fontFamily,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
    lineHeight: 20,
  },
  itemTitleSelected: { color: '#fff', fontWeight: '600' },
  itemDesc: { fontFamily: Typography.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },
  checkIcon: { marginLeft: 10, minWidth: 18, alignItems: 'center' },
  checkText: { color: '#fff', fontSize: 16 },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
});
