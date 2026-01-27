package com.soundtherapyapp

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem
import com.google.android.exoplayer2.Player
import com.google.android.exoplayer2.source.ProgressiveMediaSource
import com.google.android.exoplayer2.upstream.DefaultDataSource
import com.google.android.exoplayer2.PlaybackException

import java.util.concurrent.CopyOnWriteArrayList

class NativeAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        try {
            System.loadLibrary("native-audio-lib")
        } catch (e: UnsatisfiedLinkError) {
            Log.e("NativeAudioModule", "Failed to load native-audio-lib", e)
        }
    }

    // Native methods
    private external fun nativeInitialize(sampleRate: Int, bufferSize: Int): Boolean
    private external fun nativeCleanup()
    private external fun nativeLoadAudioFile(filePath: String, trackId: Int): Boolean
    private external fun nativeStartMixing(): Boolean
    private external fun nativeStopMixing()
    private external fun nativeSetVolume(trackId: Int, volumeDb: Float)
    private external fun nativeSetMasterVolume(volumeDb: Float)

    @ReactMethod
    fun initialize(sampleRate: Int, bufferSize: Int, promise: Promise) {
        Log.d("NativeAudioModule", "Calling nativeInitialize with $sampleRate, $bufferSize")
        try {
            val success = nativeInitialize(sampleRate, bufferSize)
            Log.d("NativeAudioModule", "nativeInitialize result: $success")
            promise.resolve(success)
        } catch (e: Exception) {
            Log.e("NativeAudioModule", "Error in nativeInitialize", e)
            promise.reject("INIT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun loadAudioFile(filePath: String, trackId: Int, promise: Promise) {
        try {
            val success = nativeLoadAudioFile(filePath, trackId)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startMixing(promise: Promise) {
        try {
            val success = nativeStartMixing()
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("START_MIX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopMixing(promise: Promise) {
        try {
            nativeStopMixing()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_MIX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setVolume(trackId: Int, volumeDb: Float, promise: Promise) {
        try {
            nativeSetVolume(trackId, volumeDb)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_VOL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setMasterVolume(volumeDb: Float, promise: Promise) {
        try {
            nativeSetMasterVolume(volumeDb)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_MASTER_VOL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun checkFileAccess(filePath: String, promise: Promise) {
        try {
            val file = java.io.File(filePath)
            val exists = file.exists()
            val canRead = file.canRead()
            Log.d("NativeAudioModule", "Checking access for $filePath: exists=$exists, canRead=$canRead")
            promise.resolve(exists && canRead)
        } catch (e: Exception) {
            Log.e("NativeAudioModule", "Error checking file access", e)
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun toggleAudio(play: Boolean, promise: Promise) {
        try {
            if (play) {
                nativeStartMixing()
            } else {
                nativeStopMixing()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("TOGGLE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setFrequency(frequency: Float, promise: Promise) {
        // Frequency control for ambient sound
        try {
            // Mapping frequency to some internal parameter if needed
            // For now, just logging
            Log.d("NativeAudioModule", "Setting frequency: $frequency")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FREQ_ERROR", e.message)
        }
    }

    // Global Player Tracking
    private val allPlayers = CopyOnWriteArrayList<ExoPlayer>()

    // Double Instance Isolation
    private var activePlayer: ExoPlayer? = null
    private var fadeOutPlayer: ExoPlayer? = null
    
    private var currentFadeAnimator: ValueAnimator? = null
    private var currentVolume = 1.0f
    private var currentSceneId = ""
    private val context = reactContext

    // Unique State Lock
    private enum class AudioState {
        IDLE, PLAYING, PAUSED, FADING
    }
    private var currentState = AudioState.IDLE

    override fun getName(): String {
        return "NativeAudioModule"
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (context.hasActiveCatalystInstance()) {
            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun play(url: String, volume: Float, sceneId: String, promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                Log.d("FAKE_CODER", "Native is playing ID: $sceneId, Volume: $volume, URL: $url")
                
                // Cancel any ongoing fade
                if (currentFadeAnimator != null) {
                    currentFadeAnimator?.cancel()
                    currentFadeAnimator = null
                }

                // If there's a leftover fadeOutPlayer, kill it
                fadeOutPlayer?.let {
                    it.stop()
                    it.release()
                    allPlayers.remove(it)
                }
                fadeOutPlayer = null

                // For "play" (immediate), reuse or create
                if (activePlayer == null) {
                    activePlayer = createPlayer()
                }

                activePlayer?.let { player ->
                    try {
                        loadSource(player, url)
                        player.volume = volume
                        Log.d("NativeAudioModule", "Preparing $sceneId")
                        player.prepare()
                        player.play()
                        Log.d("NativeAudioModule", "Started playback for $sceneId")
                    } catch (loadError: Exception) {
                        Log.e("NativeAudioModule", "Error loading or preparing $sceneId: ${loadError.message}", loadError)
                        promise.reject("LOAD_ERROR", loadError.message)
                        return@post
                    }
                }
                
                currentVolume = volume
                currentSceneId = sceneId
                currentState = AudioState.PLAYING
                
                val params = Arguments.createMap()
                params.putString("id", sceneId)
                params.putString("state", "playing")
                sendEvent("onAudioStateChange", params)

                promise.resolve(null)
            } catch (e: Exception) {
                Log.e("NativeAudioModule", "Play method crash: ${e.message}", e)
                promise.reject("PLAY_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun crossFade(url: String, duration: Int, targetVolume: Float, sceneId: String, promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                // RACE CONDITION CHECK:
                // If the user pressed PAUSE just before this Runnable executed, 
                // currentState will be PAUSED. In this case, we should NOT start playback.
                if (currentState == AudioState.PAUSED) {
                    Log.d("NativeAudioModule", "CrossFade aborted because state is PAUSED.")
                    // Resolve purely to avoid JS errors, but do nothing.
                    promise.resolve(null) 
                    return@post
                }
            
                Log.d("NativeAudioModule", "Request CrossFade: New=$sceneId (TargetVol=$targetVolume), Old=$currentSceneId")
                Log.d("FAKE_CODER", "Native is playing ID: $sceneId (via CrossFade), Volume: $targetVolume")

                // 1. Force cancel previous gradient task
                if (currentFadeAnimator != null && currentFadeAnimator!!.isRunning) {
                    Log.d("NativeAudioModule", "Cancelling previous animator")
                    currentFadeAnimator!!.cancel()
                }
                currentFadeAnimator = null

                // 2. Strong Switch Step 1: Release fadingPlayer immediately
                if (fadeOutPlayer != null) {
                    Log.d("NativeAudioModule", "Releasing interrupted fadeOutPlayer")
                    fadeOutPlayer!!.stop()
                    fadeOutPlayer!!.release()
                    allPlayers.remove(fadeOutPlayer)
                    fadeOutPlayer = null
                }

                // 3. Strong Switch Step 2: Assign active to fading
                if (activePlayer != null) {
                    fadeOutPlayer = activePlayer
                    // Note: We don't release activePlayer reference yet, just moved it to fadeOutPlayer
                    activePlayer = null 
                }

                // 4. Strong Switch Step 3: Create NEW player for the new scene
                val newPlayer = createPlayer()
                activePlayer = newPlayer

                // 使用传入的 targetVolume 或当前全局音量
                val finalTargetVolume = if (targetVolume > 0) targetVolume else currentVolume

                // Setup new player
                newPlayer.volume = 0f // Start at 0 for fade in
                loadSource(newPlayer, url)
                newPlayer.prepare()
                newPlayer.play()
                
                val startFadeOutVolume = fadeOutPlayer?.volume ?: 0f
                Log.d("NativeAudioModule", "Starting cross-fade. OutFrom=$startFadeOutVolume, InTo=$finalTargetVolume")

                currentState = AudioState.FADING

                // 5. Start Animation (ValueAnimator)
                currentFadeAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
                    this.duration = duration.toLong()
                    addUpdateListener { animator ->
                        // Crucial: Check if we are PAUSED. If so, do not update volumes.
                        if (currentState == AudioState.PAUSED) {
                            animator.cancel()
                            return@addUpdateListener
                        }

                        val progress = animator.animatedValue as Float
                        
                        // Fade In: 0 -> finalTargetVolume
                        newPlayer.volume = progress * finalTargetVolume
                        
                        // Fade Out: startFadeOutVolume -> 0
                        fadeOutPlayer?.let {
                            it.volume = (1f - progress) * startFadeOutVolume
                        }
                    }
                    addListener(object : AnimatorListenerAdapter() {
                        override fun onAnimationEnd(animation: Animator) {
                            // Only release if we finished naturally (not cancelled by pause)
                            // But wait, if we cancel, onAnimationEnd is called.
                            // We need to check if we are in FADING state or if volume is near 0?
                            // Actually, if we cancel due to PAUSE, we shouldn't release.
                            
                            // Simplest check: Is fadingPlayer volume low?
                            // Or better: check currentState.
                            
                            // If we cancelled due to PAUSE, currentState is PAUSED.
                            if (currentState == AudioState.PAUSED) {
                                Log.d("NativeAudioModule", "Cross-fade interrupted by PAUSE. Preserving players.")
                                return
                            }
                            
                            // If we cancelled due to another CrossFade, currentState might be FADING (new one) or PLAYING?
                            // But usually onAnimationEnd runs synchronously on cancel.
                            
                            Log.d("NativeAudioModule", "Cross-fade animation ended.")
                            
                            // Clean up fadeOutPlayer if volume is effectively 0
                            fadeOutPlayer?.let {
                                if (it.volume < 0.05f) {
                                    Log.d("NativeAudioModule", "Releasing Old=$currentSceneId")
                                    it.stop()
                                    it.release()
                                    allPlayers.remove(it)
                                    fadeOutPlayer = null
                                }
                            }
                            
                            if (currentState == AudioState.FADING) {
                                currentState = AudioState.PLAYING
                            }
                            currentFadeAnimator = null
                        }
                    })
                    start()
                }

                // Update current state
                currentVolume = targetVolume
                currentSceneId = sceneId
                
                // Immediate feedback to UI
                val params = Arguments.createMap()
                params.putString("id", sceneId)
                params.putString("state", "playing")
                sendEvent("onAudioStateChange", params)

                promise.resolve(null)
            } catch (e: Exception) {
                Log.e("NativeAudioModule", "CrossFade Error: ${e.message}")
                promise.reject("CROSSFADE_ERROR", e.message)
            }
        }
    }

    private fun createPlayer(): ExoPlayer {
        val player = ExoPlayer.Builder(context).build()
        
        // 关键修复：设置音频流类型，确保听命于媒体音量控制
        val audioAttributes = com.google.android.exoplayer2.audio.AudioAttributes.Builder()
            .setUsage(com.google.android.exoplayer2.C.USAGE_MEDIA)
            .setContentType(com.google.android.exoplayer2.C.CONTENT_TYPE_MUSIC)
            .build()
        player.setAudioAttributes(audioAttributes, true)

        allPlayers.add(player)
        player.repeatMode = Player.REPEAT_MODE_ONE
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Log.e("NativeAudioModule", "ExoPlayer Error: ${error.message}")
                val params = Arguments.createMap()
                params.putString("error", error.message)
                sendEvent("onAudioError", params)
            }
            
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Only send events for the active player
                if (player == activePlayer) {
                    val params = Arguments.createMap()
                    params.putString("id", currentSceneId)
                    params.putString("state", if (isPlaying) "playing" else "paused")
                    sendEvent("onAudioStateChange", params)
                }
            }
            
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (player == activePlayer) {
                    var stateStr = "unknown"
                    when(playbackState) {
                        Player.STATE_BUFFERING -> stateStr = "buffering"
                        Player.STATE_ENDED -> stateStr = "ended"
                        Player.STATE_IDLE -> stateStr = "idle"
                        Player.STATE_READY -> stateStr = if (player.isPlaying) "playing" else "paused"
                    }
                    
                    val params = Arguments.createMap()
                    params.putString("id", currentSceneId)
                    params.putString("state", stateStr)
                    sendEvent("onAudioStateChange", params)
                }
            }
        })
        return player
    }

    @ReactMethod
    fun adjustSystemVolume(volume: Float) {
        Handler(Looper.getMainLooper()).post {
            try {
                val audioManager = context.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
                val maxVolume = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
                val targetVolume = (volume * maxVolume).toInt()
                
                // 物理穿透：直接设置系统媒体音量流
                // FLAG_SHOW_UI: 显示系统音量条
                // FLAG_PLAY_SOUND: 调节时播放提示音（可选）
                audioManager.setStreamVolume(
                    android.media.AudioManager.STREAM_MUSIC, 
                    targetVolume, 
                    android.media.AudioManager.FLAG_SHOW_UI
                )
                
                Log.d("NativeAudioModule", "System Volume Adjusted: $targetVolume / $maxVolume (Input: $volume)")
            } catch (e: Exception) {
                Log.e("NativeAudioModule", "Failed to adjust system volume: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun setVolume(volume: Float) {
        Handler(Looper.getMainLooper()).post {
            currentVolume = volume
            
            // 1. 遍历所有活跃播放器设置音量
            allPlayers.forEach { it.volume = volume }
            
            // 2. 狠招：强制同步系统媒体音量（如果需要）
            try {
                val audioManager = context.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
                val maxVolume = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
                val targetVolume = (volume * maxVolume).toInt()
                // 暂时不强制改系统总音量，除非 Player 音量调节失效。如果需要强制，取消下面注释：
                // audioManager.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, targetVolume, 0)
            } catch (e: Exception) {
                Log.e("NativeAudioModule", "AudioManager sync failed: ${e.message}")
            }

            Log.d("NativeAudioModule", "Setting volume to $volume for ${allPlayers.size} players")
        }
    }

    @ReactMethod
    fun pause() {
        Handler(Looper.getMainLooper()).post {
            // 1. Clear all timers/animators immediately
            if (currentFadeAnimator != null && currentFadeAnimator!!.isRunning) {
                 Log.d("NativeAudioModule", "Pause requested. Cancelling active fade animator.")
                 currentFadeAnimator!!.cancel()
            }
            currentFadeAnimator = null

            // 2. Global Pause Principle: Pause ALL players
            Log.d("NativeAudioModule", "Pausing all ${allPlayers.size} players.")
            allPlayers.forEach { it.pause() }
            
            currentState = AudioState.PAUSED
            
            Log.d("NativeAudioModule", "Paused all players (active & fading).")

            // 3. Force Reset State to JS
            val params = Arguments.createMap()
            params.putString("id", currentSceneId)
            params.putString("state", "paused")
            sendEvent("onAudioStateChange", params)
        }
    }

    @ReactMethod
    fun resume() {
        Handler(Looper.getMainLooper()).post {
            // 4. Single Point Control: Resume what's left
            activePlayer?.play()
            
            // If fadeOutPlayer survived the cancel (unlikely if cancel triggers end), play it too.
            // But usually cancel -> onAnimationEnd -> release fadeOutPlayer.
            // So this is just a safety check.
            fadeOutPlayer?.play()
            
            currentState = AudioState.PLAYING
            
            Log.d("NativeAudioModule", "Resumed playback.")
            
            val params = Arguments.createMap()
            params.putString("id", currentSceneId)
            params.putString("state", "playing")
            sendEvent("onAudioStateChange", params)
        }
    }
    
    @ReactMethod
    fun stop() {
        Handler(Looper.getMainLooper()).post {
            try {
                currentFadeAnimator?.cancel()

                activePlayer?.stop()
                activePlayer?.release()
                activePlayer = null
                
                fadeOutPlayer?.stop()
                fadeOutPlayer?.release()
                fadeOutPlayer = null

                allPlayers.forEach { 
                    it.stop()
                    it.release()
                }
                allPlayers.clear()
                
                currentState = AudioState.IDLE
                Log.d("NativeAudioModule", "All players stopped and cleared")
                
                val params = Arguments.createMap()
                params.putString("id", currentSceneId)
                params.putString("state", "stopped")
                sendEvent("onAudioStateChange", params)
            } catch (e: Exception) {
                Log.e("NativeAudioModule", "Error stopping all players", e)
            }
        }
    }

    @ReactMethod
    fun getPlayerCount(promise: Promise) {
        promise.resolve(allPlayers.size)
    }

    @ReactMethod
    fun getCurrentState(promise: Promise) {
        val map = Arguments.createMap()
        map.putString("id", currentSceneId)
        map.putString("state", currentState.name.lowercase())
        map.putInt("playerCount", allPlayers.size)
        promise.resolve(map)
    }

    private fun loadSource(player: ExoPlayer, url: String) {
        try {
            Log.d("NativeAudioModule", "Loading source: $url")
            val uri = Uri.parse(url)
            val mediaItem = MediaItem.fromUri(uri)
            
            if (url.startsWith("android.resource")) {
                 Log.d("NativeAudioModule", "Detected android.resource URL, using ProgressiveMediaSource")
                 val dataSourceFactory = DefaultDataSource.Factory(context)
                 val mediaSource = ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
                 player.setMediaSource(mediaSource)
            } else {
                player.setMediaItem(mediaItem)
            }
        } catch (e: Exception) {
            Log.e("NativeAudioModule", "Failed to load source: $url", e)
            throw e
        }
    }
}
