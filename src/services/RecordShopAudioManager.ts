import * as RNFS from '@dr.pogodin/react-native-fs';
import SFXPlayer from './SFXPlayer';
import { AUDIO_MAP, AMBIENT_RESOURCES, getDownloadUrl } from '../constants/audioAssets';

const getValidUrl = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const cleanPath = path.replace('file://', '').replace(/^\/+/, '');
  return `file:///${cleanPath}`;
};

export type RecordShopLayer = 'rain' | 'vinyl' | 'sfx';

export interface RecordShopVolumes {
  rain: number;
  vinyl: number;
  sfx: number;
}

const DEFAULT_VOLUMES: RecordShopVolumes = {
  rain: 0.8,
  vinyl: 0.3,
  sfx: 0.6,
};

const VINYL_CRACKLE_SOUND_ID = 'record_shop_vinyl_crackle';

const RANDOM_SFX_POOL: string[] = [
  AMBIENT_RESOURCES.RECORD_SHOP_DOOR_CHIME,
  AMBIENT_RESOURCES.RECORD_SHOP_FOOTSTEPS,
  AMBIENT_RESOURCES.RECORD_SHOP_RADIO_TUNING,
  AMBIENT_RESOURCES.RECORD_SHOP_VINYL_POP,
];

const SFX_INTERVALS_MS: number[] = [10000, 15000, 20000, 25000, 30000, 35000];

