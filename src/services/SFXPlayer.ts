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
  /**
   * 【P0-2】one-shot（一次性短音效）独立池。
   * 与 activeSounds（循环池，如黑胶底噪）完全隔离：
   * - stopAll() / isPlaying() / getActiveCount() / getActiveSoundIds() 均不感知本池；
   * - key 为「外部 id + 自增序号」，允许同一音效并发存在。
   */
  private oneShotSounds: Map<string, Sound> = new Map();
  /** 【P0-2】当前有 in-flight one-shot 的外部 id，用于「同一 id 未播完则忽略新触发」 */
  private activeOneShotIds: Set<string> = new Set();
  /** 【P0-2】one-shot key 自增序号。【必须单调递增，禁止重置】见 releaseAllOneShots() 注释 */
  private oneShotSeq: number = 0;
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
        // 【类型修正·零运行时影响】react-native-sound 的 setCategory 类型只声明了 iOS
        // AVAudioSessionCategory，Android 侧 'Music' 是库实现支持的合法值，故仅做类型断言。
        Sound.setCategory('Music' as any, true);
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

      // 【防重复】如果同一个 soundId 正在播放，先停止旧的循环实例
      // 【P0-2】走私有 stopLoopSound() 而非公开 stop()：play 的「防重复」只针对循环池语义，
      // 不应携带场景收尾类副作用，以免日后 stop() 再扩展时误伤并发中的 one-shot。
      this.stopLoopSound(soundId);

      console.log('[SFXPlayer] 开始播放交互音:', soundId, '路径:', soundPath);

      try {
        // 【关键】第二个参数传 null，使用默认配置
        // 【类型修正·零运行时影响】basePath 传 null 是本文件既有且已验证可用的写法（见下方注释），
        // 但 @types/react-native-sound 把第二参声明为 string | CallbackType，故仅做类型断言。
        const sound = new Sound(soundPath, null as any, (error) => {
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
   * 【P0-2 新增】设置指定循环音效的音量（如黑胶底噪）
   * @param soundId 循环池中的音效 ID
   * @param vol 音量，会被 clamp 到 [0,1]
   * @returns 是否设置成功；实例不存在返回 false（不抛异常）
   */
  setVolume(soundId: string, vol: number): boolean {
    const sound = this.activeSounds.get(soundId);
    if (!sound) {
      console.warn(`[SFX-DIAG] setVolume 未命中循环池实例: soundId=${soundId}`);
      return false;
    }

    try {
      const safeVol = Math.max(0, Math.min(1, vol));
      sound.setVolume(safeVol);
      console.log(`[SFX-DIAG] setVolume ok soundId=${soundId} vol=${safeVol}`);
      return true;
    } catch (error: any) {
      console.warn(`[SFX-DIAG] setVolume 失败 soundId=${soundId} msg=${error?.message || error}`);
      return false;
    }
  }

  /**
   * 【P0-2 新增】播放一次性短音效（不循环、不进循环池）
   *
   * 并发契约（老唱片店随机 SFX 每 10–35s 触发一次，绝不能干扰黑胶底噪）:
   * - 独立 one-shot 池：不写入 activeSounds，不计入 stopAll/isPlaying/getActiveCount；
   * - key = `${soundId}#${自增序号}`，与循环池及同类 one-shot 均不撞 key；
   * - 仅在底层 play() 的「播放结束」回调里 release，不用 setTimeout 猜时长；
   * - 同一外部 soundId 未播完再次触发 → 直接 return false，不打断正在播的那个；
   * - 本路径绝不调用 stop()/stopAll()，也不改任何全局音量。
   *
   * @param soundPath 音频路径（本地 file:// 或远程 URL）
   * @param soundId 外部音效 ID（用于并发去重）
   * @param vol 音量 0–1
   * @returns Promise<boolean>：true = 已开始播放；false = 未初始化/重复触发/加载或播放失败
   */
  playOneShot(soundPath: string, soundId: string, vol: number = 1): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isInitialized) {
        console.warn(`[SFX-DIAG] playOneShot 未初始化，跳过 soundId=${soundId} path=${soundPath}`);
        resolve(false);
        return;
      }

      // 【并发】同一外部 id 仍有在飞实例 → 忽略本次触发，不打断正在播放的
      if (this.activeOneShotIds.has(soundId)) {
        console.warn(`[SFX-DIAG] playOneShot 同一 id 未播完，忽略 soundId=${soundId}`);
        resolve(false);
        return;
      }

      // 【并发】内部 key = 外部 id + 自增序号，避免与循环池或同类 one-shot 撞 key
      const internalKey = `${soundId}#${this.oneShotSeq++}`;
      this.activeOneShotIds.add(soundId);

      const abandon = () => {
        this.oneShotSounds.delete(internalKey);
        this.activeOneShotIds.delete(soundId);
      };

      try {
        // 与 play() 保持同一构造写法：basePath 传 null（仅类型断言，运行时不变）
        const sound = new Sound(soundPath, null as any, (error: any) => {
          if (error) {
            console.warn(`[SFX-DIAG] playOneShot 加载失败 key=${internalKey} path=${soundPath} msg=${error?.message || error}`);
            abandon();
            resolve(false);
            return;
          }

          try {
            const safeVol = Math.max(0, Math.min(1, vol));
            // 载入成功后再设音量/循环数（此时原生实例才就绪）
            sound.setVolume(safeVol);
            sound.setNumberOfLoops(0); // 不循环

            this.oneShotSounds.set(internalKey, sound);

            // 【释放时机】react-native-sound 的 play 回调 = 播放结束/失败时才触发
            sound.play((success) => {
              // stop()/stopAll() 可能已经释放过，此时不得重复 release
              if (!this.oneShotSounds.has(internalKey)) {
                return;
              }
              this.releaseOneShot(internalKey, soundId);
              console.log(`[SFX-DIAG] one-shot 播完并释放 key=${internalKey} success=${success}`);
            });

            console.log(`[SFX-DIAG] playOneShot 已开始 key=${internalKey} soundId=${soundId} path=${soundPath} vol=${safeVol}`);
            resolve(true);
          } catch (innerError: any) {
            console.warn(`[SFX-DIAG] playOneShot 播放异常 key=${internalKey} path=${soundPath} msg=${innerError?.message || innerError}`);
            try {
              sound.release();
            } catch {
              // 释放失败无需再处理
            }
            abandon();
            resolve(false);
          }
        });

        // 兜底：构造期同步抛错时不让 Promise 悬挂
        if (!sound) {
          abandon();
          resolve(false);
        }
      } catch (error: any) {
        console.warn(`[SFX-DIAG] playOneShot 构造失败 key=${internalKey} path=${soundPath} msg=${error?.message || error}`);
        abandon();
        resolve(false);
      }
    });
  }

  /**
   * 停止指定循环音效（仅循环池，不触碰 one-shot）
   * 【P0-2】play() 内部的「防重复」调用改用它，避免误杀并发中的 one-shot
   */
  private stopLoopSound(soundId: string): void {
    const sound = this.activeSounds.get(soundId);
    if (sound) {
      console.log('[SFXPlayer] 停止音效:', soundId);
      sound.stop();
      // 不立即清理，等待播放完成回调处理
    }
  }

  /**
   * 停止指定的循环音效（不牵连 one-shot）
   * @param soundId 音效 ID
   */
  stop(soundId: string): void {
    // 【P0-2 回归修复】此处绝不能调用 releaseAllOneShots()：
    // AudioService.toggleAmbience(:2703) 用 stop('small_<id>') 关闭单个交互音，
    // 一旦牵连 one-shot，就会掐掉老唱片店正在播放的随机音效（要等下一个 10–35s 周期才补声）。
    // one-shot 的生命周期另有两道保障，无需单点 stop 兜底：
    //   ① 播完时由底层 play 回调自释放（success 为 true/false 均释放，见 :220-227 → releaseOneShot）；
    //   ② 场景切换 / 组件卸载走 stopAll() → releaseAllOneShots() 全量兜底。
    this.stopLoopSound(soundId);
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
    // 【P0-2】one-shot 也必须随 stopAll 释放（场景切换/停止时防止内存与音频焦点泄漏）
    this.releaseAllOneShots('stopAll');
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
   * 【P0-2】释放单个 one-shot（仅在底层播放结束回调中调用）
   */
  private releaseOneShot(internalKey: string, externalId: string): void {
    const sound = this.oneShotSounds.get(internalKey);
    this.oneShotSounds.delete(internalKey);
    this.activeOneShotIds.delete(externalId);
    if (!sound) return;

    try {
      sound.stop();
      sound.release();
    } catch (error: any) {
      console.warn(`[SFX-DIAG] one-shot 释放失败 key=${internalKey} msg=${error?.message || error}`);
    }
  }

  /**
   * 【P0-2】释放全部在飞 one-shot，并清空集合（自增序号【不】清空，保持单调）。
   * 只操作 oneShotSounds / activeOneShotIds，绝不触碰循环池 activeSounds。
   */
  private releaseAllOneShots(reason: string): void {
    if (this.oneShotSounds.size === 0) {
      this.activeOneShotIds.clear();
      return;
    }

    const count = this.oneShotSounds.size;
    this.oneShotSounds.forEach((sound, key) => {
      try {
        sound.stop();
        sound.release();
      } catch (error: any) {
        console.warn(`[SFX-DIAG] one-shot 批量释放失败 key=${key} msg=${error?.message || error}`);
      }
    });

    this.oneShotSounds.clear();
    this.activeOneShotIds.clear();
    // 【序号必须单调递增，禁止重置】若在此把 oneShotSeq 归零，stopAll() 之后新建的 one-shot
    // 会复用上一代已用过的 key（如 record_shop_sfx_x#0）；上一代 Sound 迟到的 play 结束回调
    // 便会通过 has(internalKey) 命中这个新 key，把正在播放的新实例误杀。故此处绝不重置序号。
    console.log(`[SFX-DIAG] 已释放 ${count} 个在飞 one-shot (${reason})`);
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
