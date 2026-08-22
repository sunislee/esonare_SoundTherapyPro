package com.anonymous.soundtherapyapp

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.Equalizer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.permissions.PermissionsModule
import kotlinx.coroutines.*
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.log2
import kotlin.math.sqrt

/**
 * 专业音频处理模块
 * 
 * 功能：
 * - 8 段参数均衡器 (基于 Android Equalizer)
 * - 软件 Limiter (防爆音算法)
 * - 多音轨混合矩阵 (8 路 × 8 频段)
 * - 对数平滑插值 (50ms 过渡)
     * - THREAD_PRIORITY_AUDIO 调度
     * - AudioPlaybackCallback 仅用于播放活性/均衡器恢复（ROM 清除会话 ID，无法按会话挂载）
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

        // ── 麦克风采集（Mic Capture）常量 ──
        private const val MIC_SAMPLE_RATE = 16000 // 16kHz / Mono / PCM16
    }
    
    private val reactContext: ReactApplicationContext = reactContext
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val handler = Handler(Looper.getMainLooper())
    
    // 8 段均衡器（挂载在 session=0 全局混音；MIUI/Android 16 的播放回调会话 ID 被清零，按会话挂载不可行）
    private var equalizer: Equalizer? = null
    
    // 增益矩阵 [track][band]
    private val gainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    private val targetGainMatrix = Array(NUM_TRACKS) { FloatArray(NUM_BANDS) { 0f } }
    
    // 主增益（用于 Limiter）
    private var masterGain = 1.0f
    
    private var smoothingJob: Job? = null
    
    // AudioPlaybackCallback (Android 9+)
    private var audioPlaybackCallback: AudioManager.AudioPlaybackCallback? = null
    private var isCallbackRegistered = false

    // JS 契约固定 8 段，但设备 Equalizer 实际段数由 HAL 决定（真机实测 5 段 ±1500mB），
    // 以下字段缓存设备真实能力，刷写时做 8 段→设备段映射
    private var deviceBandCount = 0
    private var deviceBandCenterHz = floatArrayOf() // Hz
    private var deviceMinMb = -1200 // mB
    private var deviceMaxMb = 1200  // mB
    @Volatile private var dirtyGains = false
    private var isProAudioInitialized = false

    // ── 麦克风采集状态 ──
    @Volatile private var isCapturing = false
    private var captureThread: Thread? = null
    private var audioRecord: AudioRecord? = null
    @Volatile private var currentListenerId: String? = null
    
    override fun getName(): String = "AudioLevelModule"
    
    /**
     * 初始化专业音频处理器
     */
    @ReactMethod
    fun initializeProAudio() {
        // JS 侧每次 playScene 都会调用；未加守卫时回调会重复注册、500ms 扫描重复调度
        if (isProAudioInitialized) {
            Log.d(TAG, "ℹ️ 已初始化过，跳过重复初始化")
            return
        }
        isProAudioInitialized = true
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            Log.d(TAG, "✅ 线程优先级已设置为 AUDIO")
            
            // 【活性】注册 AudioPlaybackCallback（不再捕获会话 ID，策略见 ensureGlobalEqualizer() 注释）
            registerAudioPlaybackCallback()
            
            // 【关键】立即创建全局混音均衡器（session=0），无需等待会话捕获
            ensureGlobalEqualizer()
            
            // 【关键】延迟 500ms 后主动查询一次当前活动的音频会话
            coroutineScope.launch {
                delay(500)
                scanActivePlaybackConfigurations()
            }
            
            startSmoothingLoop()
            
            Log.d(TAG, "✅ 专业音频处理器初始化完成")
            Log.d(TAG, "   - 全局混音均衡器 (session=0, master EQ)")
            Log.d(TAG, "   - 设备频带探测 + 8 段→设备段对数频率映射")
            Log.d(TAG, "   - 软件 Limiter (阈值：$LIMITER_THRESHOLD)")
            Log.d(TAG, "   - 对数平滑插值 (50ms)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 初始化失败", e)
        }
    }
    
    /**
     * 【2026-08-20 根因修复】安全获取播放配置的音频会话 ID。
     *
     * 旧代码 `config.javaClass.getMethod("getAudioSessionId")` 必然抛
     * NoSuchMethodException——框架内的实际方法名是 getSessionId()（@SystemApi，
     * 不在公开 SDK 中），导致会话永远捕获失败、Equalizer 永不创建、EQ 全静默丢弃。
     *
     * 反射链按序尝试（任一成功即返回）：
     *   1. public 方法 getSessionId()（AOSP API 28+，含 Android 16 真机）
     *   2. public 方法 getAudioSessionId()（兼容个别 ROM 变体）
     *   3. 私有字段 mSessionId（沿继承链，字段随 parcel 必存在，ROM 不可移除）
     *   4. 泛化扫描名称含 "essionId" 的 int 字段（兜底 ROM 改字段名）
     * 全失败时打印一次 class 的公开方法/字段清单，便于后续定位。
     */
    private fun getSessionIdSafe(config: AudioPlaybackConfiguration): Int {
        for (name in arrayOf("getSessionId", "getAudioSessionId")) {
            try {
                val value = config.javaClass.getMethod(name).invoke(config)
                if (value is Int && value > 0) return value
            } catch (_: Exception) { }
        }
        var cls: Class<*>? = config.javaClass
        while (cls != null && cls != Any::class.java) {
            try {
                for (f in cls.declaredFields) {
                    if (f.type != Int::class.javaPrimitiveType) continue
                    if (f.name == "mSessionId" || f.name.contains("essionId", ignoreCase = true)) {
                        try {
                            f.isAccessible = true
                            val value = f.get(config) as Int
                            if (value > 0) return value
                        } catch (_: Exception) { }
                    }
                }
            } catch (_: Exception) { }
            cls = cls.superclass
        }
        if (!sessionProbeLogged) {
            sessionProbeLogged = true
            try {
                Log.e(TAG, "🔎 会话ID获取失败 class=${config.javaClass.name}")
                Log.e(TAG, "🔎 public methods: ${config.javaClass.methods.map { it.name }.sorted().joinToString(", ")}")
                var walk: Class<*>? = config.javaClass
                while (walk != null && walk != Any::class.java) {
                    Log.e(TAG, "🔎 fields(${walk.simpleName}): ${walk.declaredFields.map { it.type.simpleName + ":" + it.name }.joinToString(", ")}")
                    walk = walk.superclass
                }
            } catch (_: Exception) { }
        }
        return -1
    }

    /**
     * 【2026-08-20 修复】从配置集中选出目标会话 ID：
     * 优先 MEDIA 用途（主场景音乐），当前会话仍活跃则保活不重新挂载
     *（防止交互音效等短命会话抢占 EQ 挂载点）
     */
    private fun pickTargetSession(configs: List<AudioPlaybackConfiguration>): Int {
        val candidates = configs
            .map { config ->
                try { getSessionIdSafe(config) } catch (e: Exception) { -1 }
            }
            .filter { it > 0 }
        if (candidates.isEmpty()) return -1
        if (currentSessionId in candidates) return currentSessionId
        val mediaSessions = configs
            .filter { config ->
                try { config.getAudioAttributes()?.usage == AudioAttributes.USAGE_MEDIA } catch (e: Exception) { false }
            }
            .map { config -> try { getSessionIdSafe(config) } catch (e: Exception) { -1 } }
            .filter { it > 0 }
        return mediaSessions.firstOrNull() ?: candidates.first()
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

                val target = pickTargetSession(configs)
                Log.d(TAG, "🔍 有效会话选择: $target (current=$currentSessionId)")

                if (target > 0 && target != currentSessionId) {
                    Log.d(TAG, "🎯 捕获到新的音频会话：sessionId=$target")
                    updateEqualizerSession(target)
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
                            
                            val target = pickTargetSession(configs)
                            if (target > 0 && target != currentSessionId) {
                                Log.d(TAG, "🎯 捕获到新的音频会话：sessionId=$target")
                                // 【关键】热重挂载均衡器
                                reattachEqualizer(target)
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
            
            equalizer?.release()
            equalizer = null
            currentSessionId = newSessionId
            
            // initEqualizer 内部完成：创建设备频带探测 + 立即刷写当前增益
            initEqualizer(newSessionId)
            
            Log.d(TAG, "✅ 热重挂载完成")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 热重挂载失败", e)
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
            
            // initEqualizer 内部完成：创建设备频带探测 + 立即刷写当前增益
            initEqualizer(newSessionId)
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

            Log.d(TAG, "✅ 均衡器初始化成功 sessionId=$sessionId")
            Log.d(TAG, "频段数量：${equalizer?.numberOfBands}")

            // 设备频带能力探测：段数/中心频率/增益范围（与 JS 8 段契约的映射依据）
            probeDeviceBands()

            // 重挂载时把 JS 侧已写入的目标增益直接同步到当前矩阵（免渐变），立即刷写
            for (band in 0 until NUM_BANDS) {
                gainMatrix[0][band] = targetGainMatrix[0][band]
            }
            dirtyGains = true
            flushGainsToDevice()
        } catch (e: Exception) {
            // 常见失败原因：缺 MODIFY_AUDIO_SETTINGS 权限 / 会话已失效 / 无 EQ 硬件
            Log.e(TAG, "❌ 均衡器初始化失败", e)
            deviceBandCount = 0
        }
    }

    /**
     * 读取设备 Equalizer 真实能力（段数/中心频率/增益范围）。
     * 段数由 HAL 决定（如 NXP 5 段），JS 8 段契约的映射依赖这里的数据
     */
    private fun probeDeviceBands() {
        val eq = equalizer ?: return
        val n = try { eq.numberOfBands.toInt() } catch (e: Exception) { 0 }
        if (n <= 0) {
            Log.w(TAG, "⚠️ 设备均衡器段数为 0，EQ 不可用")
            return
        }
        var centers = FloatArray(n)
        var minMb = -1200
        var maxMb = 1200
        try {
            for (i in 0 until n) {
                centers[i] = eq.getCenterFreq(i.toShort()) / 1000f // mHz → Hz
            }
            val range = eq.getBandLevelRange()
            if (range != null && range.size == 2) {
                minMb = range[0].toInt()
                maxMb = range[1].toInt()
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ 读取设备频带能力失败，按 ±1200mB 兜底", e)
        }
        deviceBandCount = n
        deviceBandCenterHz = centers
        deviceMinMb = minMb
        deviceMaxMb = maxMb
        Log.w(TAG, "📡 设备 EQ 能力: bands=$n centers(Hz)=${centers.toList()} range=[$minMb, +$maxMb]mB")
        if (n != NUM_BANDS) {
            Log.w(TAG, "📡 注意：设备段数($n) ≠ JS 契约段数($NUM_BANDS)，刷写时将做对数频率插值映射")
        }
    }

    /**
     * 把 track 0 的 8 段增益矩阵刷写到设备均衡器。
     *
     * 映射规则（deviceBandCount 可能为 5/8/11...）：
     *  - 段数 == 8：按下标 1:1（与原行为一致）
     *  - 段数 < 8：对数频率线性插值——在 JS 频段中心频率构成的曲线上，
     *    按每个设备段中心频率采样（相邻 JS 段按 log2 频率距离加权）
     *  - 段数 > 8：最低/最高 JS 段外推至首/尾设备段，中间设备段平响
     * 结果统一换算 mB 并钳制到设备增益范围
     */
    private fun flushGainsToDevice() {
        val eq = equalizer ?: return
        val n = deviceBandCount
        if (n == 0) return
        val row = gainMatrix[0]
        val centers = deviceBandCenterHz
        for (d in 0 until n) {
            val mb: Int = when {
                n == NUM_BANDS -> (row[d] * MAX_GAIN_DB * 100).toInt()
                n < NUM_BANDS -> {
                    val devLog2 = if (centers[d] > 0f) log2(centers[d].toDouble()) else 0.0
                    var num = 0.0
                    var den = 0.0
                    for (j in 0 until NUM_BANDS) {
                        val g = row[j]
                        if (g == 0f) continue
                        // 高斯核加权（sigma≈0.52 倍频程），跨段能量按频率距离衰减
                        val dist = log2(BAND_FREQUENCIES[j].toDouble()) - devLog2
                        val w = exp(-(dist * dist) / 0.55)
                        num += w * g
                        den += w
                    }
                    if (den <= 0.0) 0 else (num / den * MAX_GAIN_DB * 100).toInt()
                }
                else -> when (d) {
                    0 -> (row[0] * MAX_GAIN_DB * 100).toInt()
                    n - 1 -> (row[NUM_BANDS - 1] * MAX_GAIN_DB * 100).toInt()
                    else -> 0
                }
            }
            val clamped = mb.coerceIn(deviceMinMb, deviceMaxMb)
            try {
                eq.setBandLevel(d.toShort(), clamped.toShort())
                Log.d("EQ_FINAL", "Actually set device band $d (f=${"%.0f".format(centers[d])}Hz) to $clamped mB")
            } catch (e: Exception) {
                Log.e(TAG, "❌ 刷写设备段 $d 失败", e)
            }
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

        Log.d("EQ_TRACE", "Setting gain $gain for band $bandIndex (track=$trackIndex)")

        targetGainMatrix[trackIndex][bandIndex] = gain.toFloat().coerceIn(-1f, 1f)
        applyGain(trackIndex, bandIndex, targetGainMatrix[trackIndex][bandIndex])
        // 用户手动操作（预设芯片/推子）要求即时听感，不等 10ms 平滑 tick
        if (trackIndex == 0) flushGainsToDevice()
    }
    
    /**
     * 更新增益矩阵并标记脏；实际设备写入由 flushGainsToDevice() 统一完成
     *（单次 setBandLevel 需整行 8 段→设备段映射，逐段直接写会越界且重复刷写）
     */
    private fun applyGain(trackIndex: Int, bandIndex: Int, gain: Float) {
        gainMatrix[trackIndex][bandIndex] = gain.coerceIn(-1f, 1f)
        dirtyGains = true
        if (abs(gain) > 0.8) {
            Log.d(TAG, "🎚️ 音轨$trackIndex 频段$bandIndex: ${gain * MAX_GAIN_DB}dB")
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

                // 本 tick 插值完成后一次性刷写设备（含会话捕获后首次应用缓存增益的路径）
                if (dirtyGains) {
                    dirtyGains = false
                    flushGainsToDevice()
                }
            }
        }
    }
    
    // ============================================================
    // 麦克风采集（Mic Capture）
    //
    // JS 契约（src/modules/AudioLevel.ts）：
    //   startListening(intervalMs)  启动采集
    //   stopListening()             停止采集并释放 AudioRecord
    //   setAmplitudeListener(id)    记录 JS 监听器 ID
    //   checkAndRequestPermission() Promise：resolve "granted" / "denied" / "never_ask_again"
    // 事件：DeviceEventEmitter 'onAmplitudeChanged' → { amplitude: 0~1, dB: -90~0 }
    //
    // 音频焦点策略：不请求焦点。焦点是播放侧概念，采集路径不产生输出，
    // 请求 GAIN_TRANSIENT 反而可能让系统 duck TrackPlayer 音量，违背"不打断播放"。
    // ============================================================

    /**
     * 启动麦克风采集（后台线程读 PCM → RMS → dB → JS 事件）
     */
    @ReactMethod
    fun startListening(intervalMs: Int) {
        val interval = intervalMs.coerceIn(10, 1000)

        if (isCapturing) {
            Log.w(TAG, "⚠️ 采集已在运行，忽略重复 startListening")
            return
        }

        // 防御性权限复查（JS 侧应先调用 checkAndRequestPermission）
        if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "❌ startListening: RECORD_AUDIO 权限未授予，拒绝启动采集")
            return
        }

        val minBuffer = AudioRecord.getMinBufferSize(MIC_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) {
            Log.e(TAG, "❌ startListening: 设备不支持 16kHz/Mono/PCM16 (minBuffer=$minBuffer)")
            return
        }

        val record = try {
            // VOICE_RECOGNITION：绕过 OEM AGC/降噪处理，采集真实输入电平
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, MIC_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuffer * 2)
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ startListening: AudioRecord 创建被安全策略拒绝", e)
            return
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "❌ startListening: AudioRecord 初始化失败 (state=${record.state})")
            record.release()
            return
        }

        try {
            record.startRecording()
        } catch (e: IllegalStateException) {
            Log.e(TAG, "❌ startRecording 失败", e)
            record.release()
            return
        }

        isCapturing = true
        audioRecord = record

        val samplesPerRead = MIC_SAMPLE_RATE * interval / 1000
        val buffer = ShortArray(samplesPerRead)

        val thread = Thread({
            Log.d(TAG, "🎙️ 采集线程启动 (interval=${interval}ms, samples/read=${buffer.size})")

            while (isCapturing) {
                val read = try {
                    record.read(buffer, 0, buffer.size)
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ 采集读取异常，退出采集线程", e)
                    break
                }

                if (read <= 0) {
                    // read 返回 0/-1（未就绪或已 stop）：短暂休眠避免忙轮询
                    try { Thread.sleep(5) } catch (_: InterruptedException) { break }
                    continue
                }

                // RMS → dB（dBFS：20*log10(rms/32768)，范围 -96~0，钳制到 -90~0 与 JS UI 契约一致）
                var sumSq = 0.0
                for (i in 0 until read) {
                    val s = buffer[i].toDouble()
                    sumSq += s * s
                }
                val rms = sqrt(sumSq / read)
                val amplitude = (rms / 32768.0).coerceIn(0.0, 1.0)
                val db = if (rms <= 0.0001) -90.0 else (20.0 * log10(rms / 32768.0)).coerceIn(-90.0, 0.0)

                try {
                    // emitDeviceEvent：ReactContext 官方 API，内置 hasActiveReactInstance 检查，线程安全
                    reactContext.emitDeviceEvent("onAmplitudeChanged", Arguments.createMap().apply {
                        putDouble("amplitude", amplitude)
                        putDouble("dB", db)
                    })
                } catch (e: Exception) {
                    // JS 侧已卸载/断桥：停止采集，防止无主线程
                    Log.w(TAG, "⚠️ 发送振幅事件失败（JS 可能已卸载），停止采集", e)
                    isCapturing = false
                    break
                }
            }
            Log.d(TAG, "🎙️ 采集线程结束")
        }, "AudioLevel-MicCapture")

        captureThread = thread
        thread.start()
        Log.d(TAG, "✅ 麦克风采集已启动 (listener=${currentListenerId ?: "none"})")
    }

    /**
     * 停止麦克风采集并释放 AudioRecord（幂等）
     */
    @ReactMethod
    fun stopListening() {
        if (!isCapturing && captureThread == null) {
            Log.d(TAG, "ℹ️ stopListening: 未在采集中，忽略")
            return
        }

        isCapturing = false
        val thread = captureThread
        val record = audioRecord
        captureThread = null
        audioRecord = null

        try { record?.stop() } catch (_: IllegalStateException) { /* 未 start 过则忽略 */ }
        try { thread?.join(500) } catch (_: InterruptedException) { /* 忽略 */ }
        try { record?.release() } catch (e: Exception) {
            Log.w(TAG, "⚠️ 释放 AudioRecord 失败", e)
        }
        Log.d(TAG, "✅ 麦克风采集已停止，资源已释放")
    }

    /**
     * 记录 JS 侧监听器 ID（实际事件走 DeviceEventEmitter 通道，此处仅存 ID 便于调试/多监听器扩展）
     */
    @ReactMethod
    fun setAmplitudeListener(listenerId: String) {
        currentListenerId = listenerId
        Log.d(TAG, "📌 振幅监听器已注册: $listenerId")
    }

    /**
     * 运行时权限检查 + 请求（RECORD_AUDIO）
     * 委托内置 PermissionsAndroid（PermissionsModule）：系统弹窗与结果路由由 RN 框架负责（0.81.5 的
     * BaseJavaModule 没有 onRequestPermissionsResult 钩子，自建路由不可行）。
     * 契约：resolve 结果为 "granted" / "denied" / "never_ask_again"，JS 侧以 === "granted" 判定授权
     */
    @ReactMethod
    fun checkAndRequestPermission(promise: Promise) {
        val permissionsModule = reactContext.getNativeModule(PermissionsModule::class.java)
        if (permissionsModule == null) {
            Log.e(TAG, "❌ PermissionsAndroid 模块不可用")
            promise.reject("NO_PERMISSIONS_MODULE", "PermissionsAndroid 模块不可用")
            return
        }
        Log.d(TAG, "⏳ 委托 PermissionsAndroid 请求 RECORD_AUDIO 权限")
        permissionsModule.requestPermission(Manifest.permission.RECORD_AUDIO, promise)
    }

    /**
     * 【生命周期】模块销毁时清理资源
     */
    override fun invalidate() {
        super.invalidate()

        Log.d(TAG, "🧹 模块销毁，清理资源")

        // 停止麦克风采集（释放 AudioRecord + 采集线程）
        stopListening()

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
            
            // 强制创建均衡器（优先级 1000，sessionId=0；会话0需 MODIFY_AUDIO_SETTINGS 权限）
            equalizer?.release()
            equalizer = Equalizer(1000, 0)
            equalizer?.enabled = true
            currentSessionId = 0
            probeDeviceBands()

            Log.d(TAG, "   - 已创建均衡器 (priority=1000, sessionId=0)")

            // 暴力设置：60Hz/150Hz 拉满 +12dB，其余全 -12dB（按设备真实段数限定范围）
            val maxGain = (MAX_GAIN_DB * 100).toInt()
            val minGain = (-MAX_GAIN_DB * 100).toInt()
            val bandLimit = if (deviceBandCount in 1 until NUM_BANDS) deviceBandCount else NUM_BANDS

            for (band in 0 until bandLimit) {
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
