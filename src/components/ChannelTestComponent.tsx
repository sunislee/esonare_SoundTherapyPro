import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import packageJson from '../../package.json';
import UpdateService from '../services/UpdateService';

export const ChannelTestComponent: React.FC = () => {
  const [channel, setChannel] = useState<string>('loading...');
  const [versionCheckUrl, setVersionCheckUrl] = useState<string>('');
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string>('');

  useEffect(() => {
    loadChannelConfig();
  }, []);

  const loadChannelConfig = async () => {
    try {
      const config = await UpdateService.getUpdateConfig();
      setChannel(config.channel);
      setVersionCheckUrl(config.versionCheckUrl);
      setApkDownloadUrl(config.apkDownloadBaseUrl);
      
      console.log('[ChannelTest] Channel loaded:', config.channel);
      console.log('[ChannelTest] Version check URL:', config.versionCheckUrl);
      console.log('[ChannelTest] APK download base URL:', config.apkDownloadBaseUrl);
    } catch (error) {
      console.error('[ChannelTest] Failed to load channel config:', error);
      setChannel('error');
    }
  };

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    setCheckResult('检查中...');
    
    try {
      const currentVersion = packageJson.version; // 当前版本
      const hasUpdate = await UpdateService.checkForUpdate(currentVersion);
      const updateUrl = await UpdateService.getUpdateUrl(packageJson.version); // 假设新版本
      
      setCheckResult(
        `当前版本: ${currentVersion}\n` +
        `需要更新: ${hasUpdate ? '是' : '否'}\n` +
        `更新URL: ${updateUrl || '无'}`
      );
    } catch (error) {
      console.error('[ChannelTest] Check update failed:', error);
      setCheckResult('检查失败: ' + (error as Error).message);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>渠道配置测试</Text>
      <Text style={styles.label}>当前渠道:</Text>
      <Text style={styles.value}>{channel}</Text>
      
      <Text style={styles.label}>版本检查URL:</Text>
      <Text style={styles.url} numberOfLines={2}>{versionCheckUrl || '未配置'}</Text>
      
      <Text style={styles.label}>APK下载基础URL:</Text>
      <Text style={styles.url} numberOfLines={2}>{apkDownloadUrl || '未配置'}</Text>
      
      <Button 
        title="测试更新检查" 
        onPress={handleCheckUpdate}
        disabled={isChecking}
      />
      
      {checkResult ? (
        <View style={styles.resultContainer}>
          <Text style={styles.result}>{checkResult}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    margin: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  url: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  resultContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#e8f4fd',
    borderRadius: 5,
  },
  result: {
    fontSize: 12,
    color: '#333',
    lineHeight: 18,
  },
});