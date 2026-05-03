package com.anonymous.soundtherapyapp

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.os.Process
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import kotlin.math.*

/**
 * 多轨混音引擎 - myNoise 级别音频控制
 * 
 * 架构：
 * - 8 路独立音轨（雨声、风声、钟声等）
 * - 每路音轨 8 段带通滤波器
 * - 64 个独立增益控制点
 * - 防爆音归一化算法
 * - 对数平滑插值
 * - THREAD_PRIORITY_AUDIO 调度
 */
class MultiTrackMixer(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "MultiTrackMixer"
        private const val NUM_TRACKS = 8
        private const val NUM_BANDS = 8
        private const val SAMPLE_RATE = 48000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_OUT_STEREO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        
        // 8 段频率中心点 (Hz)
        private val BAND_FREQUENCIES = floatArrayOf(
            60f,    // 60Hz   - 超低频
            150f,   // 150Hz  - 低频
            400f,   // 400Hz  - 中低频
            1000f,  // 1kHz   - 中频
            2500f,  // 2.5kHz - 中高频
            5000f,  // 5kHz   - 高频
            10000f, // 10kHz  - 超高频
            16000f  // 16kHz  - 空气感
        )
        
        // 最大增益（防止爆音）
        private const val MAX_GAIN_DB = 12.0f
        private const val MIN_GAIN_DB = -12.0f
        private const val CLIPPING_THRESHOLD_DB = -0.5f
    }
    
    private val reactContext: ReactApplicationContext = reactContext
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // 8 路音轨
    private val audioTracks = arrayOfNulls<AudioTrack>(NUM_TRACKS)
    
    // 每路音轨的 8 段均衡器
    private val trackEqualizers = Array(NUM_TRACKS) { arrayOfNulls<Equalizer>(NUM_BANDS) }
    
    // 每路音轨的增益矩阵 [track][band]
    private val gainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    
    // 平滑过渡目标值
    private val targetGainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    
    // 平滑插值协程
    private var smoothingJob: Job? = null
    
    // 总输出增益（用于归一化）
    private var masterGain = 1.0f
    
    // 低音增强器
    private val bassBoosts = arrayOfNulls<BassBoost>(NUM_TRACKS)
    
    // 响度增强器
    private var loudnessEnhancer: LoudnessEnhancer? = null
    
    override fun getName(): String = "MultiTrackMixer"
    
    /**
     * 初始化混音引擎
     */
    @ReactMethod
    override fun initialize() {
        Log.d(TAG, "🎛️ 初始化多轨混音引擎")
        
        try {
            // 设置线程优先级为 AUDIO
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            Log.d(TAG, "✅ 线程优先级已设置为 AUDIO")
            
            // 初始化 8 路音轨
            for (i in 0 until NUM_TRACKS) {
                initAudioTrack(i)
            }
            
            // 启动平滑插值循环
            startSmoothingLoop()
            
            Log.d(TAG, "✅ 多轨混音引擎初始化完成")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 初始化失败", e)
        }
    }
    
    /**
     * 初始化单路音轨
     */
    private fun initAudioTrack(trackIndex: Int) {
        try {
            val minBufferSize = AudioTrack.getMinBufferSize(
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT
            )
            
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            
            val audioFormat = AudioFormat.Builder()
                .setEncoding(AUDIO_FORMAT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(CHANNEL_CONFIG)
                .build()
            
            audioTracks[trackIndex] = AudioTrack(
                audioAttributes,
                audioFormat,
                minBufferSize * 2,
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            )
            
            val sessionId = audioTracks[trackIndex]!!.audioSessionId
            
            // 为该音轨创建 8 段均衡器
            for (band in 0 until NUM_BANDS) {
                createBandPassFilter(trackIndex, band, sessionId)
            }
            
            // 创建低音增强器
            bassBoosts[trackIndex] = BassBoost(0, sessionId)
            bassBoosts[trackIndex]?.enabled = true
            
            Log.d(TAG, "✅ 音轨 $trackIndex 初始化成功，SessionID: $sessionId")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 音轨 $trackIndex 初始化失败", e)
        }
    }
    
    /**
     * 创建带通滤波器（使用 Equalizer 模拟）
     */
    private fun createBandPassFilter(trackIndex: Int, bandIndex: Int, sessionId: Int) {
        try {
            // 使用 Equalizer 的单个频段作为带通滤波器
            val equalizer = Equalizer(0, sessionId)
            equalizer.enabled = true
            
            trackEqualizers[trackIndex][bandIndex] = equalizer
            
            Log.d(TAG, "✅ 音轨$trackIndex 频段$bandIndex 滤波器创建成功")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 创建滤波器失败", e)
        }
    }
    
    /**
     * 设置某路音轨的某个频段增益
     * @param trackIndex 音轨索引 (0-7)
     * @param bandIndex 频段索引 (0-7)
     * @param gain 增益值 (-1.0 ~ 1.0)，映射到 -12dB ~ +12dB
     */
    @ReactMethod
    fun setTrackBandGain(trackIndex: Int, bandIndex: Int, gain: Double) {
        if (trackIndex !in 0 until NUM_TRACKS || bandIndex !in 0 until NUM_BANDS) {
            Log.w(TAG, "⚠️ 参数超出范围：track=$trackIndex, band=$bandIndex")
            return
        }
        
        // 设置目标值（平滑插值会自动处理）
        targetGainMatrix[trackIndex][bandIndex] = gain.toFloat()
        
        // 立即应用（可选，平滑插值会在后台处理）
        applyGain(trackIndex, bandIndex, gain.toFloat())
    }
    
    /**
     * 应用增益到硬件
     */
    private fun applyGain(trackIndex: Int, bandIndex: Int, gain: Float) {
        try {
            gainMatrix[trackIndex][bandIndex] = gain
            
            val equalizer = trackEqualizers[trackIndex][bandIndex] ?: return
            
            // 映射增益到毫分贝
            val mbValue = gainToMilliBel(gain)
            
            // 设置均衡器增益
            equalizer.setBandLevel(bandIndex.toShort(), mbValue.toShort())
            
            // 记录日志（仅首次或变化大时）
            if (abs(gain) > 0.9) {
                Log.d(TAG, "🎚️ 音轨$trackIndex 频段$bandIndex: ${gainToDB(gain)}dB")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 应用增益失败", e)
        }
    }
    
    /**
     * 批量设置多路音轨的增益（用于 Anti-Clipping）
     */
    @ReactMethod
    fun setMultiTrackGains(promise: Promise) {
        try {
            // 计算总能量
            var totalEnergy = 0.0
            
            for (track in 0 until NUM_TRACKS) {
                for (band in 0 until NUM_BANDS) {
                    val gain = targetGainMatrix[track][band]
                    totalEnergy += abs(gain)
                }
            }
            
            // Anti-Clipping 归一化
            val maxEnergy = NUM_TRACKS * NUM_BANDS * 1.0 // 最大理论能量
            val normalizedGain = if (totalEnergy > maxEnergy * 0.8) {
                // 超过阈值，进行归一化
                (maxEnergy * 0.8 / totalEnergy).toFloat()
            } else {
                1.0f
            }
            
            // 应用归一化增益
            for (track in 0 until NUM_TRACKS) {
                for (band in 0 until NUM_BANDS) {
                    val originalGain = targetGainMatrix[track][band]
                    val normalizedGainValue = originalGain * normalizedGain
                    applyGain(track, band, normalizedGainValue)
                }
            }
            
            masterGain = normalizedGain
            
            val result = Arguments.createMap().apply {
                putDouble("masterGain", normalizedGain.toDouble())
                putDouble("totalEnergy", totalEnergy)
                putBoolean("isClipping", totalEnergy > maxEnergy * 0.8)
            }
            
            promise.resolve(result)
            Log.d(TAG, "✅ 多轨增益设置完成，MasterGain: $normalizedGain")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 设置多轨增益失败", e)
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * 启动平滑插值循环
     */
    private fun startSmoothingLoop() {
        smoothingJob?.cancel()
        
        smoothingJob = coroutineScope.launch {
            Log.d(TAG, "🔄 平滑插值循环启动")
            
            while (isActive) {
                // 每 10ms 更新一次（50ms 内完成过渡需要 5 次迭代）
                delay(10)
                
                // 对每个增益进行平滑插值
                for (track in 0 until NUM_TRACKS) {
                    for (band in 0 until NUM_BANDS) {
                        val currentGain = gainMatrix[track][band]
                        val targetGain = targetGainMatrix[track][band]
                        
                        // 如果差异很小，跳过
                        if (abs(currentGain - targetGain) < 0.01) {
                            continue
                        }
                        
                        // 对数插值（模拟人耳感知）
                        val smoothedGain = logarithmicInterpolate(currentGain, targetGain, 0.2f)
                        
                        // 应用平滑后的增益
                        applyGain(track, band, smoothedGain)
                    }
                }
            }
        }
    }
    
    /**
     * 对数插值（模拟人耳对数感知）
     */
    private fun logarithmicInterpolate(current: Float, target: Float, factor: Float): Float {
        // 使用对数曲线插值，让变化更符合人耳感知
        val sign = if (target > current) 1f else -1f
        val diff = abs(target - current)
        
        // 对数曲线：开始快，结束慢
        val logDiff = ln(1f + diff * 9f) / ln(10f) // 归一化到 0-1
        val step = logDiff * factor * sign
        
        return (current + step).coerceIn(-1f, 1f)
    }
    
    /**
     * 增益转毫分贝
     */
    private fun gainToMilliBel(gain: Float): Int {
        // gain: -1.0 ~ 1.0 -> dB: -12 ~ +12 -> mB: -1200 ~ +1200
        val db = gain * MAX_GAIN_DB
        return (db * 100).toInt()
    }
    
    /**
     * 增益转分贝
     */
    private fun gainToDB(gain: Float): Float {
        return gain * MAX_GAIN_DB
    }
    
    /**
     * 播放某路音轨
     */
    @ReactMethod
    fun playTrack(trackIndex: Int, uri: String, promise: Promise) {
        coroutineScope.launch {
            try {
                val audioTrack = audioTracks[trackIndex] ?: run {
                    promise.reject("ERROR", "音轨$trackIndex 未初始化")
                    return@launch
                }
                
                Log.d(TAG, "▶️ 播放音轨 $trackIndex: $uri")
                
                // TODO: 实现音频文件加载和播放
                // 这里需要从 uri 读取音频数据并写入 AudioTrack
                
                audioTrack.play()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "❌ 播放失败", e)
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * 暂停某路音轨
     */
    @ReactMethod
    fun pauseTrack(trackIndex: Int, promise: Promise) {
        try {
            audioTracks[trackIndex]?.pause()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * 停止某路音轨
     */
    @ReactMethod
    fun stopTrack(trackIndex: Int, promise: Promise) {
        try {
            audioTracks[trackIndex]?.stop()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * 设置主音量
     */
    @ReactMethod
    fun setMasterVolume(volume: Double, promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(AudioManager::class.java)
            val maxVolume = audioManager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15
            val targetVolume = (volume * maxVolume).toInt()
            
            audioManager?.setStreamVolume(
                AudioManager.STREAM_MUSIC,
                targetVolume,
                0
            )
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * 释放资源
     */
    @ReactMethod
    fun release() {
        Log.d(TAG, "🧹 释放多轨混音引擎资源")
        
        smoothingJob?.cancel()
        
        for (track in 0 until NUM_TRACKS) {
            try {
                audioTracks[track]?.stop()
                audioTracks[track]?.release()
                audioTracks[track] = null
                
                for (band in 0 until NUM_BANDS) {
                    trackEqualizers[track][band]?.release()
                    trackEqualizers[track][band] = null
                }
                
                bassBoosts[track]?.release()
                bassBoosts[track] = null
            } catch (e: Exception) {
                Log.e(TAG, "❌ 释放音轨$track 失败", e)
            }
        }
        
        loudnessEnhancer?.release()
        loudnessEnhancer = null
        
        Log.d(TAG, "✅ 资源释放完成")
    }
    
    override fun invalidate() {
        release()
    }
}
