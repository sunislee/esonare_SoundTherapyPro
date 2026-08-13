/**
 * 音频分析服务（真实麦克风采集版）
 * 
 * 功能：
 * - 使用原生 AudioRecord API 采集麦克风音频
 * - 实时计算 RMS 和分贝值
 * - 3 秒采样窗口
 * - 连续 1 次确认防抖
 * - 场景识别逻辑（Traffic/Crowd/Wind）
 * 
 * 技术底线：
 * - 兼容 RN 0.81
 * - 16KB Page Size 合规
 * - 低 CPU 占用
 */

import { AudioLevel } from '../modules/AudioLevel';

export type SceneType = 'traffic' | 'crowd' | 'wind' | 'unknown';

export interface AudioSample {
  timestamp: number;
  dB: number; // 分贝值
  amplitude: number; // 振幅（0-1）
}

export interface SceneDetectionResult {
  scene: SceneType;
  confidence: number; // 置信度 0-1
  dB: number;
}

// 配置参数
  const CONFIG = {
    // 采样窗口：3 秒
    SAMPLE_WINDOW_MS: 3000,
    
    // 采样间隔：100ms（3 秒内采样 30 次）
    SAMPLE_INTERVAL_MS: 100,
    
    // 防抖：连续 1 次确认（为了测试灵敏度）
    CONFIRM_COUNT: 1,
    
    // 持续监测：每 10 秒重新评估一次
    REEVALUATION_INTERVAL_MS: 10000,
    
    // 分贝阈值（进一步放宽，避免抖动）
    DB_THRESHOLD_TRAFFIC: 50, // >50dB → Traffic
    DB_THRESHOLD_CROWD_MIN: 20, // 20-50dB → Crowd
    DB_THRESHOLD_CROWD_MAX: 50,
    DB_THRESHOLD_WIND_MIN: 0, // 0-20dB → Wind
    
    // 平稳度判断：标准差 < 5dB 认为是平稳的（提高阈值）
    STABILITY_THRESHOLD: 5.0,
    
    // 环境变化敏感度：分贝差异 > 8dB 认为环境变化
    ENV_CHANGE_THRESHOLD: 8,
  };

class AudioAnalyzerClass {
  private isRecording = false;
  private reevaluationInterval: ReturnType<typeof setInterval> | null = null;
  private samples: AudioSample[] = [];
  private currentScene: SceneType = 'unknown';
  private lastAvgDB: number = 0; // 记录上次平均 dB，用于检测环境变化
  private sceneConfirmCount: Record<SceneType, number> = {
    traffic: 0,
    crowd: 0,
    wind: 0,
    unknown: 0,
  };
  
  // 回调函数
  private onSceneChangeCallback?: (scene: SceneType, confidence: number, dB: number) => void;
  private onErrorCallback?: (error: Error) => void;

  /**
   * 开始音频采集与分析（持续监测模式 - 真实麦克风）
   */
  async start(onSceneChange: (scene: SceneType, confidence: number, dB: number) => void, onError?: (error: Error) => void): Promise<void> {
    if (this.isRecording) {
      console.log('[AudioAnalyzer] 已经在采集中，持续监测...');
      return;
    }

    console.log('[AudioAnalyzer] 🎤 [DEBUG] start() called, isRecording was:', this.isRecording);
    
    this.isRecording = true;
    this.samples = [];
    this.lastAvgDB = 0;
    this.onSceneChangeCallback = onSceneChange;
    this.onErrorCallback = onError;

    // [DEBUG] detect native module API
    const nativeMod = (AudioLevel as any).module;
    console.log('[AudioAnalyzer] [DEBUG] Native module keys:', nativeMod ? Object.keys(nativeMod) : 'NO MODULE');

    // 先请求麦克风权限（非阻塞，授权后再采集）
    if ((AudioLevel as any).checkMicrophonePermission) {
      try { await (AudioLevel as any).checkMicrophonePermission(); } catch (_e) {}
    }

    try {
      // 启动原生音频采集（每 100ms 回调一次）
      AudioLevel.start(
        (amplitude, dB) => {
          // 原生回调：收到分贝值
          const sample: AudioSample = {
            timestamp: Date.now(),
            dB: dB,
            amplitude: amplitude,
          };

          this.samples.push(sample);
          
          // DEBUG: 每 5 个样本打印一次
          if (this.samples.length % 5 === 0) {
            console.log(`[AudioAnalyzer] 📊 [DEBUG] 真实采集 #${this.samples.length}: ${dB.toFixed(1)}dB (振幅：${amplitude.toFixed(4)})`);
          }

          // 检查是否达到采样窗口（30 个样本 = 3 秒）
          if (this.samples.length >= CONFIG.SAMPLE_WINDOW_MS / CONFIG.SAMPLE_INTERVAL_MS) {
            this.analyzeWindow();
            this.samples = []; // 清空窗口
          }
        },
        CONFIG.SAMPLE_INTERVAL_MS
      );
      console.log('[AudioAnalyzer] [DEBUG] AudioLevel.start() returned successfully');
    } catch (err: any) {
      console.error('[AudioAnalyzer] [DEBUG] AudioLevel.start() threw:', err?.message || err);
      this.isRecording = false;
      return;
    }

    // 启动持续监测循环（每 10 秒重新评估一次）
    this.reevaluationInterval = setInterval(() => {
      this.forceReevaluate();
    }, CONFIG.REEVALUATION_INTERVAL_MS);
  }

