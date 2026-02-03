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

// 默认背景数组
const DEFAULT_BGS = [
  { id: '1', name: '火焰', source: require('../assets/images/fire_bg.jpg') },
  { id: '2', name: '森林', source: require('../assets/images/forest_bg.jpg') },
  { id: '3', name: '雨声', source: require('../assets/images/rain_bg.jpg') },
  { id: '4', name: '海洋', source: require('../assets/images/sea_bg.jpg') },
];

import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioService from '../services/AudioService';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import ToastUtil from '../utils/ToastUtil';
import { SleepTimerSheet } from '../components/SleepTimerSheet';

// @ts-ignore
type ProfileScreenNavigationProp = StackNavigationProp<any, 'Profile'>;

export const ProfileScreen = () => {
  // @ts-ignore
  const navigation = useNavigation<any>();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [userName, setUserName] = useState('加载中...');
  const [newName, setNewName] = useState('');
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [stats, setStats] = useState({ count: 0, duration: '0h' });
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [isProUser, setIsProUser] = useState(false); // 恢复真实判断逻辑
  const [backgroundImage, setBackgroundImage] = useState<string>(''); // 自定义背景图片 URI
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState<number>(0); // 默认背景索引
  const [isBackgroundModalVisible, setIsBackgroundModalVisible] = useState(false); // 背景选择浮层可见性

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
      else setUserName('ESONARE 用户');
      
      // 加载保存的背景图片
      if (savedCustomBackground) {
        setBackgroundImage(savedCustomBackground);
      }
      
      // 加载保存的默认背景索引
      if (savedDefaultBackgroundIndex) {
        setSelectedBackgroundIndex(parseInt(savedDefaultBackgroundIndex, 10));
      }
      
      // 加载 Pro 用户状态
      if (isPro) {
        setIsProUser(isPro === 'true');
      } else {
        setIsProUser(false);
      }

      // 模拟加载统计数据 (实际可从 HistoryService 获取)
      setStats({ count: 12, duration: '4.5h' });
    } catch (e) {
      console.log('Failed to load profile', e);
    }
  };

  const loadPresets = async () => {
    try {
      const presetsJson = await AsyncStorage.getItem('@mixer_presets');
      if (presetsJson) {
        setSavedPresets(JSON.parse(presetsJson));
      }
    } catch (e) {
      console.log('Failed to load presets', e);
    }
  };

  const deletePreset = async (id: string) => {
    Alert.alert('删除预设', '确定要删除这个混音预设吗？', [
      { text: '取消', style: 'cancel' },
      { 
        text: '删除', 
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = savedPresets.filter(p => p.id !== id);
            setSavedPresets(updated);
            await AsyncStorage.setItem('@mixer_presets', JSON.stringify(updated));
            ToastUtil.success('已删除');
          } catch (e) {
            ToastUtil.error('删除失败');
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
      AudioService.setPickingFile(true);
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      if (result.assets?.[0]?.uri) {
        saveAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Pick image error:', error);
    } finally {
      AudioService.setPickingFile(false);
    }
  };

  const saveAvatar = async (uri: string) => {
    setAvatarUri(uri);
    await AsyncStorage.setItem('USER_AVATAR', uri);
  };

  const handleOpenRename = () => {
    setNewName(userName);
    setIsNameModalVisible(true);
    triggerHaptic('selection');
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      Alert.alert('提示', '名字不能为空');
      return;
    }
    
    try {
      await AsyncStorage.setItem('USER_NAME', newName.trim());
      setUserName(newName.trim());
      setIsNameModalVisible(false);
      
      // 触发成功反馈震动 (双震)
      ReactNativeHapticFeedback.trigger('notificationSuccess', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    } catch (e) {
      Alert.alert('错误', '保存失败');
    }
  };

  const handleLogout = () => {
    triggerHaptic('impactMedium');
    Alert.alert("退出登录", "确定要退出当前账号并清除所有本地设置吗？", [
      { text: "取消", style: "cancel" },
      { 
        text: "确定退出", 
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.multiRemove(['USER_NAME', 'USER_AVATAR', 'HAS_SET_NAME']);
          // 清空后重启到 Landing
          navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
        }
      }
    ]);
  };

  const handleClearCache = () => {
    triggerHaptic('impactMedium');
    Alert.alert("清除缓存", "这将删除所有已下载的音频资源，下次使用需重新下载。", [
      { text: "取消", style: "cancel" },
      { 
        text: "确认清除", 
        onPress: async () => {
          await AsyncStorage.removeItem('RESOURCE_READY_V_1.0.7');
          Alert.alert("清除成功", "缓存已清理，请重启 App。");
          // @ts-ignore
          navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
        }
      }
    ]);
  };

  const handleComingSoon = (feature: string) => {
    triggerHaptic('impactMedium');
    ToastUtil.info(`${feature} 正在开发中`, '敬请期待下一版本');
  };



  const handleChangeBackground = () => {
    triggerHaptic('selection');
    // 弹出ActionSheet选择背景
    Alert.alert(
      '选择背景',
      '请选择背景设置方式',
      [
        {
          text: '选择系统预设背景',
          onPress: () => {
            triggerHaptic('selection');
            showBackgroundOptions();
          }
        },
        {
          text: '从相册自定义(Pro特权)',
          onPress: () => {
            triggerHaptic('selection');
            if (isProUser) {
              openBackgroundPicker();
            } else {
              // 普通用户：弹出 Pro 特权提示
              Alert.alert(
                '✨ 解锁 Pro 专属特权',
                '自定义背景是 Pro 用户的专属功能。升级 Pro 即可解锁相册选图、专属音效等更多福利！该功能将在未来版本开放开通。',
                [
                  {
                    text: '我知道了',
                    style: 'default'
                  }
                ]
              );
            }
          }
        },
        {
          text: '取消',
          style: 'cancel'
        }
      ]
    );
  };

  const showBackgroundOptions = () => {
    // 显示底部Modal浮层
    setIsBackgroundModalVisible(true);
  };

  const selectPresetBackground = async (id: string) => {
    try {
      // 查找选中的默认背景索引
      const selectedIndex = DEFAULT_BGS.findIndex(bg => bg.id === id);
      if (selectedIndex !== -1) {
        // 保存默认背景索引到AsyncStorage
        await AsyncStorage.setItem('PRO_DEFAULT_BACKGROUND_INDEX', selectedIndex.toString());
        // 清除自定义背景（如果有）
        await AsyncStorage.removeItem('PRO_CUSTOM_BACKGROUND');
        // 更新状态
        setSelectedBackgroundIndex(selectedIndex);
        setBackgroundImage('');
        // 显示成功提示
        ToastUtil.success('背景已更新');
        // 触发成功反馈
        triggerHaptic('notificationSuccess');
      }
    } catch (error) {
      console.error('Failed to save background:', error);
      ToastUtil.error('保存失败，请重试');
    }
  };

  const openBackgroundPicker = async () => {
    try {
      AudioService.setPickingFile(true);
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
        allowsEditing: true,
        aspect: [16, 9], // 设置宽屏裁剪比例，适合 Header
      });

      if (result.assets?.[0]?.uri) {
        // 保存自定义背景图片URI到AsyncStorage
        await AsyncStorage.setItem('PRO_CUSTOM_BACKGROUND', result.assets[0].uri);
        // 清除默认背景索引（如果有）
        await AsyncStorage.removeItem('PRO_DEFAULT_BACKGROUND_INDEX');
        // 更新状态，实时预览
        setBackgroundImage(result.assets[0].uri);
        setSelectedBackgroundIndex(0); // 重置默认背景索引
        // 显示成功提示
        ToastUtil.success('背景已更新');
        // 触发成功反馈
        triggerHaptic('notificationSuccess');
      }
    } catch (error) {
      console.error('Pick image error:', error);
      ToastUtil.error('选择图片失败，请重试');
    } finally {
      AudioService.setPickingFile(false);
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
          <View style={[styles.badge, title === '会员中心' && styles.proBadge]}>
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
  
        
        {/* 头部装饰区 - 所有用户都可以使用预设背景 */}
        <ImageBackground
          source={(backgroundImage && typeof backgroundImage === 'string' && isProUser) ? { uri: backgroundImage } : DEFAULT_BGS[selectedBackgroundIndex]?.source || DEFAULT_BGS[0].source}
          style={styles.headerBackground}
          imageStyle={styles.headerBackgroundImage}
        >
          <TouchableOpacity 
            style={styles.backgroundChangeButton} 
            onPress={handleChangeBackground}
            activeOpacity={0.7}
          >
            <MaterialIcons name="photo-camera" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerOverlay}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.avatarWrapper} onPress={handleAvatarPress}>
                {/* 强制默认图逻辑，确保 source 始终有效 */}
                {(() => {
                  const avatarSource = (avatarUri && typeof avatarUri === 'string') ? { uri: avatarUri } : require('../assets/images/fire_bg.jpg');
                  return (
                    <Image 
                      source={avatarSource} 
                      style={styles.avatarImage} 
                      key={avatarUri} // 增加 key 强制刷新
                    />
                  );
                })()}
              </TouchableOpacity>
              
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
              <TouchableOpacity style={styles.statItem} onPress={() => handleComingSoon('详细统计')}>
                <Text style={styles.statNumber}>{stats.count}</Text>
                <Text style={styles.statLabel}>专注次数</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity style={styles.statItem} onPress={() => handleComingSoon('详细统计')}>
                <Text style={styles.statNumber}>{stats.duration}</Text>
                <Text style={styles.statLabel}>总时长</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>

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
                <Text style={styles.modalTitle}>修改昵称</Text>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="请输入新名字"
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
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.saveButton]} 
                    onPress={handleSaveName}
                  >
                    <Text style={styles.saveButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>核心功能</Text>
          {/* 混音实验室入口屏蔽 */}
          {/* <MenuItem icon="zap" title="PRO 混音实验室" onPress={() => handleOpenMixer()} badge="PRO" color="#FFD700" /> */}
          {/* <MenuItem icon="heart" title="我的收藏" onPress={() => navigation.navigate('RemixSchemeManager')} /> */}
          <MenuItem icon="clock" title="睡眠定时" onPress={() => setIsTimerVisible(true)} />
        </View>

        {/* 混音预设列表屏蔽 */}
        {/* 
        {savedPresets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>我的混音预设</Text>
            {savedPresets.map((preset) => (
              <View key={preset.id} style={styles.presetItem}>
                <View style={styles.presetInfo}>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetDate}>
                    {new Date(preset.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.presetActions}>
                  <TouchableOpacity 
                    onPress={() => handleOpenMixer(preset.id)}
                    style={styles.presetBtn}
                  >
                    <Icon name="play" size={16} color="#D4AF37" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => deletePreset(preset.id)}
                    style={styles.presetBtn}
                  >
                    <Icon name="trash-2" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>资源与记录</Text>
          <MenuItem icon="calendar" title="播放历史" onPress={() => navigation.navigate('History')} />
          <MenuItem icon="settings" title="偏好设置" onPress={() => navigation.navigate('Settings')} />
          <MenuItem icon="trash-2" title="清除缓存" onPress={handleClearCache} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <MenuItem icon="info" title="关于我们" onPress={() => navigation.navigate('About')} />
          <MenuItem icon="log-out" title="退出登录" onPress={handleLogout} color="#FF4D4F" showArrow={false} />
        </View>

        <Text style={styles.versionText}>Version 1.1.0 (Build 40112)</Text>
      </ScrollView>

      <SleepTimerSheet visible={isTimerVisible} onClose={() => setIsTimerVisible(false)} />

      {/* 背景选择浮层 */}
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
                  <Text style={styles.backgroundModalTitle}>选择背景</Text>
                  <TouchableOpacity 
                    onPress={() => setIsBackgroundModalVisible(false)}
                    style={styles.closeButton}
                  >
                    <Icon name="x" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.backgroundModalSubtitle}>推荐背景</Text>
                <View style={styles.presetBackgroundsGrid}>
                  {DEFAULT_BGS.map((bg) => (
                    <TouchableOpacity
                      key={bg.id}
                      style={styles.presetBackgroundItem}
                      onPress={() => {
                        selectPresetBackground(bg.id);
                        setIsBackgroundModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Image 
                        source={bg.source} 
                        style={styles.presetBackgroundThumbnail}
                      />
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
                  <Text style={styles.albumSelectText}>从相册选择</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backgroundModalCancelButton}
                  onPress={() => setIsBackgroundModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backgroundModalCancelButtonText}>取消</Text>
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
  versionText: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 10 },
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

  // 背景选择浮层样式
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
  presetBackgroundItem: {
    flex: 1,
    marginHorizontal: 4
  },
  presetBackgroundThumbnail: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    marginBottom: 8
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