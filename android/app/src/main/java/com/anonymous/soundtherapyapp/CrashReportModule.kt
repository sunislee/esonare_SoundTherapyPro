package com.anonymous.soundtherapyapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CrashReportModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "CrashReport"
    }

    @ReactMethod
    fun logException(message: String) {
        android.util.Log.d("CrashReport", "Logging exception: $message")
        // 默认使用 Bugly（国内渠道）
        try {
            val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
            val method = clazz.getMethod("postCatchedException", Throwable::class.java)
            method.invoke(null, Exception(message))
        } catch (e: Exception) {
            android.util.Log.e("CrashReport", "Crash report failed", e)
        }
    }

    @ReactMethod
    fun testCrash() {
        // 安全起见，不真正抛出异常，仅记录日志，防止 Google Play 审核拒绝或真正崩溃
        android.util.Log.w("CrashReport", "testCrash called from JS. Ignored for safety in production.")
        logException("Test crash triggered from JS (Safe mode)")
    }

    @ReactMethod
    fun setUserId(userId: String) {
        // 默认使用 Bugly（国内渠道）
        try {
            val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
            val method = clazz.getMethod("setUserId", String::class.java)
            method.invoke(null, userId)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getChannel(): String {
        return "domestic"
    }
}
