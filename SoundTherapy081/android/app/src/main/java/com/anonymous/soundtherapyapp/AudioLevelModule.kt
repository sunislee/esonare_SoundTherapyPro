package com.anonymous.soundtherapyapp

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
