import { AudioLevel, AudioLevelEvent } from '../modules/AudioLevel';

/**
 * AudioAnalyzer - 音频分析器
 * 
 * 功能：
 * 1. 接收原生层传来的实时 dB 值
 * 2. 根据 dB 值模拟计算低/中/高频分布百分比
 * 3. 提供频谱数据订阅接口
 * 
 * 注意：频谱分布是基于经验公式的模拟值，非真实 FFT 分析
 */

export interface FrequencyDistribution {
  low: number;    // 低频 (20-300Hz): 0-100%
  mid: number;    // 中频 (300-2kHz): 0-100%
  high: number;   // 高频 (2k-20kHz): 0-100%
  totalDB: number; // 总 dB 值 (0-100)
}

export type FrequencyDistributionListener = (distribution: FrequencyDistribution) => void;

class AudioAnalyzerClass {
  private listener: FrequencyDistributionListener | null = null;
  private audioLevelSubscription: (() => void) | null = null;
  private isRunning = false;

  /**
   * 根据总 dB 值模拟频率分布
   * 
   * 模拟逻辑（基于经验公式）：
   * - 低频：环境噪音通常在低频段能量较高，占比 40-60%
   * - 中频：人声和日常噪音集中在中频，占比 25-45%
   * - 高频：高频能量相对较少，占比 10-25%
   * 
   * 随着总 dB 值变化，各频段比例会动态调整
   */
  private simulateFrequencyDistribution(totalDB: number): FrequencyDistribution {
    // 归一化 dB 值到 0-1 范围
    const normalizedDB = Math.min(1, totalDB / 100);

    // 基础分布比例（安静环境）
    let lowBase = 0.50;  // 低频基础 50%
    let midBase = 0.35;  // 中频基础 35%
    let highBase = 0.15; // 高频基础 15%

    // 随着噪音增大，低频占比增加（模拟真实环境噪音特性）
    if (normalizedDB > 0.3) {
      const increase = (normalizedDB - 0.3) * 0.4; // 最多增加 40%
      lowBase = Math.min(0.75, lowBase + increase);
      midBase = Math.max(0.20, midBase - increase * 0.4);
      highBase = Math.max(0.05, highBase - increase * 0.6);
    }

    // 添加随机波动（模拟真实频谱的动态变化）
    const randomFactor = () => (Math.random() - 0.5) * 0.15; // ±7.5% 波动

    let low = Math.max(0, Math.min(1, lowBase + randomFactor()));
    let mid = Math.max(0, Math.min(1, midBase + randomFactor()));
    let high = Math.max(0, Math.min(1, highBase + randomFactor()));

    // 确保总和为 1
    const total = low + mid + high;
    if (total > 0) {
      low = low / total;
      mid = mid / total;
      high = high / total;
    }

    // 根据总 dB 值调整整体强度
    const intensity = normalizedDB;
    
    return {
      low: Math.round(low * intensity * 100),
      mid: Math.round(mid * intensity * 100),
      high: Math.round(high * intensity * 100),
      totalDB: Math.round(totalDB),
    };
  }

  /**
   * 启动音频分析
   * @param onDistributionUpdate 频谱分布更新回调
   */
  start(onDistributionUpdate: FrequencyDistributionListener) {
    if (this.isRunning) {
      console.warn('[AudioAnalyzer] 已经在运行中');
      return;
    }

    this.listener = onDistributionUpdate;
    this.isRunning = true;

    // 订阅原生音频数据
    this.audioLevelSubscription = AudioLevel.addListener((event: AudioLevelEvent) => {
      if (event.type === 'dB' && this.listener) {
        const distribution = this.simulateFrequencyDistribution(event.dB);
        this.listener(distribution);
      } else if (event.type === 'error') {
        console.warn('[AudioAnalyzer] 原生层错误:', event.message);
        // 权限拒绝时，停止分析但不报错
        if (event.message.includes('权限')) {
          this.stop();
        }
      }
    });

    // 启动原生采集
    AudioLevel.start();
    
    console.log('[AudioAnalyzer] 启动成功');
  }

  /**
   * 停止音频分析
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    // 取消订阅
    if (this.audioLevelSubscription) {
      this.audioLevelSubscription();
      this.audioLevelSubscription = null;
    }

    // 停止原生采集
    AudioLevel.stop();

    this.listener = null;
    this.isRunning = false;

    console.log('[AudioAnalyzer] 已停止');
  }

  /**
   * 获取当前运行状态
   */
  isAnalyzerRunning(): boolean {
    return this.isRunning;
  }
}

// 导出单例
export const AudioAnalyzer = new AudioAnalyzerClass();
export default AudioAnalyzer;
