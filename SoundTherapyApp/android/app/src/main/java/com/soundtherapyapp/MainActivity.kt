package com.soundtherapyapp

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SoundTherapyApp"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // 1. 彻底让内容顶到最上方
    androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
    // 2. 强行把状态栏背景设为全透明
    window.statusBarColor = android.graphics.Color.TRANSPARENT
    // 3. 针对小米等系统，强制清除系统遮罩
    window.navigationBarColor = android.graphics.Color.TRANSPARENT
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