class RecordShopAudioManager {
  private static instance: RecordShopAudioManager;
  private sfxPlayer: SFXPlayer;
  private volumes: RecordShopVolumes = { ...DEFAULT_VOLUMES };
  private isActive: boolean = false;
  private randomSFXTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.sfxPlayer = SFXPlayer.getInstance();
  }

  static getInstance(): RecordShopAudioManager {
    if (!RecordShopAudioManager.instance) {
      RecordShopAudioManager.instance = new RecordShopAudioManager();
    }
    return RecordShopAudioManager.instance;
  }

  getVolumes(): RecordShopVolumes {
    return { ...this.volumes };
  }

  setLayerVolume(layer: RecordShopLayer, volume: number): void {
    this.volumes[layer] = Math.max(0, Math.min(1, volume));

    if (layer === 'vinyl' && this.isActive) {
      this.sfxPlayer.setVolume(VINYL_CRACKLE_SOUND_ID, this.volumes.vinyl);
    }
  }

  getLayerVolume(layer: RecordShopLayer): number {
    return this.volumes[layer];
  }

  async start(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;

    console.log('[RecordShopAudioManager] 🎵 启动老唱片店场景音频');

    try {
      const crackleFilename = AMBIENT_RESOURCES.RECORD_SHOP_CRACKLE;
      const crackleLocalPath = AUDIO_MAP[crackleFilename] || '';

      let cracklePath = crackleLocalPath;
      if (crackleLocalPath) {
        const cleanPath = crackleLocalPath.replace('file://', '');
        const exists = await RNFS.exists(cleanPath);
        if (!exists) {
          console.warn('[RecordShopAudioManager] ⚠️ Vinyl crackle 本地文件不存在，使用远程 URL');
          cracklePath = getDownloadUrl('life_record_shop_vinyl_crackle')[0];
        } else {
          cracklePath = getValidUrl(crackleLocalPath);
        }
      } else {
        cracklePath = getDownloadUrl('life_record_shop_vinyl_crackle')[0];
      }

      if (!cracklePath) {
        console.error('[RecordShopAudioManager] ❌ 无法获取 vinyl crackle 音频路径');
        return;
      }

      await this.sfxPlayer.play(cracklePath, VINYL_CRACKLE_SOUND_ID);
      this.sfxPlayer.setVolume(VINYL_CRACKLE_SOUND_ID, this.volumes.vinyl);
      console.log('[RecordShopAudioManager] ✅ Vinyl crackle 循环播放已启动');

      this.scheduleRandomSFX();
      console.log('[RecordShopAudioManager] ✅ 随机 SFX 定时器已启动');
    } catch (error: any) {
      // 【P0-2】原来只有一句笼统「启动失败」：setVolume 不存在抛出的 TypeError 被这里吞掉，
      // 且 scheduleRandomSFX() 随之永不执行 → 整个唱片店音效层静默失效。补可定位日志，不改控制流。
      console.warn(`[SFX-DIAG] start 失败 soundId=${VINYL_CRACKLE_SOUND_ID} filename=${AMBIENT_RESOURCES.RECORD_SHOP_CRACKLE} msg=${error?.message || error}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) return;
    this.isActive = false;

    console.log('[RecordShopAudioManager] 🛑 停止老唱片店场景音频');

    try {
      // 【🔑 修复 #3】await 确保 SFXPlayer.stop() 完全完成
      // vinyl crackle 是循环播放（setNumberOfLoops(-1)），stop() 后播放完成回调不会触发，
      // 所以必须手动释放资源，防止内存泄漏
      this.sfxPlayer.stop(VINYL_CRACKLE_SOUND_ID);
      console.log('[RecordShopAudioManager] ✅ Vinyl crackle 已停止');
    } catch (e) {
      console.error('[RecordShopAudioManager] ❌ 停止 vinyl crackle 失败:', e);
    }

    if (this.randomSFXTimer) {
      clearTimeout(this.randomSFXTimer);
      this.randomSFXTimer = null;
    }
    console.log('[RecordShopAudioManager] ✅ 随机 SFX 定时器已取消');
  }

  private scheduleRandomSFX(): void {
    if (!this.isActive) return;

    const randomInterval =
      SFX_INTERVALS_MS[Math.floor(Math.random() * SFX_INTERVALS_MS.length)];

    this.randomSFXTimer = setTimeout(() => {
      if (!this.isActive) return;
      this.playRandomSFX();
      this.scheduleRandomSFX();
    }, randomInterval);
  }

  private async resolveSFXPath(filename: string): Promise<string> {
    const localPath = AUDIO_MAP[filename] || '';
    if (localPath) {
      const cleanPath = localPath.replace('file://', '');
      const exists = await RNFS.exists(cleanPath);
      if (exists) {
        return getValidUrl(localPath);
      }
    }
    return getDownloadUrl(this.getSFXSceneId(filename))[0];
  }

  private getSFXSceneId(filename: string): string {
    const map: Record<string, string> = {
      [AMBIENT_RESOURCES.RECORD_SHOP_DOOR_CHIME]: 'life_record_shop_door_chime',
      [AMBIENT_RESOURCES.RECORD_SHOP_FOOTSTEPS]: 'life_record_shop_footsteps',
      [AMBIENT_RESOURCES.RECORD_SHOP_VINYL_POP]: 'life_record_shop_vinyl_pop',
      [AMBIENT_RESOURCES.RECORD_SHOP_RADIO_TUNING]: 'life_record_shop_radio_tuning',
    };
    return map[filename] || '';
  }

  private async playRandomSFX(): Promise<void> {
    const randomFilename =
      RANDOM_SFX_POOL[Math.floor(Math.random() * RANDOM_SFX_POOL.length)];

    try {
      const sfxPath = await this.resolveSFXPath(randomFilename);
      if (!sfxPath) {
        console.warn('[RecordShopAudioManager] ⚠️ 无法获取随机 SFX 路径');
        return;
      }

      const sfxId = `record_shop_sfx_${Date.now()}`;
      await this.sfxPlayer.playOneShot(sfxPath, sfxId, this.volumes.sfx);
      console.log('[RecordShopAudioManager] ✅ 随机 SFX 播放:', sfxId);
    } catch (error: any) {
      // 【P0-2】playOneShot 不存在时的 TypeError 正是被这里吞掉的。sfxId/sfxPath 声明在 try 内，
      // catch 里按作用域只能取到 randomFilename（即 path 来源），故输出它 + error.message。
      console.warn(`[SFX-DIAG] 随机 SFX 播放失败 filename=${randomFilename} msg=${error?.message || error}`);
    }
  }
}

export const recordShopAudioManager = RecordShopAudioManager.getInstance();
