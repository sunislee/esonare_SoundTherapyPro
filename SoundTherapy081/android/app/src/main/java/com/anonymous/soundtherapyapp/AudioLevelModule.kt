package com.anonymous.soundtherapyapp

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.RCTNativeAppEventEmitter
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * AudioLevelModule - 原生音频采集模块
 * 
 * 功能：
 * 1. 采集麦克风原始 PCM 数据
 * 2. 计算实时分贝值（dB）
 * 3. 以 100ms 频率向 JS 层发送事件
 * 4. 权限拒绝时静默处理，不弹窗
 */
@ReactModule(name = AudioLevelModule.REACT_CLASS)
class AudioLevelModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val REACT_CLASS = "AudioLevelModule"
        private const val SAMPLE_RATE = 44100
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val EVENT_NAME = "onAudioLevelUpdate"
        
        // 节流控制：100ms 发送一次
        private const val EMIT_INTERVAL_MS = 100L
    }

    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private val handler = Handler(Looper.getMainLooper())
    private var emitRunnable: Runnable? = null
    private val reactContext: ReactApplicationContext = reactContext

    override fun getName(): String = REACT_CLASS

    /**
     * 开始采集音频
     * 静默申请麦克风权限，如果拒绝则不启动采集
     */
    @ReactMethod
    fun start() {
        UiThreadUtil.runOnUiThread {
            // 检查麦克风权限
            if (ActivityCompat.checkSelfPermission(
                    reactContext,
                    Manifest.permission.RECORD_AUDIO
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                // 权限未授予，尝试请求（静默，不弹窗）
                ActivityCompat.requestPermissions(
                    reactContext.currentActivity!!,
                    arrayOf(Manifest.permission.RECORD_AUDIO),
                    1001
                )
                
                // 立即检查，如果还是没权限，直接返回
                if (ActivityCompat.checkSelfPermission(
                        reactContext,
                        Manifest.permission.RECORD_AUDIO
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    sendEvent("error", "麦克风权限未授予", 0.0)
                    return@runOnUiThread
                }
            }

            try {
                val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
                if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                    sendEvent("error", "无法创建 AudioRecord", 0.0)
                    return@runOnUiThread
                }

                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    minBufferSize * 2
                )

                if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                    sendEvent("error", "AudioRecord 初始化失败", 0.0)
                    audioRecord?.release()
                    audioRecord = null
                    return@runOnUiThread
                }

                audioRecord?.startRecording()
                isRecording = true

                // 启动后台线程读取音频数据
                Thread {
                    readAudioLoop()
                }.start()

            } catch (e: SecurityException) {
                sendEvent("error", "权限不足：${e.message}", 0.0)
            } catch (e: Exception) {
                sendEvent("error", "启动失败：${e.message}", 0.0)
            }
        }
    }

    /**
     * 停止采集音频
     */
    @ReactMethod
    fun stop() {
        isRecording = false
        
        // 停止录音
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            // 忽略释放错误
        } finally {
            audioRecord = null
        }
        
        // 停止定时发送
        emitRunnable?.let { handler.removeCallbacks(it) }
        emitRunnable = null
    }

    /**
     * 循环读取音频数据并计算分贝
     */
    private fun readAudioLoop() {
        val bufferSize = 1024
        val buffer = ShortArray(bufferSize)
        var lastEmitTime = 0L
        var sampleCount = 0
        var sumSquares = 0.0

        while (isRecording) {
            try {
                val readSize = audioRecord?.read(buffer, 0, bufferSize) ?: -1

                if (readSize > 0) {
                    // 计算 RMS（均方根）振幅
                    for (i in 0 until readSize) {
                        val amplitude = abs(buffer[i].toDouble())
                        sumSquares += amplitude * amplitude
                        sampleCount++
                    }

                    // 每 100ms 计算并发送一次
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastEmitTime >= EMIT_INTERVAL_MS && sampleCount > 0) {
                        val rms = sqrt(sumSquares / sampleCount)
                        
                        // 转换为分贝值（0-16000 映射到 0-100dB）
                        val db = if (rms > 0) {
                            20 * log10(rms / 16000.0) + 100
                        } else {
                            0.0
                        }

                        // 限制在 0-100 范围
                        val clampedDb = max(0.0, min(100.0, db))

                        sendEvent("dB", "audio_level", clampedDb)

                        lastEmitTime = currentTime
                        sumSquares = 0.0
                        sampleCount = 0
                    }
                } else if (readSize == AudioRecord.ERROR_INVALID_OPERATION) {
                    // 录音已停止
                    break
                }
            } catch (e: Exception) {
                // 忽略读取错误，继续循环
            }
        }
    }

    /**
     * 向 JS 层发送事件
     */
    private fun sendEvent(eventType: String, message: String, dbValue: Double) {
        if (reactContext.hasActiveCatalystInstance()) {
            val params = Arguments.createMap()
            params.putString("type", eventType)
            params.putString("message", message)
            params.putDouble("dB", dbValue)
            
            val emitter = reactContext.getJSModule(RCTNativeAppEventEmitter::class.java)
            emitter?.emit(EVENT_NAME, params)
        }
    }

    /**
     * 模块销毁时清理资源
     */
    override fun invalidate() {
        stop()
        super.invalidate()
    }
}
