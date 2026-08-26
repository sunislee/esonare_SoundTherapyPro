/**
 * WifiDownloadPrompt — PR-2 移动数据下载提示（全局 Modal）
 *
 * @architecture-constraint
 * 挂载在 App.tsx 根节点（与 Toast 容器同级），只订阅 NetworkGateService 的两个事件，
 * 不直接 import NetInfo；网络状态检测统一收敛在 NetworkGateService。
 */
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
// @ts-ignore -- react-native-vector-icons 无类型声明（与 MainTabNavigator 等现有文件一致）
import Icon from 'react-native-vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import NetworkGateService, {
  WIFI_PROMPT_REQUESTED,
  WIFI_PROMPT_RESOLVED,
} from '../services/NetworkGateService';

export default function WifiDownloadPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onRequested = () => setVisible(true);
    const onResolved = () => setVisible(false);
    // RN 旧版 DeviceEventEmitter：用返回的 subscription.remove() 解绑（无 removeListener API）
    const subRequested = DeviceEventEmitter.addListener(WIFI_PROMPT_REQUESTED, onRequested);
    const subResolved = DeviceEventEmitter.addListener(WIFI_PROMPT_RESOLVED, onResolved);
    return () => {
      subRequested.remove();
      subResolved.remove();
    };
  }, []);

  // 【等待 WiFi】关闭弹窗，任务保持挂起；切到 WiFi 后 NetworkGate 自动恢复下载
  const handleWaitWifi = () => {
    NetworkGateService.dismissPrompt();
    setVisible(false);
  };

  // 【继续用流量】本会话放行；allowCellular() 内部会 emit WIFI_PROMPT_RESOLVED → visible=false
  const handleUseCellular = () => {
    NetworkGateService.allowCellular();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleWaitWifi}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Icon name="wifi-outline" size={34} color="#6C5DD3" />
          </View>
          <Text style={styles.title}>{t('wifiPrompt.title')}</Text>
          <Text style={styles.message}>{t('wifiPrompt.message')}</Text>
          <Pressable style={[styles.button, styles.primaryButton]} onPress={handleUseCellular}>
            <Text style={styles.primaryButtonText}>{t('wifiPrompt.useCellular')}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={handleWaitWifi}>
            <Text style={styles.secondaryButtonText}>{t('wifiPrompt.waitWifi')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E1E2A',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  iconRow: { marginBottom: 16 },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    color: '#A5A5B8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButton: { backgroundColor: '#6C5DD3' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#3A3A4E',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: { color: '#C9C9D9', fontSize: 15, fontWeight: '500' },
});
