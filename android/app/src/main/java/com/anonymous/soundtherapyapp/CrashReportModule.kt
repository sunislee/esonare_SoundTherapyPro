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
        val channel = "official"
        if (channel == "googlePlay") {
            try {
                val clazz = Class.forName("com.google.firebase.crashlytics.FirebaseCrashlytics")
                val method = clazz.getMethod("getInstance")
                val instance = method.invoke(null)
                val recordMethod = clazz.getMethod("recordException", Throwable::class.java)
                recordMethod.invoke(instance, Exception(message))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } else if (channel == "domestic") {
            try {
                val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
                val method = clazz.getMethod("postCatchedException", Throwable::class.java)
                method.invoke(null, Exception(message))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @ReactMethod
    fun setUserId(userId: String) {
        val channel = "official"
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
}
