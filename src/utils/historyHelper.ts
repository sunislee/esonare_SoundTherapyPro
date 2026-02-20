import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@SoundTherapy:history';
const MAX_HISTORY_ITEMS = 50;

export interface HistoryItem {
  soundscapeId: string;
  title: string;
  coverImage?: string;
  timestamp: number;
}

export const historyHelper = {
  async saveToHistory(soundscapeId: string, title: string, coverImage?: string) {
    try {
      const existingHistory = await this.getHistory();
      
      // 去重：移除已存在的相同记录
      const filteredHistory = existingHistory.filter(item => item.soundscapeId !== soundscapeId);
      
      // 新记录添加到最前面
      const newItem: HistoryItem = {
        soundscapeId,
        title,
        coverImage,
        timestamp: Date.now()
      };
      
      const newHistory = [newItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);
      
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      console.log(`[HistoryHelper] Saved to history: ${title} (${soundscapeId})`);
    } catch (error) {
      console.error('[HistoryHelper] Failed to save history:', error);
    }
  },

  async getHistory(): Promise<HistoryItem[]> {
    try {
      const historyData = await AsyncStorage.getItem(HISTORY_KEY);
      return historyData ? JSON.parse(historyData) : [];
    } catch (error) {
      console.error('[HistoryHelper] Failed to get history:', error);
      return [];
    }
  },

  async clearHistory() {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
      console.log('[HistoryHelper] History cleared');
    } catch (error) {
      console.error('[HistoryHelper] Failed to clear history:', error);
    }
  }
};