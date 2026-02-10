#!/bin/bash

# 获取当前连接的第一个 Android 设备 ID
DEVICE_ID=$(adb devices | grep -v "List" | head -n 1 | cut -f 1)

if [ -z "$DEVICE_ID" ]; then
    echo "❌ 错误: 未检测到已连接的 Android 真机。请检查 USB 调试是否开启。"
    exit 1
fi

echo "🚀 检测到设备: $DEVICE_ID"

# 1. 编译 domesticDebug 变体
echo "🏗️  正在编译 domesticDebug..."
(cd android && ./gradlew assembleDomesticDebug)

# 2. 安装 APK
echo "📲 正在安装 APK..."
adb -s $DEVICE_ID install -r android/app/build/outputs/apk/domestic/debug/app-domestic-debug.apk

# 3. 强行启动 Activity
# 注意：applicationId 是 com.anonymous.soundtherapyapp.domestic
# 但是 MainActivity 的完整路径是 com.anonymous.soundtherapyapp.MainActivity
PACKAGE_NAME="com.anonymous.soundtherapyapp.domestic"
ACTIVITY_PATH="com.anonymous.soundtherapyapp/com.anonymous.soundtherapyapp.MainActivity"

echo "🏃 正在启动 App ($PACKAGE_NAME)..."
adb -s $DEVICE_ID shell am start -n "$PACKAGE_NAME/com.anonymous.soundtherapyapp.MainActivity"

echo "✅ 启动指令已发送。"
