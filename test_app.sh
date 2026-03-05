#!/bin/bash

# ========================================
# 心声冥想 - 自动化测试脚本
# ========================================

PACKAGE="com.anonymous.soundtherapyapp"
APK_PATH="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/android/app/build/outputs/apk/google/release/app-google-release.apk"

echo "========================================"
echo "  心声冥想 - Google Play Release 测试"
echo "========================================"
echo ""

case "$1" in
  install)
    echo "📦 安装 Google Play Release 包..."
    adb install -r "$APK_PATH"
    echo "✅ 安装完成"
    ;;
    
  start)
    echo "🚀 启动 App..."
    adb shell am start -n "$PACKAGE/.MainActivity"
    echo "✅ App 已启动"
    ;;
    
  restart)
    echo "🔄 重启 App..."
    adb shell am force-stop "$PACKAGE"
    sleep 1
    adb shell am start -n "$PACKAGE/.MainActivity"
    echo "✅ App 已重启"
    ;;
    
  stop)
    echo "⏹️ 停止 App..."
    adb shell am force-stop "$PACKAGE"
    echo "✅ App 已停止"
    ;;
    
  logs)
    echo "📋 实时日志监控 (Ctrl+C 停止)..."
    adb logcat | grep -E "LandingScreen|NameEntry|AsyncStorage.*USER_NAME|HAS_SET_NAME"
    ;;
    
  download)
    echo "📥 查看下载进度..."
    adb logcat -d | grep -E "DownloadService.*Progress|DownloadService.*completed" | tail -20
    ;;
    
  clear)
    echo "🗑️ 清除 App 数据..."
    adb shell pm clear "$PACKAGE"
    echo "✅ 数据已清除"
    ;;
    
  test)
    echo "🧪 执行完整测试流程..."
    echo ""
    echo "Step 1: 清除数据..."
    adb shell pm clear "$PACKAGE"
    sleep 1
    
    echo "Step 2: 重启 App..."
    adb shell am start -n "$PACKAGE/.MainActivity"
    sleep 3
    
    echo "Step 3: 查看启动日志..."
    adb logcat -d | grep -E "LandingScreen.*用户名|LandingScreen.*跳转" | tail -10
    
    echo ""
    echo "✅ 测试完成！请检查手机："
    echo "   - 首次启动：应该显示输入名字页面"
    echo "   - 杀进程重启：应该直接进主页"
    ;;
    
  *)
    echo "用法：$0 {install|start|restart|stop|logs|download|clear|test}"
    echo ""
    echo "命令说明:"
    echo "  install  - 安装 Google Play Release 包"
    echo "  start    - 启动 App"
    echo "  restart  - 杀进程重启 App（测试秒进主页）"
    echo "  stop     - 停止 App"
    echo "  logs     - 实时日志监控"
    echo "  download - 查看下载进度"
    echo "  clear    - 清除 App 数据"
    echo "  test     - 执行完整测试流程"
    echo ""
    ;;
esac
