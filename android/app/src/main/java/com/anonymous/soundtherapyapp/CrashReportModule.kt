package com.anonymous.soundtherapyapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.tencent.bugly.crashreport.CrashReport

class CrashReportModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "CrashReport"
    }

    @ReactMethod
    fun logException(message: String) {
        val channel = BuildConfig.CHANNEL
        if (channel == "googlePlay") {
            FirebaseCrashlytics.getInstance().recordException(Exception(message))
        } else if (channel == "domestic") {
            CrashReport.postCatchedException(Exception(message))
        }
    }

    @ReactMethod
    fun setUserId(userId: String) {
        val channel = BuildConfig.CHANNEL
        if (channel == "googlePlay") {
            FirebaseCrashlytics.getInstance().setUserId(userId)
        } else if (channel == "domestic") {
            CrashReport.setUserId(userId)
        }
    }
}