  /**
   * 强制重新评估（用于环境变化检测）
   */
  private forceReevaluate(): void {
    console.log('[AudioAnalyzer] 🔄 执行周期性环境评估（重置计数）');
    // 完全重置确认计数，允许重新识别任何场景
    Object.keys(this.sceneConfirmCount).forEach(key => {
      this.sceneConfirmCount[key as SceneType] = 0;
    });
    // 重置当前场景，允许切换
    this.currentScene = 'unknown';
    console.log('[AudioAnalyzer] 🔄 已重置场景状态，准备重新识别');
  }

  /**
   * 停止音频采集
   */
  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    console.log('[AudioAnalyzer] 停止音频采集');
    
    // 停止原生采集
    AudioLevel.stop();
    
    if (this.reevaluationInterval) {
      clearInterval(this.reevaluationInterval);
      this.reevaluationInterval = null;
    }
    
    this.isRecording = false;
    this.samples = [];
    this.sceneConfirmCount = {
      traffic: 0,
      crowd: 0,
      wind: 0,
      unknown: 0,
    };
  }



  /**
   * 分析采样窗口（带详细 DEBUG 日志）
   */
  private analyzeWindow(): void {
    if (this.samples.length === 0) {
      return;
    }

    // 计算平均 dB
    const avgDB = this.samples.reduce((sum, s) => sum + s.dB, 0) / this.samples.length;
    
    // 计算标准差（判断平稳度）
    const variance = this.samples.reduce((sum, s) => sum + Math.pow(s.dB - avgDB, 2), 0) / this.samples.length;
    const stdDev = Math.sqrt(variance);

    // DEBUG: 详细日志
    console.log(`[AudioAnalyzer] ===== 窗口分析开始 =====`);
    console.log(`[AudioAnalyzer] 样本数：${this.samples.length}`);
    console.log(`[AudioAnalyzer] 平均 dB: ${avgDB.toFixed(1)} (范围：${Math.min(...this.samples.map(s => s.dB)).toFixed(1)} - ${Math.max(...this.samples.map(s => s.dB)).toFixed(1)})`);
    console.log(`[AudioAnalyzer] 标准差：${stdDev.toFixed(2)} (阈值：${CONFIG.STABILITY_THRESHOLD})`);
    console.log(`[AudioAnalyzer] 当前场景：${this.currentScene}`);

    // 环境变化检测
    const envChanged = this.lastAvgDB > 0 && Math.abs(avgDB - this.lastAvgDB) > CONFIG.ENV_CHANGE_THRESHOLD;
    if (envChanged) {
      console.log(`[AudioAnalyzer] ⚠️ 检测到环境变化！上次：${this.lastAvgDB.toFixed(1)}dB, 当前：${avgDB.toFixed(1)}dB, 差异：${Math.abs(avgDB - this.lastAvgDB).toFixed(1)}dB`);
      // 环境变化时，重置确认计数，加速重新识别
      Object.keys(this.sceneConfirmCount).forEach(key => {
        this.sceneConfirmCount[key as SceneType] = 0;
      });
    }
    this.lastAvgDB = avgDB;

    // 场景识别逻辑（带滞后效应，防止边界抖动）
    let detectedScene: SceneType = 'unknown';

    if (avgDB > CONFIG.DB_THRESHOLD_TRAFFIC) {
      // 极响 → Traffic
      detectedScene = 'traffic';
      console.log(`[AudioAnalyzer] 🔊 识别结果：Traffic（极响 > ${CONFIG.DB_THRESHOLD_TRAFFIC}dB）`);
    } else if (avgDB >= CONFIG.DB_THRESHOLD_CROWD_MIN) {
      // 20-50dB 且有波动 → Crowd（主要识别区间）
      if (stdDev > CONFIG.STABILITY_THRESHOLD) {
        detectedScene = 'crowd';
        console.log(`[AudioAnalyzer] 🗣️ 识别结果：Crowd（中等波动，标准差 ${stdDev.toFixed(2)} > ${CONFIG.STABILITY_THRESHOLD}）`);
      } else {
        // 如果在 Crowd 范围内但平稳，也认为是 Crowd（人声可以是平稳的）
        detectedScene = 'crowd';
        console.log(`[AudioAnalyzer] 🗣️ 识别结果：Crowd（平稳人声，dB=${avgDB.toFixed(1)}）`);
      }
    } else if (avgDB < CONFIG.DB_THRESHOLD_CROWD_MIN && stdDev <= CONFIG.STABILITY_THRESHOLD) {
      // <20dB 且平稳 → Wind
      detectedScene = 'wind';
      console.log(`[AudioAnalyzer] 🌬️ 识别结果：Wind（安静平稳，标准差 ${stdDev.toFixed(2)}）`);
    } else {
      // 其他情况：默认 Crowd（人声是最常见的）
      detectedScene = 'crowd';
      console.log(`[AudioAnalyzer] 🗣️ 推测结果：Crowd（兜底，dB=${avgDB.toFixed(1)}）`);
    }

    // 防抖逻辑：连续确认（detectedScene 在此处已缩小为 traffic/crowd/wind）
    const scene = detectedScene as SceneType;
    if (scene !== 'unknown') {
      this.sceneConfirmCount[scene]++;
      console.log(`[AudioAnalyzer] 场景 ${detectedScene} 确认次数：${this.sceneConfirmCount[detectedScene]}/${CONFIG.CONFIRM_COUNT}`);
      
      if (this.sceneConfirmCount[detectedScene] >= CONFIG.CONFIRM_COUNT) {
        // 达到确认次数，触发场景切换
        if (this.currentScene !== detectedScene) {
          console.log(`[AudioAnalyzer] ✅ 场景切换：${this.currentScene} → ${detectedScene}`);
          this.currentScene = detectedScene;
          
          // 计算置信度
          const confidence = Math.min(1.0, this.sceneConfirmCount[detectedScene] / CONFIG.CONFIRM_COUNT);
          
          console.log(`[AudioAnalyzer] 📢 通知 UI 切换场景：${detectedScene} (置信度：${(confidence * 100).toFixed(0)}%, dB: ${avgDB.toFixed(1)})`);
          this.onSceneChangeCallback?.(detectedScene, confidence, avgDB);
        } else {
          // 场景未变化，也通知 UI 保持呼吸动画（低频通知）
          const confidence = Math.min(1.0, this.sceneConfirmCount[detectedScene] / CONFIG.CONFIRM_COUNT);
          console.log(`[AudioAnalyzer] 📢 场景未变，通知 UI 保持：${detectedScene} (置信度：${(confidence * 100).toFixed(0)}%, dB: ${avgDB.toFixed(1)})`);
          this.onSceneChangeCallback?.(detectedScene, confidence, avgDB);
        }
        
        // 重置其他场景的计数
        Object.keys(this.sceneConfirmCount).forEach(key => {
          if (key !== detectedScene) {
            this.sceneConfirmCount[key as SceneType] = 0;
          }
        });
      }
    } else {
      // 未识别到场景，重置所有计数
      console.log(`[AudioAnalyzer] ❌ 未识别到有效场景，重置计数`);
      Object.keys(this.sceneConfirmCount).forEach(key => {
        this.sceneConfirmCount[key as SceneType] = 0;
      });
    }
    
    console.log(`[AudioAnalyzer] ===== 窗口分析结束 =====\n`);
  }

  /**
   * 获取当前场景
   */
  getCurrentScene(): SceneType {
    return this.currentScene;
  }

  /**
   * 检查是否正在采集
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * 获取当前采样窗口的平均分贝值
   * @returns 平均分贝值，如果尚未采集则返回 null
   */
  getAverageDB(): number | null {
    if (this.samples.length === 0) return null;
    const sum = this.samples.reduce((s, v: AudioSample) => s + v.dB, 0);
    return sum / this.samples.length;
  }
}

// 单例导出
export const AudioAnalyzer = new AudioAnalyzerClass();
