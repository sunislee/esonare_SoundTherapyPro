import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { EditNameModal } from '../components/EditNameModal';
import { AdvancedDebugModal } from '../components/AdvancedDebugModal';
import { HistoryService } from '../services/HistoryService';
import ToastUtil from '../utils/ToastUtil';
import { RootStackParamList } from '../navigation/MainNavigator';

type SettingsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

type SettingsItemType = 'switch' | 'action' | 'static';

type SettingsItem = {
  key: string;
  icon: string;
  title: string;
  subtitle?: string;
  type: SettingsItemType;
};

type SettingsSection = {
  title: string;
  data: SettingsItem[];
};

const FADE_OUT_KEY = '@fade_out_enabled';
const HIGH_QUALITY_KEY = '@settings_high_quality_audio';
const MIX_PRESETS_KEY = '@mix_presets';
const DEVELOPER_MODE_KEY = '@settings_developer_mode';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsNavigationProp>();
  const insets = useSafeAreaInsets();

  const [fadeOutOnTimer, setFadeOutOnTimer] = useState(false);
  const [highQualityAudio, setHighQualityAudio] = useState(false);
  const [userName, setUserName] = useState('');
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [clearHistoryVisible, setClearHistoryVisible] = useState(false);
  const [clearPresetsVisible, setClearPresetsVisible] = useState(false);
  const [advancedDebugVisible, setAdvancedDebugVisible] = useState(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [devClickCount, setDevClickCount] = useState(0);
  const devClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const fadeOutValue = await AsyncStorage.getItem(FADE_OUT_KEY);
        const highQualityValue = await AsyncStorage.getItem(HIGH_QUALITY_KEY);
        const devModeValue = await AsyncStorage.getItem(DEVELOPER_MODE_KEY);
        const savedName = await AsyncStorage.getItem('USER_NAME');
        
        if (fadeOutValue !== null) {
          setFadeOutOnTimer(fadeOutValue === 'true');
        }
        if (highQualityValue !== null) {
          setHighQualityAudio(highQualityValue === 'true');
        }
        if (devModeValue !== null) {
          setIsDeveloperMode(devModeValue === 'true');
        }
        if (savedName) {
          setUserName(savedName);
        }
      } catch (e) {}
    };
    loadSettings();
  }, []);

  const handleVersionClick = () => {
    if (devClickTimerRef.current) {
      clearTimeout(devClickTimerRef.current);
    }

    const newCount = devClickCount + 1;
    setDevClickCount(newCount);

    // 从第 3 次点击开始弹出动态计数提示 (无论开启还是关闭)
    if (newCount >= 3 && newCount < 7) {
      const remaining = 7 - newCount;
      ToastUtil.info(isDeveloperMode ? `还需点击 ${remaining} 次关闭调试` : `还需点击 ${remaining} 次开启调试`);
    }

    if (newCount >= 7) {
      if (!isDeveloperMode) {
        setIsDeveloperMode(true);
        AsyncStorage.setItem(DEVELOPER_MODE_KEY, 'true').catch(() => {});
        ToastUtil.success('开发者模式已开启');
      } else {
        setIsDeveloperMode(false);
        AsyncStorage.removeItem(DEVELOPER_MODE_KEY).catch(() => {});
        ToastUtil.info('开发者模式已关闭');
      }
      setDevClickCount(0);
    } else {
      devClickTimerRef.current = setTimeout(() => {
        setDevClickCount(0);
      }, 500); // Reset if not clicked within 500ms
    }
  };

  const handleToggleFadeOut = async (value: boolean) => {
    setFadeOutOnTimer(value);
    try {
      await AsyncStorage.setItem(FADE_OUT_KEY, value ? 'true' : 'false');
    } catch (e) {}
  };

  const handleToggleHighQuality = async (value: boolean) => {
    setHighQualityAudio(value);
    try {
      await AsyncStorage.setItem(HIGH_QUALITY_KEY, value ? 'true' : 'false');
    } catch (e) {}
  };

  const handleSaveName = async (newName: string) => {
    if (newName) {
      setUserName(newName);
      await AsyncStorage.setItem('USER_NAME', newName);
      ToastUtil.success('昵称已更新');
    }
    setEditNameVisible(false);
  };

  const handleClearHistoryConfirm = async () => {
    await HistoryService.clearHistory();
    setClearHistoryVisible(false);
  };

  const handleClearPresetsConfirm = async () => {
    try {
      await AsyncStorage.removeItem(MIX_PRESETS_KEY);
    } catch (e) {}
    setClearPresetsVisible(false);
  };

  const sections: SettingsSection[] = useMemo(
    () => {
      const baseSections: SettingsSection[] = [
        {
          title: '个人',
          data: [
            {
              key: 'editName',
              icon: '👤',
              title: '修改昵称',
              subtitle: userName || '朋友',
              type: 'action',
            },
          ],
        },
        {
          title: '音频',
          data: [
            {
              key: 'fadeOutOnTimer',
              icon: '🌙',
              title: '定时结束淡出',
              subtitle: '睡眠定时结束时淡出当前音轨',
              type: 'switch',
            },
            {
              key: 'highQualityAudio',
              icon: '🎧',
              title: '高质量音频',
              subtitle: '启用更高比特率的音频播放',
              type: 'switch',
            },
          ],
        },
        {
          title: '存储',
          data: [
            {
              key: 'clearHistory',
              icon: '🧹',
              title: '清除播放历史',
              subtitle: '删除所有历史记录',
              type: 'action',
            },
            {
              key: 'clearPresets',
              icon: '📁',
              title: '清除所有混音方案',
              subtitle: '删除本地保存的混音方案',
              type: 'action',
            },
          ],
        },
        {
          title: '关于',
          data: [
            {
              key: 'version',
              icon: '📦',
              title: '版本',
              subtitle: 'v1.0.13 (Pro)',
              type: 'static',
            },
            {
              key: 'developer',
              icon: '👨‍💻',
              title: '开发者',
              subtitle: 'fakecoder',
              type: 'static',
            },
          ],
        },
      ];

      if (isDeveloperMode) {
        baseSections.push({
          title: '开发者选项',
          data: [
            {
              key: 'devMenu',
              icon: '🛠️',
              title: '高级调试',
              subtitle: '查看应用调试信息',
              type: 'action',
            },
          ],
        });
      }

      return baseSections;
    },
    [fadeOutOnTimer, highQualityAudio, isDeveloperMode]
  );

  const renderItem = ({ item }: { item: SettingsItem }) => {
    const renderRight = () => {
      if (item.type === 'switch') {
        const value = item.key === 'fadeOutOnTimer' ? fadeOutOnTimer : highQualityAudio;
        const onValueChange =
          item.key === 'fadeOutOnTimer' ? handleToggleFadeOut : handleToggleHighQuality;
        return (
          <Switch
            value={value}
            onValueChange={onValueChange}
            thumbColor="#FFFFFF"
            trackColor={{
              false: 'rgba(255, 255, 255, 0.2)',
              true: '#6C5DD3',
            }}
          />
        );
      }
      if (item.type === 'static') {
        return <Text style={styles.staticValue}>{item.subtitle}</Text>;
      }
      return <Text style={styles.chevron}>›</Text>;
    };

    const handlePress = () => {
    if (item.type === 'action') {
      if (item.key === 'editName') {
        setEditNameVisible(true);
      } else if (item.key === 'clearHistory') {
        setClearHistoryVisible(true);
      } else if (item.key === 'clearPresets') {
        setClearPresetsVisible(true);
      } else if (item.key === 'devMenu') {
        setAdvancedDebugVisible(true);
      }
    } else if (item.type === 'switch') {
        if (item.key === 'fadeOutOnTimer') {
          handleToggleFadeOut(!fadeOutOnTimer);
        } else if (item.key === 'highQualityAudio') {
          handleToggleHighQuality(!highQualityAudio);
        }
      } else if (item.key === 'version') {
        handleVersionClick();
      }
    };

    const isInteractive = item.type === 'action' || item.type === 'switch' || item.key === 'version';

    return (
      <Pressable
        onPress={handlePress}
        android_ripple={
          isInteractive
            ? { color: 'rgba(255, 255, 255, 0.12)' }
            : undefined
        }
        style={({ pressed }) => [
          styles.itemContainer,
          pressed && isInteractive && styles.itemPressed,
        ]}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{item.icon}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {item.subtitle && item.type !== 'static' && (
            <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
          )}
        </View>
        <View style={styles.rightContainer}>{renderRight()}</View>
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: { section: SettingsSection }) => (
    <Text style={styles.sectionTitle}>{section.title}</Text>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={styles.backText}>{'< 返回'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        showsVerticalScrollIndicator={false}
      />

      <EditNameModal
        visible={editNameVisible}
        currentName={userName}
        onSave={handleSaveName}
        onCancel={() => setEditNameVisible(false)}
      />

      <ConfirmationModal
        visible={clearHistoryVisible}
        title="清除播放历史"
        message="确定要删除所有播放历史吗？此操作无法撤销。"
        confirmText="清除"
        cancelText="取消"
        onConfirm={handleClearHistoryConfirm}
        onCancel={() => setClearHistoryVisible(false)}
        isDestructive
      />

      <ConfirmationModal
        visible={clearPresetsVisible}
        title="清除所有混音方案"
        message="确定要删除所有已保存的混音方案吗？此操作无法撤销。"
        confirmText="清除"
        cancelText="取消"
        onConfirm={handleClearPresetsConfirm}
        onCancel={() => setClearPresetsVisible(false)}
        isDestructive
      />

      <AdvancedDebugModal
        visible={advancedDebugVisible}
        onClose={() => setAdvancedDebugVisible(false)}
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
    justifyContent: 'center',
    height: 56,
    backgroundColor: '#0F111A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  backText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
    marginTop: 8,
  },
  sectionSeparator: {
    height: 16,
  },
  itemSeparator: {
    height: 10,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1C1E2D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  itemPressed: {
    opacity: 0.85,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  itemSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  rightContainer: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  chevron: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  staticValue: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

export default SettingsScreen;
