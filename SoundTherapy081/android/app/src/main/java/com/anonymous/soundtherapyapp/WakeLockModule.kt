package com.anonymous.soundtherapyapp

import android.content.Context
import android.os.PowerManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WakeLockModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun getName(): String {
        return "WakeLockModule"
    }

    @ReactMethod
    fun acquire() {
        try {
            if (wakeLock == null) {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "SoundTherapy:AudioPlayback"
                )
            }
            if (!wakeLock!!.isHeld) {
                wakeLock!!.acquire()
                android.util.Log.d("WakeLockModule", "WakeLock acquired")
            }
        } catch (e: Exception) {
            android.util.Log.e("WakeLockModule", "Failed to acquire WakeLock", e)
        }
    }

    @ReactMethod
    fun release() {
        try {
            if (wakeLock != null && wakeLock!!.isHeld) {
                wakeLock!!.release()
                android.util.Log.d("WakeLockModule", "WakeLock released")
            }
        } catch (e: Exception) {
            android.util.Log.e("WakeLockModule", "Failed to release WakeLock", e)
        }
    }
}
