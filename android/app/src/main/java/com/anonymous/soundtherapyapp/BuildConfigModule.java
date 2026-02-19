package com.anonymous.soundtherapyapp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.WritableMap;

import javax.annotation.Nonnull;

public class BuildConfigModule extends ReactContextBaseJavaModule {
    
    public BuildConfigModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Nonnull
    @Override
    public String getName() {
        return "BuildConfigModule";
    }
    
    @ReactMethod
    public void getBuildConfig(Promise promise) {
        try {
            WritableMap config = new WritableNativeMap();
            
            // 获取BuildConfig中的字段
            config.putString("UPDATE_CHANNEL", BuildConfig.UPDATE_CHANNEL);
            config.putString("VERSION_CHECK_URL", BuildConfig.VERSION_CHECK_URL);
            config.putString("APK_DOWNLOAD_BASE_URL", BuildConfig.APK_DOWNLOAD_BASE_URL);
            config.putString("APPLICATION_ID", BuildConfig.APPLICATION_ID);
            config.putString("VERSION_NAME", BuildConfig.VERSION_NAME);
            config.putInt("VERSION_CODE", BuildConfig.VERSION_CODE);
            config.putBoolean("DEBUG", BuildConfig.DEBUG);
            
            promise.resolve(config);
        } catch (Exception e) {
            promise.reject("BUILD_CONFIG_ERROR", "Failed to get build config", e);
        }
    }
}