package com.anonymous.soundtherapyapp

import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.audiofx.Equalizer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import kotlin.math.abs
import kotlin.math.ln

/**
 * 专业音频处理模块
 * 
 * 功能：
 * - 8 段参数均衡器 (基于 Android Equalizer)
 * - 软件 Limiter (防爆音算法)
 * - 多音轨混合矩阵 (8 路 × 8 频段)
 * - 对数平滑插值 (50ms 过渡)
 * - THREAD_PRIORITY_AUDIO 调度
 * - 【关键】AudioPlaybackCallback 动态捕获真实 sessionId
 */
class AudioLevelModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "AudioLevelModule-Pro"
        private const val NUM_BANDS = 8
        private const val NUM_TRACKS = 8
        
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
        
        private const val MAX_GAIN_DB = 12.0f
        private const val LIMITER_THRESHOLD = 0.95f // 软件限幅器阈值
    }
    
    private val reactContext: ReactApplicationContext = reactContext
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val handler = Handler(Looper.getMainLooper())
    
    // 8 段均衡器
    private var equalizer: Equalizer? = null
    private var currentSessionId: Int = -1
    
    // 增益矩阵 [track][band]
    private val gainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    private val targetGainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    
    // 主增益（用于 Limiter）
    private var masterGain = 1.0f
    
    private var smoothingJob: Job? = null
    
    // AudioPlaybackCallback (Android 9+)
    private var audioPlaybackCallback: AudioManager.AudioPlaybackCallback? = null
    private var isCallbackRegistered = false
    
    override fun getName(): String = "AudioLevelModule"
    
    /**
     * 初始化专业音频处理器
     */
    @ReactMethod
    fun initializeProAudio() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            Log.d(TAG, "✅ 线程优先级已设置为 AUDIO")
            
            // 【关键】注册 AudioPlaybackCallback 动态捕获真实 sessionId
            registerAudioPlaybackCallback()
            
            // 【关键】延迟 500ms 后主动查询一次当前活动的音频会话
            coroutineScope.launch {
                delay(500)
                scanActivePlaybackConfigurations()
            }
            
            startSmoothingLoop()
            
            Log.d(TAG, "✅ 专业音频处理器初始化完成")
            Log.d(TAG, "   - 等待 AudioPlaybackCallback 捕获真实 sessionId")
            Log.d(TAG, "   - 8 段参数均衡器")
            Log.d(TAG, "   - 软件 Limiter (阈值：$LIMITER_THRESHOLD)")
            Log.d(TAG, "   - 对数平滑插值 (50ms)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 初始化失败", e)
        }
    }
    
    /**
     * 【关键】主动扫描当前活动的音频会话
     */
    private fun scanActivePlaybackConfigurations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val audioManager = reactContext.getSystemService(AudioManager::class.java)
                val configs = audioManager?.getActivePlaybackConfigurations()
                
                if (configs.isNullOrEmpty()) {
                    Log.d(TAG, "⚠️ 没有活动的音频播放配置")
                    return
                }
                
                Log.d(TAG, "🔍 扫描到 ${configs.size} 个活动播放")
                
                for (config in configs) {
                    try {
                        val method = config.javaClass.getMethod("getAudioSessionId")
                        val sessionId = method.invoke(config) as Int
                        
                        Log.d(TAG, "   - SessionId: $sessionId")
                        
                        if (sessionId != 0 && sessionId != currentSessionId) {
                            Log.d(TAG, "🎯 捕获到新的音频会话：sessionId=$sessionId")
                            updateEqualizerSession(sessionId)
                            return // 找到第一个非 0 的 sessionId 就返回
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ 获取 SessionId 失败", e)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ 主动扫描失败", e)
            }
        } else {
            Log.w(TAG, "⚠️ getActivePlaybackConfigurations 需要 Android 10+")
        }
    }
    
    /**
     * 【关键】注册 AudioPlaybackCallback 监听音频活动 (Android 9+)
     */
    private fun registerAudioPlaybackCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                val audioManager = reactContext.getSystemService(AudioManager::class.java)
                
                audioPlaybackCallback = object : AudioManager.AudioPlaybackCallback() {
                    override fun onPlaybackConfigChanged(configs: List<AudioPlaybackConfiguration>) {
                        try {
                            Log.d(TAG, "🎵 onPlaybackConfigChanged: ${configs.size} 个活动播放")
                            
                            if (configs.isEmpty()) {
                                Log.d(TAG, "   - 没有活动播放，跳过")
                                return
                            }
                            
                            for (config in configs) {
                                try {
                                    // 使用反射获取 audioSessionId
                                    val method = config.javaClass.getMethod("getAudioSessionId")
                                    val sessionId = method.invoke(config) as Int
                                    
                                    Log.d(TAG, "   - SessionId: $sessionId")
                                    
                                    // 【关键】捕获非 0 的有效 sessionId
                                    if (sessionId != 0 && sessionId != currentSessionId) {
                                        Log.d(TAG, "🎯 捕获到新的音频会话：sessionId=$sessionId")
                                        
                                        // 【关键】热重挂载均衡器
                                        reattachEqualizer(sessionId)
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "❌ 获取 SessionId 失败", e)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ onPlaybackConfigChanged 处理失败", e)
                        }
                    }
                }
                
                audioManager?.registerAudioPlaybackCallback(audioPlaybackCallback!!, handler)
                isCallbackRegistered = true
                Log.d(TAG, "✅ AudioPlaybackCallback 注册成功")
            } catch (e: Exception) {
                Log.e(TAG, "❌ 注册 AudioPlaybackCallback 失败", e)
            }
        } else {
            Log.w(TAG, "⚠️ AudioPlaybackCallback 需要 Android 9+，当前版本不支持")
        }
    }
    
    /**
     * 【关键】热重挂载均衡器到新的 sessionId
     */
    private fun reattachEqualizer(newSessionId: Int) {
        try {
            Log.d(TAG, "🔥 开始热重挂载均衡器：$currentSessionId -> $newSessionId")
            
            // 1. 释放旧实例
            equalizer?.release()
            equalizer = null
            Log.d(TAG, "   - 已释放旧均衡器")
            
            // 2. 更新 sessionId
            currentSessionId = newSessionId
            
            // 3. 创建新均衡器
            equalizer = Equalizer(0, newSessionId)
            equalizer?.enabled = true
            Log.d(TAG, "   - 已创建新均衡器 (sessionId=$newSessionId)")
            
            // 4. 立即重新应用所有增益
            applyAllCurrentGains()
            
            // 【关键】日志验证
            Log.d(TAG, "🎯 EQ Reattached to Real ID: $newSessionId")
            
            Log.d(TAG, "✅ 热重挂载完成")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 热重挂载失败", e)
        }
    }
    
    /**
     * 【关键】立即应用所有当前增益
     */
    private fun applyAllCurrentGains() {
        coroutineScope.launch {
            delay(50) // 等待均衡器完全就绪
            
            Log.d(TAG, "🔄 开始重新应用 ${NUM_BANDS * NUM_TRACKS} 个增益设置")
            
            var appliedCount = 0
            for (track in 0 until NUM_TRACKS) {
                for (band in 0 until NUM_BANDS) {
                    val gain = targetGainMatrix[track][band]
                    if (gain != 0f) {
                        try {
                            val eq = equalizer
                            if (eq != null) {
                                val mbValue = (gain * MAX_GAIN_DB * 100).toInt()
                                eq.setBandLevel(band.toShort(), mbValue.toShort())
                                
                                Log.d("EQ_FINAL", "Actually set band $band to $mbValue mB (track=$track, gain=$gain)")
                                appliedCount++
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ 应用增益失败：band=$band", e)
                        }
                    }
                }
            }
            
            Log.d(TAG, "✅ 重新应用完成：$appliedCount / ${NUM_BANDS * NUM_TRACKS} 个增益")
        }
    }
    
    /**
     * 【关键】更新均衡器的 sessionId
     */
    private fun updateEqualizerSession(newSessionId: Int) {
        try {
            // 如果 sessionId 没有变化，跳过
            if (newSessionId == currentSessionId) {
                Log.d(TAG, "ℹ️ SessionId 未变化，跳过更新：$newSessionId")
                return
            }
            
            // 释放旧的均衡器
            equalizer?.release()
            equalizer = null
            
            // 更新 sessionId
            currentSessionId = newSessionId
            Log.d(TAG, "🔄 切换到新的音频会话：$newSessionId")
            
            // 重新初始化均衡器
            initEqualizer(newSessionId)
            
            // 重新应用之前的增益设置
            coroutineScope.launch {
                delay(100) // 等待均衡器初始化完成
                for (track in 0 until NUM_TRACKS) {
                    for (band in 0 until NUM_BANDS) {
                        if (targetGainMatrix[track][band] != 0f) {
                            applyGain(track, band, targetGainMatrix[track][band])
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 更新均衡器 SessionId 失败", e)
        }
    }
    
    /**
     * 初始化均衡器
     */
    private fun initEqualizer(sessionId: Int) {
        try {
            equalizer = Equalizer(0, sessionId)
            equalizer?.enabled = true
            
            Log.d(TAG, "✅ 均衡器初始化成功")
            Log.d(TAG, "频段数量：${equalizer?.numberOfBands}")
            
            for (i in 0 until (equalizer?.numberOfBands ?: 0)) {
                val freq = equalizer?.getCenterFreq(i.toShort()) ?: 0
                Log.d(TAG, "频段 $i: ${freq / 1000}kHz")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 均衡器初始化失败", e)
        }
    }
    
    /**
     * 设置某路音轨的某个频段增益
     */
    @ReactMethod
    fun setTrackBandGain(trackIndex: Int, bandIndex: Int, gain: Double) {
        if (trackIndex !in 0 until NUM_TRACKS || bandIndex !in 0 until NUM_BANDS) {
            Log.w(TAG, "⚠️ 参数超出范围：track=$trackIndex, band=$bandIndex")
            return
        }
        
        // 【关键调试】打印接收到的增益值
        Log.d("EQ_TRACE", "Setting gain $gain for band $bandIndex (track=$trackIndex)")
        
        targetGainMatrix[trackIndex][bandIndex] = gain.toFloat().coerceIn(-1f, 1f)
        applyGain(trackIndex, bandIndex, targetGainMatrix[trackIndex][bandIndex])
    }
    
    /**
     * 应用增益到硬件（带 Limiter 保护 + 懒加载初始化）
     */
    private fun applyGain(trackIndex: Int, bandIndex: Int, gain: Float) {
        try {
            gainMatrix[trackIndex][bandIndex] = gain
            
            // 如果均衡器未初始化，只存储目标值，不阻塞
            val eq = equalizer ?: run {
                Log.w(TAG, "⚠️ 均衡器未初始化，已存储增益：band=$bandIndex, gain=$gain")
                Log.w(TAG, "   - 等待 AudioPlaybackCallback 捕获真实 sessionId 后自动应用")
                return  // 直接返回，不报错
            }
            
            // 映射增益到毫分贝 (-1200 ~ +1200 mB)
            val mbValue = (gain * MAX_GAIN_DB * 100).toInt()
            
            // 【关键调试】打印实际设置的值
            Log.d("EQ_TRACE", "Applying $mbValue mB to band $bandIndex")
            
            // 设置均衡器增益
            eq.setBandLevel(bandIndex.toShort(), mbValue.toShort())
            
            // 【关键】最终确认日志
            Log.d("EQ_FINAL", "Actually set band $bandIndex to $mbValue mB (track=$trackIndex, gain=$gain)")
            
            if (abs(gain) > 0.8) {
                Log.d(TAG, "🎚️ 音轨$trackIndex 频段$bandIndex: ${gain * MAX_GAIN_DB}dB")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 应用增益失败", e)
        }
    }
    

    
    /**
     * 批量设置多轨增益（带 Anti-Clipping + Limiter）
     */
    @ReactMethod
    fun setMultiTrackGains(promise: Promise) {
        coroutineScope.launch {
            try {
                var totalEnergy = 0.0
                
                for (track in 0 until NUM_TRACKS) {
                    for (band in 0 until NUM_BANDS) {
                        totalEnergy += abs(targetGainMatrix[track][band])
                    }
                }
                
                // Anti-Clipping 归一化（70% 阈值）
                val maxEnergy = NUM_TRACKS * NUM_BANDS * 0.7
                val isClipping = totalEnergy > maxEnergy
                
                var normalizedGain = if (isClipping) {
                    (maxEnergy / totalEnergy).toFloat()
                } else {
                    1.0f
                }
                
                // Limiter 保护：进一步限制总增益
                if (normalizedGain > LIMITER_THRESHOLD) {
                    normalizedGain = LIMITER_THRESHOLD
                }
                
                masterGain = normalizedGain
                
                // 应用归一化增益
                for (track in 0 until NUM_TRACKS) {
                    for (band in 0 until NUM_BANDS) {
                        val originalGain = targetGainMatrix[track][band]
                        applyGain(track, band, originalGain * normalizedGain)
                    }
                }
                
                val result = Arguments.createMap().apply {
                    putDouble("masterGain", normalizedGain.toDouble())
                    putDouble("totalEnergy", totalEnergy)
                    putBoolean("isClipping", isClipping)
                }
                
                promise.resolve(result)
                
                if (isClipping) {
                    Log.d(TAG, "⚠️ Anti-Clipping: MasterGain=$normalizedGain, Energy=$totalEnergy")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ 设置多轨增益失败", e)
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * 平滑插值循环（消除"咔哒"声）
     */
    private fun startSmoothingLoop() {
        smoothingJob?.cancel()
        
        smoothingJob = coroutineScope.launch {
            while (isActive) {
                delay(10)
                
                for (track in 0 until NUM_TRACKS) {
                    for (band in 0 until NUM_BANDS) {
                        val currentGain = gainMatrix[track][band]
                        val targetGain = targetGainMatrix[track][band]
                        
                        if (abs(currentGain - targetGain) < 0.01) continue
                        
                        val smoothedGain = logarithmicInterpolate(currentGain, targetGain, 0.2f)
                        applyGain(track, band, smoothedGain)
                    }
                }
            }
        }
    }
    
    /**
     * 【生命周期】模块销毁时清理资源
     */
    override fun invalidate() {
        super.invalidate()
        
        Log.d(TAG, "🧹 模块销毁，清理资源")
        
        // 取消平滑任务
        smoothingJob?.cancel()
        
        // 释放均衡器
        equalizer?.release()
        equalizer = null
        
        // 注销 AudioPlaybackCallback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && isCallbackRegistered) {
            try {
                val audioManager = reactContext.getSystemService(AudioManager::class.java)
                audioManager?.unregisterAudioPlaybackCallback(audioPlaybackCallback!!)
                isCallbackRegistered = false
                Log.d(TAG, "✅ AudioPlaybackCallback 已注销")
            } catch (e: Exception) {
                Log.e(TAG, "❌ 注销 AudioPlaybackCallback 失败", e)
            }
        }
    }
    
    /**
     * 对数插值（模拟人耳感知）
     */
    private fun logarithmicInterpolate(current: Float, target: Float, factor: Float): Float {
        val sign = if (target > current) 1f else -1f
        val diff = abs(target - current)
        val logDiff = ln(1f + diff * 9f) / ln(10f)
        val step = logDiff * factor * sign
        return (current + step).coerceIn(-1f, 1f)
    }
    
    @ReactMethod
    fun setMasterVolume(volume: Double, promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(android.media.AudioManager::class.java)
            val maxVolume = audioManager?.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC) ?: 15
            val targetVolume = (volume * maxVolume).toInt().coerceIn(0, maxVolume)
            
            audioManager?.setStreamVolume(
                android.media.AudioManager.STREAM_MUSIC,
                targetVolume,
                0
            )
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    /**
     * 【暴力实验】强行设置极端 EQ 预设
     */
    @ReactMethod
    fun runExtremeTest() {
        try {
            Log.d(TAG, "💀 【暴力测试】开始执行定生死实验...")
            
            // 强制创建均衡器（优先级 1000，sessionId=0）
            equalizer?.release()
            equalizer = Equalizer(1000, 0)
            equalizer?.enabled = true
            currentSessionId = 0
            
            Log.d(TAG, "   - 已创建均衡器 (priority=1000, sessionId=0)")
            
            // 暴力设置：60Hz/150Hz 拉满 +12dB，其余全 -12dB
            val maxGain = (MAX_GAIN_DB * 100).toInt()
            val minGain = (-MAX_GAIN_DB * 100).toInt()
            
            for (band in 0 until NUM_BANDS) {
                val gain = if (band == 0 || band == 1) {
                    maxGain  // 60Hz, 150Hz: +12dB
                } else {
                    minGain  // 其余：-12dB
                }
                
                equalizer?.setBandLevel(band.toShort(), gain.toShort())
                Log.d("EQ_DEATH_TEST", "Band $band (${BAND_FREQUENCIES[band]}Hz) = ${gain}mB")
            }
            
            Log.d("EQ_DEATH_TEST", "Extreme settings applied!")
            Log.d(TAG, "✅ 【暴力测试】执行完成！")
            Log.d(TAG, "   - 如果听不到变化，说明 sessionId=0 无法控制音频流")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 【暴力测试】失败", e)
        }
    }
}
