# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Ignore warnings for missing classes during R8 minification
-dontwarn javax.lang.model.**
-dontwarn javax.annotation.**
-dontwarn javax.tools.**
-dontwarn com.squareup.kotlinpoet.**
-dontwarn org.jetbrains.kotlin.**

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:
-keep class com.facebook.react.views.image.** { *; } 
-keep class **.R$* { *; }

# Network and file system libraries (critical for download functionality)
-keep class com.facebook.react.modules.network.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class com.rnfs.** { *; }

# Download and threading related classes
-keep class * implements java.io.Serializable { *; }
-keep class * implements java.lang.Runnable { *; }

# Reflection and annotation support
-keepattributes Signature
-keepattributes *Annotation*

# KotlinPoet library (used by some React Native modules)
-keep class com.squareup.kotlinpoet.** { *; }
-keep class javax.lang.model.** { *; }
-keep class javax.annotation.** { *; }
-keep class javax.tools.** { *; }

# Java standard library classes needed by KotlinPoet
-keep class java.lang.** { *; }
-keep class java.util.** { *; }
-keep class java.net.** { *; }

# Additional protection for React Native modules
-keep class com.facebook.react.modules.** { *; }

# AsyncStorage protection (CRITICAL for data persistence)
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.facebook.react.modules.storage.** { *; }
-dontwarn com.reactnativecommunity.asyncstorage.**

# React Native bridge protection (prevent storage architecture removal)
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.common.** { *; }
-keep class expo.modules.** { *; }
-keep class com.facebook.react.** { *; } 

# Notification and MediaSession support
-keep class com.facebook.react.modules.core.DeviceEventManagerModule { *; }
-keep class com.facebook.react.modules.appregistry.AppRegistry { *; }
-keep class com.facebook.react.modules.core.JSTimers { *; }

# Track Player and Media Control
-keep class com.guichaguri.trackplayer.** { *; }
-keep class com.google.android.exoplayer2.** { *; }
-keep class androidx.media.** { *; }
-keep class androidx.media3.** { *; }

# Keep all React Native modules
-keep class * extends com.facebook.react.ReactPackage { *; }
-keepclassmembers class * extends com.facebook.react.ReactPackage { *; }
