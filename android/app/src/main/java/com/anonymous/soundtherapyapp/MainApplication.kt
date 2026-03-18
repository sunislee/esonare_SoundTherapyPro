package com.anonymous.soundtherapyapp

import android.app.Application
import android.content.Context
import com.anonymous.soundtherapyapp.BuildConfig
// import com.anonymous.soundtherapyapp.NotificationManager
import com.anonymous.soundtherapyapp.NotificationManagerPackage
import com.anonymous.soundtherapyapp.CrashReportPackage
import com.anonymous.soundtherapyapp.BuildConfigPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsLocalAccessor

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
    override fun getPackages(): List<ReactPackage> = 
        PackageList(this).packages.apply {
          add(CrashReportPackage())
          add(BuildConfigPackage())
          add(NotificationManagerPackage())
        }

      override fun getJSMainModuleName(): String = "index"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
  }

  override val reactHost: ReactHost
    get() = com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    
    // 16k 兼容：在 SoLoader 初始化前设置系统属性，强制禁用新架构
    System.setProperty("react.native.newarch.enabled", "false")
    System.setProperty("react.native.new_architecture", "false")
    System.setProperty("react.native.new_architecture_enabled", "false")
    System.setProperty("react.native.bridgeless", "false")
    System.setProperty("react.native.bridgeless_enabled", "false")
    
    // 16k 兼容：移除 ReactNativeFeatureFlags 调用，防止触发 CxxAccessor 初始化
    // try {
    //   ReactNativeFeatureFlags.enableBridgelessArchitecture()
    // } catch (e: Exception) {
    //   e.printStackTrace()
    // }
    
    SoLoader.init(this, false)
    initCrashReport()
  }

  private fun initCrashReport() {
    // NotificationManager.init(this)
  }
}