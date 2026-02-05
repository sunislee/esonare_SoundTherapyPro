import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HistoryService } from '../services/HistoryService';
import AudioService from '../services/AudioService';
import { Scene as Soundscape } from '../constants/scenes';
import { RootStackParamList } from '../navigation/MainNavigator';
import { useTranslation } from 'react-i18next';

type HistoryScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'History'>;

type HistoryItemData = Soundscape & { playedAt: number };

const HistoryScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HistoryScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<HistoryItemData[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const items = await HistoryService.getHistory();
    setHistory(items);
  };

  const handlePlay = async (item: HistoryItemData) => {
    try {
      // Pass the item to the player screen to handle playback switch
      navigation.navigate('ImmersivePlayer', { sceneId: item.id }); 
    } catch (error) {
      console.error('Failed to navigate to history item:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return t('player.remix.date', { month: date.getMonth() + 1, day: date.getDate() }) + ` ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderItem = ({ item }: { item: HistoryItemData }) => (
    <TouchableOpacity style={styles.item} onPress={() => handlePlay(item)}>
      <Image source={item.backgroundSource} style={styles.thumbnail} />
      <View style={styles.info}>
        <Text style={styles.title}>{t(`scenes.${item.id}.title`) || item.title}</Text>
        <Text style={styles.time}>{t('player.history.lastPlayed', { time: formatTime(item.playedAt) })}</Text>
      </View>
      <View style={styles.playButton}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('player.history.title')}</Text>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={styles.backText}>{`< ${t('common.back')}`}</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}-${item.playedAt}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('player.history.empty')}</Text>
          </View>
        }
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F111A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    height: 60,
  },
  backButton: {
    zIndex: 10,
  },
  backText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    zIndex: 0,
  },
  listContent: {
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1E2D',
    borderRadius: 16,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 16,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 18,
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.3)',
  },
});

export default HistoryScreen;
