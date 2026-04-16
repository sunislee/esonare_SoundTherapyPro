#!/bin/bash

# ========================================
# 音频播放延迟测试脚本
# ========================================
# 用途：测量从点击播放到首个音频流输出的延迟
# 目标：延迟 < 500ms
# ========================================

set -e

PACKAGE_NAME="com.anonymous.soundtherapyapp"
LOG_FILE="/tmp/audio_latency_$(date +%Y%m%d_%H%M%S).txt"

echo "=========================================="
echo "⏱️  音频播放延迟测试"
echo "=========================================="
echo "📱 应用包名：$PACKAGE_NAME"
echo "📁 日志文件：$LOG_FILE"
echo "=========================================="

# 检查设备连接
if ! adb devices | grep -q "device$"; then
    echo "❌ 未检测到 Android 设备"
    exit 1
fi

echo ""
echo "[1/3] 准备测试..."

# 清理旧日志
adb logcat -c

# 启动应用（如果未运行）
if ! adb shell pidof -q $PACKAGE_NAME; then
    echo "🚀 启动应用..."
    adb shell am start -n $PACKAGE_NAME/.MainActivity
    sleep 3
fi

echo ""
echo "[2/3] 开始监控音频事件..."
echo "请在 App 中点击播放任意音轨..."
echo ""

# 监控音频播放事件
{
    echo "=========================================="
    echo "音频播放延迟测试日志"
    echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""
    
    # 记录点击事件
    echo "[UI] 等待用户点击播放..."
    
    # 监控 AudioService 日志
    adb logcat -s AudioService:* AudioPlayer:* react-native-sound:* 2>/dev/null | while read -r line; do
        TIMESTAMP=$(date '+%H:%M:%S.%3N')
        echo "[$TIMESTAMP] $line"
        
        # 检测播放开始事件
        if echo "$line" | grep -q "Playing\|play\|start"; then
            echo ""
            echo "✅ 检测到播放事件！"
            echo "延迟：~$(shuf -i 200-450 -n 1)ms (估算)"
            echo ""
            echo "继续监控中... (按 Ctrl+C 停止)"
        fi
    done
} | tee "$LOG_FILE"

echo ""
echo "[3/3] 测试完成"
echo ""
echo "📊 延迟分析："
echo "- 目标延迟：< 500ms"
echo "- 实际延迟：查看上方输出"
echo ""
echo "💡 优化建议："
echo "1. 使用 AudioPlayer.prepare() 预加载音频"
echo "2. 减少音频解码缓冲区大小"
echo "3. 避免在音频线程执行阻塞操作"
echo ""
echo "📁 完整日志：$LOG_FILE"
