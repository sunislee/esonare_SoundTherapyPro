import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  PermissionsAndroid,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Feather';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/MainNavigator';
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

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const savedAvatar = await AsyncStorage.getItem('USER_AVATAR');
      const savedName = await AsyncStorage.getItem('USER_NAME');
      
      if (savedAvatar) setAvatarUri(savedAvatar);
      if (savedName) setUserName(savedName);
      else setUserName('ESONARE 用户');

      // 模拟加载统计数据 (实际可从 HistoryService 获取)
      setStats({ count: 12, duration: '4.5h' });
    } catch (e) {
      console.log('Failed to load profile', e);
    }
  };

  const triggerHaptic = (type: 'selection' | 'impactMedium' = 'selection') => {
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
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
    if (result.assets?.[0]?.uri) saveAvatar(result.assets[0].uri);
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={handleAvatarPress}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.placeholderAvatar}>
                <Text style={styles.placeholderText}>👤</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.nameContainer} 
            onPress={handleOpenRename}
            activeOpacity={0.7}
          >
            <Text style={styles.nameText}>{userName}</Text>
            <Icon name="edit-2" size={14} color="#6C5DD3" style={styles.editIcon} />
          </TouchableOpacity>

          <Text style={styles.idText}>ID: 88293401</Text>
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
                    style={[styles.modalButton, styles.cancelButton]} 
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>核心功能</Text>
          <MenuItem icon="zap" title="会员中心" onPress={() => handleComingSoon('会员中心')} badge="PRO" color="#FFD700" />
          <MenuItem icon="heart" title="我的混音" onPress={() => navigation.navigate('RemixSchemeManager')} />
          <MenuItem icon="clock" title="睡眠定时" onPress={() => setIsTimerVisible(true)} />
        </View>

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

        <Text style={styles.versionText}>Version 1.1.0 (Build 100)</Text>
      </ScrollView>

      <SleepTimerSheet visible={isTimerVisible} onClose={() => setIsTimerVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  scrollContent: { paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: 40 },
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
  cancelButton: {
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
    flexDirection: 'row', backgroundColor: '#161618', borderRadius: 20,
    marginHorizontal: 20, padding: 20, justifyContent: 'space-around', marginBottom: 30,
    borderWidth: 1, borderColor: '#222'
  },
  statItem: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { color: '#666', fontSize: 12 },
  statDivider: { width: 1, height: '60%', backgroundColor: '#333', alignSelf: 'center' },
  
  section: { marginHorizontal: 20, marginBottom: 25 },
  sectionTitle: { color: '#444', fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginLeft: 4, letterSpacing: 1 },
  menuItem: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#161618', padding: 16, borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#1e1e20'
  },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 15, width: 20, textAlign: 'center' },
  menuText: { color: '#ddd', fontSize: 15, fontWeight: '500' },
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
  versionText: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 10 }
});