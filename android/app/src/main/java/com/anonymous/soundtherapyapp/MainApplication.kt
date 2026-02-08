package com.anonymous.soundtherapyapp

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
    override fun getPackages(): List<ReactPackage> = 
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(CrashReportPackage())
        }

      override fun getJSMainModuleName(): String = "index"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
  }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      load()
    }
    initCrashReport()
  }

  private fun initCrashReport() {
    val channel = BuildConfig.CHANNEL
    if (channel == "googlePlay") {
      try {
        val clazz = Class.forName("com.google.firebase.FirebaseApp")
        val method = clazz.getMethod("initializeApp", android.content.Context::class.java)
        method.invoke(null, this)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    } else if (channel == "domestic") {
      try {
        val clazz = Class.forName("com.tencent.bugly.crashreport.CrashReport")
        val method = clazz.getMethod("initCrashReport", android.content.Context::class.java, String::class.java, Boolean::class.java)
        method.invoke(null, applicationContext, "de02ce9158", BuildConfig.DEBUG)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
  }
}
