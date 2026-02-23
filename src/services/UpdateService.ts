import { Platform, NativeModules } from 'react-native';

export interface UpdateConfig {
  channel: string;
  versionCheckUrl: string;
  apkDownloadBaseUrl: string;
}

export class UpdateService {
  private static instance: UpdateService;
  
  private constructor() {}
  
  public static getInstance(): UpdateService {
    if (!this.instance) {
      this.instance = new UpdateService();
    }
    return this.instance;
  }
  
  /**
   * 获取更新渠道配置
   */
  public async getUpdateConfig(): Promise<UpdateConfig> {
    // 从原生BuildConfig读取配置
    const config = {
      channel: 'unknown',
      versionCheckUrl: '',
      apkDownloadBaseUrl: '',
    };
    
    try {
      // Android平台通过原生模块读取
      if (Platform.OS === 'android' && NativeModules.BuildConfigModule) {
        const buildConfig = await NativeModules.BuildConfigModule.getBuildConfig();
        config.channel = buildConfig.UPDATE_CHANNEL || 'unknown';
        config.versionCheckUrl = buildConfig.VERSION_CHECK_URL || '';
        config.apkDownloadBaseUrl = buildConfig.APK_DOWNLOAD_BASE_URL || '';
      } else {
        // iOS平台或其他备用逻辑
        config.channel = __DEV__ ? 'development' : 'release';
      }
      
      // 静默处理：更新服务配置加载完成
      
    } catch (error) {
      console.error('[UpdateService] Failed to get update config:', error);
      // 降级到备用逻辑
      config.channel = __DEV__ ? 'development' : 'release';
    }
    
    return config;
  }
  
  /**
   * 检查是否需要更新
   */
  public async checkForUpdate(currentVersion: string): Promise<boolean> {
    const config = await this.getUpdateConfig();
    
    if (!config.versionCheckUrl) {
      console.warn('[UpdateService] No version check URL configured');
      return false;
    }
    
    try {
      const response = await fetch(config.versionCheckUrl);
      const versionData = await response.json();
      
      return this.compareVersions(currentVersion, versionData.version) < 0;
    } catch (error) {
      console.error('[UpdateService] Failed to check for update:', error);
      return false;
    }
  }
  
  /**
   * 获取更新URL
   */
  public async getUpdateUrl(version: string): Promise<string> {
    const config = await this.getUpdateConfig();
    
    if (config.channel === 'google') {
      // Google Play渠道，跳转到商店
      return 'market://details?id=com.anonymous.soundtherapyapp';
    } else if (config.channel === 'domestic') {
      // 国内渠道，直接下载APK
      return `${config.apkDownloadBaseUrl}v${version}/app-domestic-release.apk`;
    }
    
    return '';
  }
  
  /**
   * 版本号比较
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }
}

export default UpdateService.getInstance();