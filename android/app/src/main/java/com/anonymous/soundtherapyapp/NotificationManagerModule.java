package com.anonymous.soundtherapyapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class NotificationManagerModule extends ReactContextBaseJavaModule {

    private static final String CHANNEL_ID = "sound_therapy_notifications";
    private static final String CHANNEL_NAME = "心声冥想通知";
    private static final String CHANNEL_DESCRIPTION = "冥想提醒和个性化建议";

    public NotificationManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "NotificationManager";
    }

    @ReactMethod
    public void createNotificationChannel(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Context context = getReactApplicationContext();
                NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

                if (notificationManager != null) {
                    NotificationChannel channel = new NotificationChannel(
                            CHANNEL_ID,
                            CHANNEL_NAME,
                            NotificationManager.IMPORTANCE_DEFAULT
                    );
                    channel.setDescription(CHANNEL_DESCRIPTION);
                    channel.enableLights(true);
                    channel.enableVibration(true);

                    notificationManager.createNotificationChannel(channel);
                    promise.resolve(true);
                } else {
                    promise.reject("ERROR", "NotificationManager is null");
                }
            } else {
                // Android 7.1 and below don't require notification channels
                promise.resolve(true);
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
