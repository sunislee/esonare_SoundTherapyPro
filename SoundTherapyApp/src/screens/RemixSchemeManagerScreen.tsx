import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ConfirmationModal } from '../components/ConfirmationModal';
import { EditSchemeModal } from '../components/EditSchemeModal';

// --- Design Constants ---
const COLORS = {
  background: '#0F111A', // Deep Midnight Blue
  cardBg: '#1C1E2D',     // Lighter Dark Blue/Grey
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.5)',
  accent: '#6C5DD3',     // Soft Pastel Purple for icon
  delete: '#FF453A',     // Red for delete
  border: 'rgba(255, 255, 255, 0.05)',
};

// --- Types ---
interface MixPreset {
  id: string;
  name: string;
  sceneId: string;
  mainVolume: number;
  rainVolume: number;
  fireVolume: number;
  ambientType: string;
}

const INITIAL_DATA: MixPreset[] = [];

/*
// --- 1. Safe Delete Button Component (Circular & Animated) ---
interface RightActionProps {
  progress: any;
  drag: any;
  onPress: () => void;
}

const RightAction = ({ progress, drag, onPress }: RightActionProps) => {
  return (
    <View style={styles.rightActionContainer}>
      <TouchableOpacity 
        style={styles.deleteButton} 
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={styles.deleteButtonText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );
};
*/

// --- 2. Main Item Component (Floating Card Style) ---
interface RemixSchemeItemProps {
  item: MixPreset;
  onDelete: (id: string) => void;
  onEdit: (item: MixPreset) => void;
}

const RemixSchemeItem = ({ item, onDelete, onEdit }: RemixSchemeItemProps) => {
  const swipeableRef = useRef<any>(null);

  const formatDate = (timestamp: string) => {
    const date = new Date(parseInt(timestamp));
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleDeletePress = () => {
    swipeableRef.current?.close();
    onDelete(item.id);
  };

  /*
  const renderRightActions = (
    progress: any,
    drag: any
  ) => {
    return (
      <RightAction progress={progress} drag={drag} onPress={handleDeletePress} />
    );
  };
  */
  const renderRightActions = () => null;

  return (
    <View style={styles.itemWrapper}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        friction={2}
        enableTrackpadTwoFingerGesture
        rightThreshold={40}
        containerStyle={styles.swipeableContainer}
        overshootRight={false} // Prevent overshooting to keep animation clean
      >
        <View style={styles.card}>
          {/* Decorative Sound Wave Icon */}
          <View style={styles.cardIconContainer}>
            <View style={styles.cardIconInner}>
              <Text style={{ fontSize: 20 }}>🎵</Text>
            </View>
          </View>
          
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSubtitle}>
              {formatDate(item.id)} •{' '}
              {item.ambientType === 'none'
                ? '纯净'
                : item.ambientType === 'rain'
                ? '雨声'
                : '篝火'}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={styles.editButton} 
            onPress={() => onEdit(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 18 }}>✏️</Text>
          </TouchableOpacity>
        </View>
      </Swipeable>
    </View>
  );
};

// --- 3. Main Screen Logic ---
const RemixSchemeManagerScreen: React.FC = () => {
  const [data, setData] = useState<MixPreset[]>(INITIAL_DATA);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedIdToDelete, setSelectedIdToDelete] = useState<string | null>(null);
  
  // Edit State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingScheme, setEditingScheme] = useState<MixPreset | null>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@mix_presets')
        .then((json) => {
          if (json) {
            setData(JSON.parse(json));
          }
        })
        .catch((err) => console.error(err));
    }, [])
  );

  const handleDelete = useCallback(
    (id: string) => {
      setSelectedIdToDelete(id);
      setModalVisible(true);
    },
    []
  );

  const confirmDelete = async () => {
    if (selectedIdToDelete) {
      const newData = data.filter((item) => item.id !== selectedIdToDelete);
      setData(newData);
      await AsyncStorage.setItem('@mix_presets', JSON.stringify(newData));
    }
    setModalVisible(false);
    setSelectedIdToDelete(null);
  };

  const cancelDelete = () => {
    setModalVisible(false);
    setSelectedIdToDelete(null);
  };

  const handleEdit = useCallback((item: MixPreset) => {
    setEditingScheme(item);
    setEditModalVisible(true);
  }, []);

  const saveSchemeName = async (newName: string) => {
    if (editingScheme && newName) {
      console.log(`[RemixSchemeManager] Renaming scheme '${editingScheme.name}' to '${newName}'`);
      const newData = data.map((item) =>
        item.id === editingScheme.id ? { ...item, name: newName } : item
      );
      setData(newData);
      await AsyncStorage.setItem('@mix_presets', JSON.stringify(newData));
      console.log('[RemixSchemeManager] Saved new name to AsyncStorage');
    }
    setEditModalVisible(false);
    setEditingScheme(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>我的混音</Text>
          <Text style={styles.headerSubtitle}>已保存 {data.length} 个方案</Text>
        </View>

        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RemixSchemeItem item={item} onDelete={handleDelete} onEdit={handleEdit} />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          showsVerticalScrollIndicator={false}
        />

        <ConfirmationModal
          visible={modalVisible}
          title="删除方案"
          message="确定要删除这个混音方案吗？此操作无法撤销。"
          confirmText="删除"
          cancelText="取消"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          isDestructive={true}
        />

        <EditSchemeModal
          visible={editModalVisible}
          title="重命名方案"
          initialValue={editingScheme?.name || ''}
          onConfirm={saveSchemeName}
          onCancel={() => {
            setEditModalVisible(false);
            setEditingScheme(null);
          }}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  itemWrapper: {
    // No overflow hidden here to allow shadow to be visible outside
    // But we need it for layout animation if we add it back. 
    // For Swipeable, usually we keep it simple.
  },
  swipeableContainer: {
    backgroundColor: 'transparent', // Important for floating card look
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    // Soft Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIconContainer: {
    marginRight: 16,
  },
  cardIconInner: {
    width: 48,
    height: 48,
    borderRadius: 24, // Circle
    backgroundColor: 'rgba(108, 93, 211, 0.15)', // Soft purple bg
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  // Right Action Styles
  rightActionContainer: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    // Transparent background to let the card float
  },
  deleteButton: {
    width: 56,
    height: 56,
    borderRadius: 28, // Perfectly circular
    backgroundColor: COLORS.delete,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.delete,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  deleteButtonText: {
    fontSize: 24,
  },
  editButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default RemixSchemeManagerScreen;
