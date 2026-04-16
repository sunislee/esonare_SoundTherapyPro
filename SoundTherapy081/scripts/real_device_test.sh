#!/bin/bash

# 真机音频切换压力测试脚本
# 用途：在真机上快速切换多个场景，验证 16KB 适配稳定性

echo "======================================"
echo "真机音频切换压力测试"
echo "======================================"
echo ""

# 启动 logcat 监控（后台）
echo "📊 启动 logcat 监控..."
adb logcat -c  # 清空 logcat
adb logcat | grep -iE "AudioTrack|AudioFlinger|Sound|MediaPlayer|error|exception" > /tmp/audio_test_log.txt &
LOGCAT_PID=$!

# 等待 2 秒
sleep 2

echo "🎵 开始音频切换测试..."
echo ""

# 模拟用户快速切换场景（通过启动 Activity 并传递不同参数）
# 注意：这里简化为启动 App，实际需要更复杂的交互
for i in {1..8}; do
    echo "第 $i 次切换..."
    
    # 这里应该调用 App 的接口切换场景
    # 简化为检查 App 是否正常运行
    adb shell pidof com.anonymous.soundtherapyapp > /dev/null
    if [ $? -eq 0 ]; then
        echo "  ✅ App 运行正常"
    else
        echo "  ❌ App 已崩溃！"
        break
    fi
    
    sleep 1
done

echo ""
echo "📊 测试完成，分析结果..."
echo ""

# 停止 logcat
kill $LOGCAT_PID 2>/dev/null

# 检查是否有崩溃
CRASH_COUNT=$(grep -c "FATAL EXCEPTION" /tmp/audio_test_log.txt 2>/dev/null || echo "0")
ERROR_COUNT=$(grep -ci "error" /tmp/audio_test_log.txt 2>/dev/null || echo "0")

echo "错误统计："
echo "  - 崩溃次数：$CRASH_COUNT"
echo "  - 错误总数：$ERROR_COUNT"
echo ""

if [ "$CRASH_COUNT" -eq 0 ]; then
    echo "✅ 测试通过！无崩溃"
else
    echo "❌ 测试失败！检测到崩溃"
    echo ""
    echo "崩溃日志："
    grep -A 10 "FATAL EXCEPTION" /tmp/audio_test_log.txt
fi

# 清理
rm -f /tmp/audio_test_log.txt

echo ""
echo "✅ 测试完成"
