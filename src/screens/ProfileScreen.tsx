import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  ImageBackground
} from 'react-native';



import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import ToastUtil from '../utils/ToastUtil';
import { SleepTimerSheet } from '../components/SleepTimerSheet';

// @ts-ignore
type ProfileScreenNavigationProp = StackNavigationProp<any, 'Profile'>;

export const ProfileScreen = () => {
  const { t } = useTranslation();
  // @ts-ignore
  const navigation = useNavigation<any>();
  const BACKGROUND_OPTIONS = [
    { id: '1', name: '火焰', source: null },
    { id: '2', name: '森林', source: null },
    { id: '3', name: '雨水', source: null },
    { id: '4', name: '大海', source: null },
  ];
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>(t('profile.loading'));
  const [newName, setNewName] = useState<string>('');
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [stats, setStats] = useState({ count: 0, duration: '0h' });
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [isProUser, setIsProUser] = useState(false); 
  const [backgroundImage, setBackgroundImage] = useState<string>(''); 
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState<number>(0); 
  const [isBackgroundModalVisible, setIsBackgroundModalVisible] = useState(false); 

  useEffect(() => {
    loadProfile();
    loadPresets();
    
    const unsubscribe = navigation.addListener('focus', () => {
      loadPresets();
    });
    
    return unsubscribe;
  }, [navigation]);

  const handleOpenMixer = (presetId?: string) => {
    navigation.navigate('Mixer', { presetId });
    triggerHaptic('impactMedium');
  };

  const loadProfile = async () => {
    try {
      const savedAvatar = await AsyncStorage.getItem('USER_AVATAR');
      const savedName = await AsyncStorage.getItem('USER_NAME');
      const isPro = await AsyncStorage.getItem('IS_PRO_USER');
      const savedCustomBackground = await AsyncStorage.getItem('PRO_CUSTOM_BACKGROUND');
      const savedDefaultBackgroundIndex = await AsyncStorage.getItem('PRO_DEFAULT_BACKGROUND_INDEX');
      
      if (savedAvatar) setAvatarUri(savedAvatar);
      if (savedName) setUserName(savedName);
      else setUserName(t('profile.defaultUser'));
      
      if (savedCustomBackground) {
        setBackgroundImage(savedCustomBackground);
      }
      
      if (savedDefaultBackgroundIndex) {
        setSelectedBackgroundIndex(parseInt(savedDefaultBackgroundIndex, 10));
      }
      
      if (isPro) {
        setIsProUser(isPro === 'true');
      } else {
        setIsProUser(false);
      }

      setStats({ count: 12, duration: '4.5h' });
    } catch (e) {
      // Failed to load profile
    }
  };

  const loadPresets = async () => {
    try {
      const presetsJson = await AsyncStorage.getItem('@mixer_presets');
      if (presetsJson) {
        setSavedPresets(JSON.parse(presetsJson));
      }
    } catch (e) {
      // Failed to load presets
    }
  };

  const deletePreset = async (id: string) => {
    Alert.alert(t('profile.modals.deletePresetTitle'), t('profile.modals.deletePresetMsg'), [
      { text: t('profile.modals.cancel'), style: 'cancel' },
      { 
        text: t('profile.modals.confirmDelete'), 
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = savedPresets.filter(p => p.id !== id);
            setSavedPresets(updated);
            await AsyncStorage.setItem('@mixer_presets', JSON.stringify(updated));
            ToastUtil.success(t('actions.deleted'));
          } catch (e) {
            ToastUtil.error(t('actions.deleteFailed'));
          }
        }
      }
    ]);
  };

  const triggerHaptic = (type: 'selection' | 'impactMedium' | 'notificationSuccess' = 'selection') => {
    ReactNativeHapticFeedback.trigger(type, {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };

  const handleAvatarPress = () => {
    triggerHaptic('selection');
    openGallery();
  };

  const openGallery = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      if (!result) {
        console.warn('ImagePicker returned null result');
        return;
      }

      if (result.didCancel) {
        console.log('User cancelled image picker');
      } else if (result.errorCode) {
        console.log('ImagePicker Error: ', result.errorMessage);
        ToastUtil.error(t('profile.modals.error'));
      } else if (result.assets && result.assets.length > 0 && result.assets[0].uri) {
        const selectedUri = result.assets[0].uri;
        saveAvatar(selectedUri);
      }
    } catch (error) {
      console.error('Pick image error:', error);
      ToastUtil.error(t('profile.modals.error'));
    }
  };

  const saveAvatar = async (uri: string) => {
    try {
      setAvatarUri(uri);
      await AsyncStorage.setItem('USER_AVATAR', uri);
      ToastUtil.success(t('actions.updateSuccess'));
    } catch (e) {
      console.error('Save avatar error:', e);
      ToastUtil.error(t('actions.saveFailed'));
    }
  };

  const handleOpenRename = () => {
    setNewName(userName);
    setIsNameModalVisible(true);
    triggerHaptic('selection');
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      Alert.alert(t('profile.modals.prompt'), t('profile.modals.nameEmpty'));
      return;
    }
    
    try {
      await AsyncStorage.setItem('USER_NAME', newName.trim());
      setUserName(newName.trim());
      setIsNameModalVisible(false);
      
      ReactNativeHapticFeedback.trigger('notificationSuccess', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    } catch (e) {
      Alert.alert(t('profile.modals.error'), t('profile.modals.saveFailed'));
    }
  };

  const handleLogout = () => {
    triggerHaptic('impactMedium');
    Alert.alert(t('profile.modals.logoutTitle'), t('profile.modals.logoutMsg'), [
      { text: t('profile.modals.cancel'), style: "cancel" },
      { 
        text: t('profile.modals.confirmLogout'), 
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.multiRemove(['USER_NAME', 'USER_AVATAR', 'HAS_SET_NAME']);
          navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
        }
      }
    ]);
  };

  const handleClearCache = () => {
    triggerHaptic('impactMedium');
    Alert.alert(t('profile.modals.clearCacheTitle'), t('profile.modals.clearCacheMsg'), [
      { text: t('profile.modals.cancel'), style: "cancel" },
      { 
        text: t('profile.modals.confirmClear'), 
        onPress: async () => {
          await AsyncStorage.removeItem('RESOURCE_READY_V_1.0.7');
          Alert.alert(t('profile.modals.clearCacheTitle'), t('profile.modals.clearCacheSuccess'));
          // @ts-ignore
          navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
        }
      }
    ]);
  };

  const handleComingSoon = (feature: string) => {
    triggerHaptic('impactMedium');
    ToastUtil.info(t('profile.menu.comingSoon', { feature }), t('profile.menu.comingSoonDesc'));
  };

  const handleChangeBackground = () => {
    triggerHaptic('selection');
    Alert.alert(
      t('profile.background.selectTitle'),
      t('profile.background.selectMsg'),
      [
        {
          text: t('profile.background.systemPreset'),
          onPress: () => {
            triggerHaptic('selection');
            showBackgroundOptions();
          }
        },
        {
          text: t('profile.background.customPro'),
          onPress: () => {
            triggerHaptic('selection');
            if (isProUser) {
              openBackgroundPicker();
            } else {
              Alert.alert(
                t('profile.background.proFeatureTitle'),
                t('profile.background.proFeatureMsg'),
                [
                  {
                    text: t('profile.background.proFeatureConfirm'),
                    style: 'default'
                  }
                ]
              );
            }
          }
        },
        {
          text: t('profile.modals.cancel'),
          style: 'cancel'
        }
      ]
    );
  };

  const showBackgroundOptions = () => {
    setIsBackgroundModalVisible(true);
  };

  const selectPresetBackground = async (id: string) => {
    try {
      const selectedIndex = BACKGROUND_OPTIONS.findIndex((bg: any) => bg.id === id);
      if (selectedIndex !== -1) {
        await AsyncStorage.setItem('PRO_DEFAULT_BACKGROUND_INDEX', selectedIndex.toString());
        await AsyncStorage.removeItem('PRO_CUSTOM_BACKGROUND');
        setSelectedBackgroundIndex(selectedIndex);
        setBackgroundImage('');
        ToastUtil.success(t('profile.background.updateSuccess'));
        triggerHaptic('notificationSuccess');
      }
    } catch (error) {
      console.error('Failed to save background:', error);
      ToastUtil.error(t('settings.toast.saveFailed'));
    }
  };

  const openBackgroundPicker = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      if (!result) {
        console.warn('Background picker returned null result');
        return;
      }

      if (result.didCancel) {
        console.log('User cancelled background picker');
      } else if (result.errorCode) {
        console.log('Background picker Error: ', result.errorMessage);
        ToastUtil.error(t('settings.toast.saveFailed'));
      } else if (result.assets && result.assets.length > 0 && result.assets[0].uri) {
        const uri = result.assets[0].uri;
        await AsyncStorage.setItem('PRO_CUSTOM_BACKGROUND', uri);
        await AsyncStorage.removeItem('PRO_DEFAULT_BACKGROUND_INDEX');
        setBackgroundImage(uri);
        setSelectedBackgroundIndex(0); 
        ToastUtil.success(t('profile.background.updateSuccess'));
        triggerHaptic('notificationSuccess');
      }
    } catch (error) {
      console.error('Pick background image error:', error);
      ToastUtil.error(t('settings.toast.saveFailed'));
    }
  };

  const MenuItem = ({ icon, title, onPress, showArrow = true, color = '#ddd', badge }: any) => (
    <TouchableOpacity 
      style={styles.menuItem} 
      onPress={() => { triggerHaptic(); onPress?.(); }}
      activeOpacity={0.6}
    >
      <View style={styles.menuItemLeft}>
        <Icon name={icon} size={20} color={color} style={styles.menuIcon} />
        <Text style={[styles.menuText, { color }]}>{title}</Text>
        {badge && (
          <View style={[styles.badge, badge === 'PRO' && styles.proBadge]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {showArrow && <Icon name="chevron-right" size={18} color="#444" />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
  
        
        <View style={[styles.headerBackground, { backgroundColor: '#1A1A1A' }]}>
          {/* 背景更换按钮已封锁 */}
          {/* <TouchableOpacity 
            style={styles.backgroundChangeButton} 
            onPress={handleChangeBackground}
            activeOpacity={0.7}
          >
            <MaterialIcons name="photo-camera" size={18} color="#fff" />
          </TouchableOpacity> */}
          <View style={styles.headerOverlay}>
            <View style={styles.header}>
              <View style={styles.avatarWrapper}>
                <View style={[styles.avatarImage, { backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' }]}>
                  <Icon name="user" size={40} color="#6C5DD3" />
                </View>
              </View>
              
              <TouchableOpacity 
                style={styles.nameContainer} 
                onPress={handleOpenRename}
                activeOpacity={0.7}
              >
                <Text style={styles.nameText}>{userName}</Text>
                <Icon name="edit-2" size={14} color="rgba(255, 255, 255, 0.8)" style={styles.editIcon} />
              </TouchableOpacity>

              <Text style={styles.idText}>ID: 88293401</Text>
            </View>

            <View style={styles.statsContainer}>
              <TouchableOpacity style={styles.statItem} onPress={() => handleComingSoon(t('profile.stats.focusCount'))}>
                <Text style={styles.statNumber}>{stats.count}</Text>
                <Text style={styles.statLabel}>{t('profile.stats.focusCount')}</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity style={styles.statItem} onPress={() => handleComingSoon(t('profile.stats.totalDuration'))}>
                <Text style={styles.statNumber}>{stats.duration}</Text>
                <Text style={styles.statLabel}>{t('profile.stats.totalDuration')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Modal
          visible={isNameModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsNameModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalContent}
              >
                <Text style={styles.modalTitle}>{t('profile.modals.renameTitle')}</Text>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t('profile.modals.renamePlaceholder')}
                  placeholderTextColor="#444"
                  maxLength={12}
                  autoFocus={true}
                  selectionColor="#6C5DD3"
                />
                <Text style={styles.charLimitText}>{newName.length}/12</Text>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalCancelButton]} 
                    onPress={() => setIsNameModalVisible(false)}
                  >
                    <Text style={styles.cancelButtonText}>{t('profile.modals.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.saveButton]} 
                    onPress={handleSaveName}
                  >
                    <Text style={styles.saveButtonText}>{t('profile.modals.save')}</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.menu.coreFeatures')}</Text>
          <MenuItem icon="clock" title={t('profile.menu.sleepTimer')} onPress={() => setIsTimerVisible(true)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.menu.resources')}</Text>
          <MenuItem icon="calendar" title={t('profile.menu.history')} onPress={() => navigation.navigate('History')} />
          <MenuItem icon="settings" title={t('profile.menu.settings')} onPress={() => navigation.navigate('Settings')} />
          <MenuItem icon="trash-2" title={t('profile.menu.clearCache')} onPress={handleClearCache} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.menu.about')}</Text>
          <MenuItem icon="info" title={t('profile.menu.aboutUs')} onPress={() => navigation.navigate('About')} />
          <MenuItem icon="log-out" title={t('profile.menu.logout')} onPress={handleLogout} color="#FF4D4F" showArrow={false} />
        </View>

        <Text style={styles.versionText}>Version 1.0.3</Text>
      </ScrollView>

      <SleepTimerSheet visible={isTimerVisible} onClose={() => setIsTimerVisible(false)} />

      <Modal
        visible={isBackgroundModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsBackgroundModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsBackgroundModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.backgroundModalContent}>
                <View style={styles.backgroundModalHeader}>
                  <Text style={styles.backgroundModalTitle}>{t('profile.background.selectTitle')}</Text>
                  <TouchableOpacity 
                    onPress={() => setIsBackgroundModalVisible(false)}
                    style={styles.closeButton}
                  >
                    <Icon name="x" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.backgroundModalSubtitle}>{t('profile.background.recommended')}</Text>
                <View style={styles.presetBackgroundsGrid}>
                  {BACKGROUND_OPTIONS.map((bg) => (
                    <TouchableOpacity
                      key={bg.id}
                      style={styles.presetBackgroundItem}
                      onPress={() => {
                        selectPresetBackground(bg.id);
                        setIsBackgroundModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.presetBackgroundThumbnail, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
                        <Icon name="image" size={24} color="#444" />
                      </View>
                      <Text style={styles.presetBackgroundName}>{bg.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.albumSelectButton}
                  onPress={() => {
                    openBackgroundPicker();
                    setIsBackgroundModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Icon name="image" size={20} color="#6C5DD3" />
                  <Text style={styles.albumSelectText}>{t('profile.background.selectFromAlbum')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backgroundModalCancelButton}
                  onPress={() => setIsBackgroundModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backgroundModalCancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { paddingBottom: 40 },
  headerBackground: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#161618'
  },
  headerBackgroundImage: {
    borderRadius: 24
  },
  headerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 20
  },
  headerBackgroundNormal: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#222'
  },
  header: { alignItems: 'center', paddingVertical: 20 },
  avatarWrapper: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: '#6C5DD3',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1E1E1E', elevation: 10, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5,
  },
  avatarImage: { width: 104, height: 104, borderRadius: 52 },
  placeholderAvatar: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 40 },
  nameContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(108, 93, 211, 0.1)',
    borderRadius: 20,
  },
  nameText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  editIcon: { marginLeft: 8 },
  idText: { color: '#666', fontSize: 13, marginTop: 4 },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#161618',
    width: '100%',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center'
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20
  },
  nameInput: {
    backgroundColor: '#0a0a0c',
    width: '100%',
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333'
  },
  charLimitText: {
    color: '#444',
    fontSize: 12,
    alignSelf: 'flex-end',
    marginTop: 8,
    marginRight: 4
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 30,
    width: '100%',
    justifyContent: 'space-between'
  },
  modalButton: {
    flex: 0.45,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCancelButton: {
    backgroundColor: '#222'
  },
  saveButton: {
    backgroundColor: '#6C5DD3'
  },
  cancelButtonText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600'
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  
  statsContainer: {
    flexDirection: 'row', backgroundColor: 'rgba(22, 22, 24, 0.7)', borderRadius: 20,
    marginHorizontal: 20, padding: 20, justifyContent: 'space-around', marginTop: 20,
    borderWidth: 1, borderColor: 'rgba(34, 34, 34, 0.8)'
  },
  statItem: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { color: '#999999', fontSize: 12 },
  statDivider: { width: 1, height: '60%', backgroundColor: '#333', alignSelf: 'center' },
  
  section: { marginHorizontal: 20, marginBottom: 25 },
  sectionTitle: { color: '#999999', fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginLeft: 4, letterSpacing: 1 },
  menuItem: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#252525', padding: 16, borderRadius: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: '#333333'
  },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 15, width: 20, textAlign: 'center' },
  menuText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  badge: {
    backgroundColor: '#6C5DD3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  proBadge: {
    backgroundColor: '#FFD700',
    borderColor: '#B8860B',
    borderWidth: 0.5,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161618',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e20',
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  presetDate: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  presetActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetBtn: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  versionText: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  beianText: {
    color: '#333',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 20,
  },
  backgroundChangeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  backgroundChangeIcon: {
    color: '#fff',
    fontSize: 18
  },

  backgroundModalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#161618',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    maxHeight: '80%'
  },
  backgroundModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  backgroundModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  closeButton: {
    padding: 4
  },
  backgroundModalSubtitle: {
    color: '#444',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8
  },
  presetBackgroundsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  presetBackgroundThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  presetBackgroundItem: {
    flex: 1,
    marginHorizontal: 4,
    height: 100,
    marginBottom: 20,
  },
  presetBackgroundName: {
    color: '#ddd',
    fontSize: 12,
    textAlign: 'center'
  },
  albumSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 93, 211, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12
  },
  albumSelectText: {
    color: '#6C5DD3',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8
  },
  backgroundModalCancelButton: {
    backgroundColor: '#222',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  backgroundModalCancelButtonText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '500'
  }
});