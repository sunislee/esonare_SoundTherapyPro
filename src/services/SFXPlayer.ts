// 【交互音效独立播放器】使用 react-native-sound 0.13.0 实现多实例并发播放
import Sound from 'react-native-sound';
import { Platform } from 'react-native';

/**
 * 【SFXPlayer】交互音效播放器
 * 特性:
 * - 独立实例，不与背景音共用 TrackPlayer
 * - 支持多实例并发播放 (3-5 个音效同时叠加)
 * - 自动处理 Android/iOS 音频焦点
 * - 播放完成后自动释放资源
 */
class SFXPlayer {
  private static instance: SFXPlayer;
  private activeSounds: Map<string, Sound> = new Map();
  private isInitialized: boolean = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): SFXPlayer {
    if (!SFXPlayer.instance) {
      SFXPlayer.instance = new SFXPlayer();
    }
    return SFXPlayer.instance;
  }

  /**
   * 初始化音频会话
   * iOS: 设置为 Playback + mixWithOthers
   * Android: 使用 Music 流类型
   */
  private initialize(): void {
    if (this.isInitialized) return;

    console.log('[SFXPlayer] 初始化交互音效播放器');

    try {
      // iOS: 设置音频会话，允许与其他音频混合
      if (Platform.OS === 'ios') {
        Sound.setCategory('Playback', true); // mixWithOthers: true
        console.log('[SFXPlayer] ✅ iOS 音频会话已配置 (mixWithOthers)');
      } else {
        // Android: 使用 Music 流类型
        Sound.setCategory('Music', true);
        console.log('[SFXPlayer] ✅ Android 音频会话已配置');
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('[SFXPlayer] ❌ 音频会话配置失败:', error);
      // 即使配置失败，也标记为已初始化
      this.isInitialized = true;
    }
  }

  /**
   * 播放交互音效
   * @param soundPath 音频文件路径 (本地或网络)
   * @param soundId 唯一标识符，用于管理播放实例
   * @returns Promise<void>
   */
  play(soundPath: string, soundId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isInitialized) {
        console.warn('[SFXPlayer] ⚠️ 未初始化，跳过播放');
        resolve();
        return;
      }

      // 【防重复】如果同一个 soundId 正在播放，先停止旧实例
      this.stop(soundId);

      console.log('[SFXPlayer] 开始播放交互音:', soundId, '路径:', soundPath);

      try {
        // 【关键】第二个参数传 null，使用默认配置
        const sound = new Sound(soundPath, null, (error) => {
          if (error) {
            console.error('[SFXPlayer] ❌ 加载失败:', error);
            this.activeSounds.delete(soundId);
            reject(error);
            return;
          }

          console.log('[SFXPlayer] ✅ 加载成功，开始播放:', soundId);

          // 【循环播放】设置为无限循环
          sound.setNumberOfLoops(-1);
          console.log('[SFXPlayer] 🔄 设置循环播放:', soundId);

           // 播放音效
          sound.play((success) => {
            if (success) {
              console.log('[SFXPlayer] ✅ 播放完成:', soundId);
            } else {
              console.warn('[SFXPlayer] ⚠️ 播放失败:', soundId);
            }

            // 播放完成后释放资源
            this.cleanup(sound, soundId);
           });

          // 保存实例到 activeSounds
          this.activeSounds.set(soundId, sound);
          console.log('[SFXPlayer] ✅ 交互音已开始播放:', soundId);
          resolve();
        });

        // 【关键】设置音量为 1.0（在回调外调用，sound 对象可能未就绪）
        sound.setVolume(1.0);
      } catch (error) {
        console.error('[SFXPlayer] ❌ 播放异常:', error);
        this.activeSounds.delete(soundId);
        reject(error);
      }
    });
  }

  /**
   * 停止指定音效
   * @param soundId 音效 ID
   */
  stop(soundId: string): void {
    const sound = this.activeSounds.get(soundId);
    if (sound) {
      console.log('[SFXPlayer] 停止音效:', soundId);
      sound.stop();
      // 不立即清理，等待播放完成回调处理
    }
  }

  /**
   * 停止所有正在播放的音效
   */
  stopAll(): void {
    console.log('[SFXPlayer] 停止所有交互音效');
    this.activeSounds.forEach((sound, soundId) => {
      try {
        sound.stop();
        // 立即释放资源，防止内存泄漏
        sound.release();
        console.log('[SFXPlayer] ✅ 已停止并释放:', soundId);
      } catch (error) {
        console.error('[SFXPlayer] ❌ 停止失败:', soundId, error);
      }
    });
    // 清空 activeSounds Map
    this.activeSounds.clear();
    console.log('[SFXPlayer] ✅ 所有交互音已停止并清理');
  }

  /**
   * 清理单个音效资源
   */
  private cleanup(sound: Sound, soundId: string): void {
    try {
      sound.release();
      this.activeSounds.delete(soundId);
      console.log('[SFXPlayer] ✅ 资源已释放:', soundId);
    } catch (error) {
      console.error('[SFXPlayer] ❌ 清理失败:', soundId, error);
    }
  }

  /**
   * 检查指定音效是否正在播放
   */
  isPlaying(soundId: string): boolean {
    const sound = this.activeSounds.get(soundId);
    return sound ? sound.isPlaying() : false;
  }

  /**
   * 获取当前正在播放的音效数量
   */
  getActiveCount(): number {
    return this.activeSounds.size;
  }

  /**
   * 获取所有正在播放的音效 ID
   */
  getActiveSoundIds(): string[] {
    return Array.from(this.activeSounds.keys());
  }
}

export default SFXPlayer;
