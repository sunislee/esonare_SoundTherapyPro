import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  Switch,
  TouchableOpacity,
  Modal,
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
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
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
  const { t } = useTranslation();

  const [fadeOutOnTimer, setFadeOutOnTimer] = useState(false);
  const [highQualityAudio, setHighQualityAudio] = useState(false);
  const [userName, setUserName] = useState('');
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [clearHistoryVisible, setClearHistoryVisible] = useState(false);
  const [clearPresetsVisible, setClearPresetsVisible] = useState(false);
  const [advancedDebugVisible, setAdvancedDebugVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [languageMode, setLanguageMode] = useState<'zh' | 'en' | 'ja' | 'system'>('system');
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
        const savedLanguage = await AsyncStorage.getItem('@settings_language');
        
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
        if (savedLanguage) {
          setLanguageMode(savedLanguage as any);
        } else {
          setLanguageMode('system');
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

    // Show dynamic count prompt starting from the 3rd click (regardless of enabled/disabled state)
    if (newCount >= 3 && newCount < 7) {
      const remaining = 7 - newCount;
      ToastUtil.info(t('settings.toast.devClick', { 
        count: remaining, 
        action: isDeveloperMode ? t('settings.toast.devActionClose') : t('settings.toast.devActionOpen') 
      }));
    }

    if (newCount >= 7) {
      if (!isDeveloperMode) {
        setIsDeveloperMode(true);
        AsyncStorage.setItem(DEVELOPER_MODE_KEY, 'true').catch(() => {});
        ToastUtil.success(t('settings.toast.devOn'));
      } else {
        setIsDeveloperMode(false);
        AsyncStorage.removeItem(DEVELOPER_MODE_KEY).catch(() => {});
        ToastUtil.info(t('settings.toast.devOff'));
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
      ToastUtil.success(t('settings.toast.nameUpdated'));
    }
    setEditNameVisible(false);
  };

  const handleSelectLanguage = async (lang: 'zh' | 'en' | 'ja' | 'system') => {
    await changeLanguage(lang);
    setLanguageMode(lang);
    setLanguageModalVisible(false);
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
      const getLanguageLabel = (lang: string) => {
        switch (lang) {
          case 'zh': return t('settings.zh');
          case 'en': return t('settings.en');
          case 'ja': return t('settings.ja');
          default: return t('settings.followSystem');
        }
      };

      const baseSections: SettingsSection[] = [
        {
          title: t('settings.personal'),
          data: [
            {
              key: 'editName',
              icon: '👤',
              title: t('settings.editName'),
              subtitle: userName || t('settings.defaultName'),
              type: 'action',
            },
            {
              key: 'language',
              icon: '🌐',
              title: t('settings.language'),
              subtitle: getLanguageLabel(languageMode),
              type: 'action',
            },
          ],
        },
        {
          title: t('settings.audio'),
          data: [
            {
              key: 'fadeOutOnTimer',
              icon: '🌙',
              title: t('settings.fadeOut'),
              subtitle: t('settings.fadeOutDesc'),
              type: 'switch',
            },
            {
              key: 'highQualityAudio',
              icon: '🎧',
              title: t('settings.highQuality'),
              subtitle: t('settings.highQualityDesc'),
              type: 'switch',
            },
          ],
        },
        {
          title: t('settings.storage'),
          data: [
            {
              key: 'clearHistory',
              icon: '🧹',
              title: t('settings.clearHistory'),
              subtitle: t('settings.clearHistoryDesc'),
              type: 'action',
            },
            {
              key: 'clearPresets',
              icon: '📁',
              title: t('settings.clearPresets'),
              subtitle: t('settings.clearPresetsDesc'),
              type: 'action',
            },
          ],
        },
        {
          title: t('settings.about'),
          data: [
            {
              key: 'version',
              icon: '📦',
              title: t('settings.version'),
              subtitle: 'v1.0.1 (Pro)',
              type: 'static',
            },
            {
              key: 'developer',
              icon: '👨‍💻',
              title: t('settings.developer'),
              subtitle: 'fakecoder',
              type: 'static',
            },
          ],
        },
      ];

      if (isDeveloperMode) {
        baseSections.push({
          title: t('settings.devOptions'),
          data: [
            {
              key: 'devMenu',
              icon: '🛠️',
              title: t('settings.advancedDebug'),
              subtitle: t('settings.advancedDebugDesc'),
              type: 'action',
            },
          ],
        });
      }

      return baseSections;
    },
    [fadeOutOnTimer, highQualityAudio, isDeveloperMode, userName, t]
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
      } else if (item.key === 'language') {
        setLanguageModalVisible(true);
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
          <Text style={styles.backText}>{`< ${t('settings.back')}`}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.header')}</Text>
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
        title={t('settings.modals.clearHistoryTitle')}
        message={t('settings.modals.clearHistoryMsg')}
        confirmText={t('settings.modals.confirm')}
        cancelText={t('settings.modals.cancel')}
        onConfirm={handleClearHistoryConfirm}
        onCancel={() => setClearHistoryVisible(false)}
        isDestructive
      />

      <ConfirmationModal
        visible={clearPresetsVisible}
        title={t('settings.modals.clearPresetsTitle')}
        message={t('settings.modals.clearPresetsMsg')}
        confirmText={t('settings.modals.confirm')}
        cancelText={t('settings.modals.cancel')}
        onConfirm={handleClearPresetsConfirm}
        onCancel={() => setClearPresetsVisible(false)}
        isDestructive
      />

      <AdvancedDebugModal
        visible={advancedDebugVisible}
        onClose={() => setAdvancedDebugVisible(false)}
      />

      <Modal
        visible={languageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setLanguageModalVisible(false)}
        >
          <View style={styles.languageModalContent}>
            <Text style={styles.languageModalTitle}>{t('settings.language')}</Text>
            {(['system', 'zh', 'en', 'ja'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={styles.languageOption}
                onPress={() => handleSelectLanguage(lang)}
              >
                <Text style={[
                  styles.languageOptionText,
                  languageMode === lang && styles.languageOptionActiveText
                ]}>
                  {lang === 'system' ? t('settings.followSystem') : 
                   lang === 'zh' ? t('settings.zh') : 
                   lang === 'en' ? t('settings.en') : t('settings.ja')}
                </Text>
                {languageMode === lang && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
    color: 'rgba(255, 255, 255, 0.4)',
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  languageModalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1C1E2D',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  languageOptionText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  languageOptionActiveText: {
    color: '#6C5DD3',
    fontWeight: '600',
  },
  checkIcon: {
    fontSize: 18,
    color: '#6C5DD3',
  },
});

export default SettingsScreen;
