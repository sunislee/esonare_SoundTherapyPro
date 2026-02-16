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
        val channel = BuildConfig.DISTRIBUTION_CHANNEL
        android.util.Log.d("CrashReport", "Logging exception: $message")
        if (channel == "googlePlay") {
            try {
                val clazz = Class.forName("com.google.firebase.crashlytics.FirebaseCrashlytics")
                val method = clazz.getMethod("getInstance")
                val instance = method.invoke(null)
                val recordMethod = clazz.getMethod("recordException", Throwable::class.java)
                recordMethod.invoke(instance, Exception(message))
            } catch (e: Exception) {
                android.util.Log.e("CrashReport", "Firebase recordException failed", e)
            }
        } else if (channel == "domestic") {
            try {
                val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
                val method = clazz.getMethod("postCatchedException", Throwable::class.java)
                method.invoke(null, Exception(message))
            } catch (e: Exception) {
                android.util.Log.e("CrashReport", "Bugly postCatchedException failed", e)
            }
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
        val channel = BuildConfig.DISTRIBUTION_CHANNEL
        if (channel == "googlePlay") {
            try {
                val clazz = Class.forName("com.google.firebase.crashlytics.FirebaseCrashlytics")
                val method = clazz.getMethod("getInstance")
                val instance = method.invoke(null)
                val setUserIdMethod = clazz.getMethod("setUserId", String::class.java)
                setUserIdMethod.invoke(instance, userId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } else if (channel == "domestic") {
            try {
                val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
                val method = clazz.getMethod("setUserId", String::class.java)
                method.invoke(null, userId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getChannel(): String {
        return BuildConfig.DISTRIBUTION_CHANNEL
    }
}
