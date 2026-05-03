/**
 * LFO 服务（Low Frequency Oscillator - 低频振荡器）
 * 
 * 功能：
 * 1. 生成三种基础波形：正弦波、三角波、方波
 * 2. 可调节速率（Rate）和深度（Depth）
 * 3. 为 8 段音轨提供动态音量调制
 * 
 * 应用场景：
 * - 为白噪音添加"呼吸感"和"流动感"
 * - 模拟自然环境的声音起伏
 * - 增强沉浸式听觉体验
 */

export type LFOWaveform = 'sine' | 'triangle' | 'square';

export interface LFOParams {
  waveform: LFOWaveform;
  rate: number;      // 0.1Hz - 10Hz (每秒周期数)
  depth: number;     // 0.0 - 1.0 (调制深度)
  phase?: number;    // 0.0 - 1.0 (相位偏移，可选)
}

/**
 * LFO 状态管理类
 */
class LFOService {
  private startTime: number = 0;
  private params: LFOParams = {
    waveform: 'sine',
    rate: 0.5,       // 默认 0.5Hz (每 2 秒一个周期)
    depth: 0.3,      // 默认 30% 调制深度
    phase: 0,
  };
  private isRunning: boolean = false;
  private animationFrame: number | null = null;
  private callbacks: Set<(value: number, trackIndex?: number) => void> = new Set();
  
  // 8 轨相位偏移（用于微风模式）
  private trackPhaseOffsets: number[] = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 配置 LFO 参数
   */
  configure(params: Partial<LFOParams>) {
    this.params = { ...this.params, ...params };
    console.log('[LFO] 参数更新:', this.params);
  }

  /**
   * 启动 LFO 振荡
   */
  start() {
    if (this.isRunning) {
      console.log('[LFO] 已经在运行中');
      return;
    }

    console.log('[LFO] 启动 - 波形:', this.params.waveform, '速率:', this.params.rate, 'Hz', '深度:', this.params.depth * 100 + '%');
    this.isRunning = true;
    this.startTime = Date.now();
    this.tick();
  }

  /**
   * 停止 LFO 振荡
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    console.log('[LFO] 停止');
  }

  /**
   * 订阅 LFO 更新
   * @param callback 回调函数 (value: number, trackIndex?: number) => void
   * @param trackIndex 音轨索引（0-7），用于多轨相位偏移
   */
  subscribe(callback: (value: number, trackIndex?: number) => void, trackIndex?: number) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * 计算当前时刻的 LFO 值（-1.0 到 1.0）
   * @param trackIndex 音轨索引（0-7），用于多轨相位偏移
   */
  private calculateLFOValue(trackIndex?: number): number {
    const elapsed = (Date.now() - this.startTime) / 1000; // 转换为秒
    
    // 如果是微风模式，使用音轨特定的相位偏移
    let phase = this.params.phase || 0;
    if (trackIndex !== undefined && this.params.rate === 0.12) {
      // 微风模式：应用 8 轨相位偏移
      phase = this.trackPhaseOffsets[trackIndex] || 0;
    }
    
    const angle = (elapsed * this.params.rate + phase) * Math.PI * 2;
    
    switch (this.params.waveform) {
      case 'sine':
        return Math.sin(angle);
        
      case 'triangle':
        // 三角波：从 -1 到 1 线性变化
        const triangleValue = 2 * Math.abs(2 * ((elapsed * this.params.rate + phase) % 1)) - 1;
        return triangleValue * (triangleValue < 0 ? -1 : 1);
        
      case 'square':
        // 方波：在 -1 和 1 之间切换
        return Math.sin(angle) >= 0 ? 1 : -1;
        
      default:
        return Math.sin(angle);
    }
  }

  /**
   * 应用 LFO 到基础音量
   * @param baseVolume 基础音量（0.0 - 1.0）
   * @returns 调制后的音量（0.0 - 1.0）
   */
  applyToVolume(baseVolume: number): number {
    const lfoValue = this.calculateLFOValue();
    // LFO 值范围：-1 到 1
    // 调制后音量范围：baseVolume * (1 - depth) 到 baseVolume
    const modulatedVolume = baseVolume * (1 - this.params.depth * (1 - lfoValue) / 2);
    
    // 限制在 0.0 - 1.0 范围内
    return Math.max(0.0, Math.min(1.0, modulatedVolume));
  }

  /**
   * 内部时钟循环
   */
  private tick = () => {
    if (!this.isRunning) {
      return;
    }

    // 为每个音轨计算独立的 LFO 值（微风模式）
    if (this.params.rate === 0.12) {
      // 8 轨微风模式：为每个音轨发送独立的 LFO 值
      for (let i = 0; i < 8; i++) {
        const value = this.calculateLFOValue(i);
        this.callbacks.forEach(callback => {
          try {
            callback(value, i);
          } catch (error) {
            console.error('[LFO] 回调执行失败:', error);
          }
        });
      }
    } else {
      // 其他模式：统一 LFO 值
      const lfoValue = this.calculateLFOValue();
      
      // 通知所有订阅者
      this.callbacks.forEach(callback => {
        try {
          callback(lfoValue);
        } catch (error) {
          console.error('[LFO] 回调执行失败:', error);
        }
      });
    }

    // 下一帧（目标 60fps）
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  /**
   * 获取当前 LFO 参数
   */
  getParams(): LFOParams {
    return { ...this.params };
  }

  /**
   * 获取当前 LFO 值（-1.0 到 1.0）
   */
  getCurrentValue(): number {
    return this.calculateLFOValue();
  }

  /**
   * 检查 LFO 是否在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// 导出单例
export const lfoService = new LFOService();

/**
 * 工具函数：生成预设 LFO 配置
 */
export const LFOPresets = {
  /**
   * 微风呼吸：慢速正弦波，中度调制
   * 更新：更慢的速率（0.12Hz），更深的调制（22%），随机相位
   */
  breeze: (phaseOffset: number = 0): LFOParams => ({
    waveform: 'sine',
    rate: 0.12,      // 每 8.3 秒一个周期（更慢、更自然）
    depth: 0.22,     // 22% 深度（更有呼吸感）
    phase: phaseOffset,  // 随机相位偏移，增加层次感
  }),

  /**
   * 流水波动：中速三角波，中度调制
   */
  water: (): LFOParams => ({
    waveform: 'triangle',
    rate: 0.5,       // 每 2 秒一个周期
    depth: 0.25,     // 25% 深度
    phase: 0,
  }),

  /**
   * 脉冲效果：快速方波，强度调制
   */
  pulse: (): LFOParams => ({
    waveform: 'square',
    rate: 1.0,       // 每秒一个周期
    depth: 0.4,      // 40% 深度
    phase: 0,
  }),

  /**
   * 深度冥想：极慢正弦波，深度调制
   */
  meditation: (): LFOParams => ({
    waveform: 'sine',
    rate: 0.1,       // 每 10 秒一个周期
    depth: 0.3,      // 30% 深度
    phase: 0,
  }),
};

export default lfoService;
