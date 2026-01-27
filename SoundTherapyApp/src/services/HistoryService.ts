import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCENES, Scene } from '../constants/scenes';

const HISTORY_KEY = '@playback_history';
const MAX_HISTORY_ITEMS = 50;

export interface HistoryItem {
  soundscapeId: string;
  timestamp: number;
}

export const HistoryService = {
  /**
   * Add a soundscape to history.
   * If it already exists, it moves to the top.
   */
  addToHistory: async (soundscapeId: string) => {
    try {
      const jsonValue = await AsyncStorage.getItem(HISTORY_KEY);
      const history: HistoryItem[] = jsonValue != null ? JSON.parse(jsonValue) : [];
      
      // Remove existing item with same ID if present
      const filteredHistory = history.filter(item => item.soundscapeId !== soundscapeId);
      
      // Create new item
      const newItem: HistoryItem = {
        soundscapeId,
        timestamp: Date.now(),
      };
      
      // Add to front
      const newHistory = [newItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);
      
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to add to history:', error);
    }
  },

  /**
   * Get playback history.
   * Returns full Soundscape objects with timestamp.
   */
  getHistory: async (): Promise<(Scene & { playedAt: number })[]> => {
    try {
      const jsonValue = await AsyncStorage.getItem(HISTORY_KEY);
      const historyItems: HistoryItem[] = jsonValue != null ? JSON.parse(jsonValue) : [];
      
      // Map back to Soundscape objects
      const fullHistory = historyItems
        .map(item => {
          const soundscape = SCENES.find(s => s.id === item.soundscapeId);
          if (!soundscape) return null;
          return {
            ...soundscape,
            playedAt: item.timestamp,
          };
        })
        .filter((item): item is Scene & { playedAt: number } => item !== null);
        
      return fullHistory;
    } catch (error) {
      console.error('Failed to get history:', error);
      return [];
    }
  },

  /**
   * Clear all history.
   */
  clearHistory: async () => {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }
};
