package com.anonymous.soundtherapyapp

import android.media.audiofx.Equalizer
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * 音频分苯采集模块
 * 功能：实时采集麦克风音频，计算分贝值
 * 兼容 RN 0.81 + Android 15 16KB Page Size
 */
class AudioLevelModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private var isRecording = false
    private var audioRecord: AudioRecord? = null
    private var coroutineScope: CoroutineScope? = null
    private var job: Job? = null
    
    // 8 段均衡器实例
    private var equalizer: Equalizer? = null
    private var audioSessionId: Int = 0
    
    // 8 段频率中心点 (Hz): 60Hz, 150Hz, 400Hz, 1kHz, 2.5kHz, 5kHz, 10kHz, 16kHz
    private val eqBands = listOf(60f, 150f, 400f, 1000f, 2500f, 5000f, 10000f, 16000f)
    
    private val reactContext: ReactApplicationContext = reactContext
    
    override fun getName(): String = "AudioLevelModule"
    
    /**
     * 开始音频采集
     * @param intervalMs 采样间隔（毫秒）
     */
    @ReactMethod
    fun startListening(intervalMs: Int = 100) {
        if (isRecording) {
            Log.w(TAG, "已经在采集中")
            return
        }
        
        Log.d(TAG, "开始音频采集，间隔：${intervalMs}ms")
        
        try {
            // 配置 AudioRecord
            val sampleRate = 44100
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            
            // 计算最小缓冲区大小
            val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
            val bufferSize = max(minBufferSize, 2048)
            
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord 初始化失败")
                return
            }
            
            isRecording = true
            coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
            
            audioRecord?.startRecording()
            Log.d(TAG, "AudioRecord 开始录音")
            
            // 定时采集
            job = coroutineScope?.launch {
                val buffer = ShortArray(bufferSize / 2)
                
                while (isRecording && isActive) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    
                    if (read > 0) {
                        // 计算 RMS（均方根）
                        var sum = 0.0
                        for (i in 0 until read) {
                            sum += buffer[i].toDouble().pow(2.0)
                        }
                        val rms = kotlin.math.sqrt(sum / read)
                        
                        // 转换为分贝值 (dB)
                        // 根据实际采集数据调整：
                        // - 安静环境：0-15dB
                        // - 正常说话：20-35dB
                        // - 吵闹环境：40-60dB
                        val reference = 20.0 // 继续降低参考值，大幅提高灵敏度
                        val dB = if (rms > 0) {
                            20.0 * log10(rms / reference)
                        } else {
                            0.0
                        }
                        
                        // 限制范围 0-160
                        val positiveDB = max(0.0, min(160.0, dB))
                        
                        // 归一化振幅 (0-1)
                        val amplitude = rms / 32768.0
                        
                        // 发送事件到 JS
                        sendEventToJS("onAmplitudeChanged", amplitude, positiveDB)
                        
                        Log.d(TAG, "采集：RMS=${String.format("%.2f", rms)}, dB=${String.format("%.2f", positiveDB)}")
                    }
                    
                    // 等待指定间隔
                    delay(intervalMs.toLong())
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "开始采集失败", e)
            isRecording = false
        }
    }
    
    /**
     * 停止音频采集
     */
    @ReactMethod
    fun stopListening() {
        if (!isRecording) {
            return
        }
        
        Log.d(TAG, "停止音频采集")
        
        try {
            isRecording = false
            job?.cancel()
            coroutineScope?.cancel()
            
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            
            Log.d(TAG, "AudioRecord 已释放")
        } catch (e: Exception) {
            Log.e(TAG, "停止采集失败", e)
        }
    }
    
    /**
     * 设置振幅监听器（从 JS 调用）
     */
    @ReactMethod
    fun setAmplitudeListener(listenerName: String) {
        Log.d(TAG, "设置监听器：$listenerName")
    }
    
    /**
     * 初始化 8 段均衡器
     * @param sessionId 音频会话 ID
     */
    @ReactMethod
    fun initEqualizer(sessionId: Int) {
        // 【冷启动优化】增加 AudioSessionId 合法性校验
        if (sessionId <= 0) {
            Log.w(TAG, "⚠️ 无效的 AudioSessionId: $sessionId，启动延迟重试机制")
            // 延迟 200ms 重试
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    delay(200)
                    Log.d(TAG, "🔄 重试初始化均衡器...")
                    // 重试时假设 sessionId 已经就绪
                    initEqualizerInternal(sessionId)
                } catch (e: Exception) {
                    Log.e(TAG, "❌ 重试失败", e)
                }
            }
            return
        }
        
        initEqualizerInternal(sessionId)
    }
    
    /**
     * 内部均衡器初始化方法
     */
    private fun initEqualizerInternal(sessionId: Int) {
        try {
            Log.d(TAG, "🔧 开始初始化均衡器，SessionID: $sessionId")
            
            // 【防御性检查】确保 sessionId 有效
            if (sessionId <= 0) {
                Log.e(TAG, "❌ AudioSessionId 无效：$sessionId")
                return
            }
            
            audioSessionId = sessionId
            equalizer = Equalizer(0, sessionId)
            equalizer?.enabled = true
            
            Log.d(TAG, "✅ 均衡器初始化成功，SessionID: $sessionId")
            Log.d(TAG, "频段数量：${equalizer?.numberOfBands}")
            
            // 打印各频段的中心频率
            for (i in 0 until (equalizer?.numberOfBands ?: 0)) {
                val centerFreq = equalizer?.getCenterFreq(i.toShort())
                Log.d(TAG, "频段 $i: ${centerFreq}Hz")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 均衡器初始化失败", e)
            // 【异常恢复】如果初始化失败，尝试释放并重新创建
            try {
                equalizer?.release()
                equalizer = null
                Log.w(TAG, "⚠️ 已释放失败的均衡器实例，可尝试重新初始化")
            } catch (releaseError: Exception) {
                Log.e(TAG, "❌ 释放均衡器失败", releaseError)
            }
        }
    }
    
    /**
     * 更新均衡器增益
     * @param index 频段索引 (0-7)
     * @param gain 增益值 (-1.0 到 1.0)
     */
    @ReactMethod
    fun updateNativeEQ(index: Int, gain: Double) {
        // 【冷启动保护】快速失败检查
        if (equalizer == null) {
            Log.w(TAG, "⚠️ 均衡器未初始化，忽略更新：index=$index, gain=$gain")
            return
        }
        
        if (index < 0 || index >= eqBands.size) {
            Log.w(TAG, "无效的频段索引：$index")
            return
        }
        
        try {
            // 将增益值 (-1.0 到 1.0) 映射到毫分贝
            // Android Equalizer 使用 mB (毫分贝)，1dB = 100mB
            // 增益范围通常是 -15dB 到 +15dB (-1500mB 到 +1500mB)
            val minMB: Int = -1500
            val maxMB: Int = 1500
            
            // 映射：gain (-1.0 ~ 1.0) -> mB (minMB ~ maxMB)
            val mbValue = ((gain + 1.0) / 2.0 * (maxMB - minMB) + minMB).toInt()
            
            // 找到最接近的频段
            val targetFreq = eqBands[index]
            var nearestBand = 0
            var minDiff = Int.MAX_VALUE
            
            val numBands = equalizer?.numberOfBands ?: 0
            for (i: Int in 0 until numBands) {
                val centerFreq: Int = (equalizer?.getCenterFreq(i.toShort()) ?: 0).toInt()
                val targetFreq: Int = eqBands[index].toInt()
                val diff = kotlin.math.abs(centerFreq - targetFreq)
                if (diff < minDiff) {
                    minDiff = diff
                    nearestBand = i
                }
            }
            
            // 【安全检查】确保均衡器仍然有效
            if (equalizer == null || !equalizer!!.enabled) {
                Log.w(TAG, "⚠️ 均衡器已释放或未启用，跳过更新")
                return
            }
            
            // 设置增益
            equalizer?.setBandLevel(nearestBand.toShort(), mbValue.toShort())
            
            Log.d(TAG, "✅ 更新 EQ: index=$index, freq=${eqBands[index]}Hz, gain=$gain, mB=$mbValue, nearestBand=$nearestBand")
        } catch (e: IllegalStateException) {
            // 【特定异常处理】音频服务未就绪时
            Log.e(TAG, "❌ 音频服务未就绪，无法更新 EQ", e)
            // 不抛出异常，静默失败，防止模块挂起
        } catch (e: Exception) {
            // 【通用异常处理】防止任何未预期的异常导致模块崩溃
            Log.e(TAG, "❌ 更新 EQ 时发生未预期异常", e)
            // 尝试恢复：释放并标记需要重新初始化
            try {
                equalizer?.release()
                equalizer = null
                Log.w(TAG, "⚠️ 已释放均衡器，需要重新初始化")
            } catch (releaseError: Exception) {
                Log.e(TAG, "❌ 释放均衡器失败", releaseError)
            }
        }
    }
    
    /**
     * 重置均衡器到默认值 (0dB)
     */
    @ReactMethod
    fun resetEqualizer() {
        try {
            if (equalizer == null) {
                return
            }
            
            for (i in 0 until (equalizer?.numberOfBands ?: 0)) {
                equalizer?.setBandLevel(i.toShort(), 0)
            }
            
            Log.d(TAG, "均衡器已重置")
        } catch (e: Exception) {
            Log.e(TAG, "重置均衡器失败", e)
        }
    }
    
    /**
     * 释放均衡器资源
     */
    @ReactMethod
    fun releaseEqualizer() {
        try {
            equalizer?.release()
            equalizer = null
            audioSessionId = 0
            Log.d(TAG, "均衡器已释放")
        } catch (e: Exception) {
            Log.e(TAG, "释放均衡器失败", e)
        }
    }
    
    /**
     * 发送事件到 JS
     */
    private fun sendEventToJS(eventName: String, amplitude: Double, dB: Double) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, Arguments.createMap().apply {
                putDouble("amplitude", amplitude)
                putDouble("dB", dB)
            })
    }
    
    companion object {
        private const val TAG = "AudioLevelModule"
        
        // 静态引用，用于从外部设置回调
        @Volatile
        var instance: AudioLevelModule? = null
            private set
        
        init {
            instance = null
        }
    }
    
    override fun initialize() {
        super.initialize()
        instance = this
        Log.d(TAG, "AudioLevelModule 初始化完成")
    }
    
    @Deprecated("Use instance property directly")
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        stopListening()
        instance = null
    }
}
