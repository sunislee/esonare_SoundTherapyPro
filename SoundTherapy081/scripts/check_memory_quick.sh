#!/bin/bash

# 快速内存检查（一次性）
PACKAGE_NAME="com.anonymous.soundtherapyapp"

echo "快速内存检查 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

# 获取 PID
PID=$(adb shell pidof $PACKAGE_NAME 2>/dev/null)
if [ -z "$PID" ]; then
    echo "❌ App 未运行"
    exit 1
fi

echo "进程 ID: $PID"
echo ""

# 获取内存信息
MEMINFO=$(adb shell dumpsys meminfo $PACKAGE_NAME)

# 提取 PSS Total
PSS_TOTAL=$(echo "$MEMINFO" | grep "TOTAL" | grep -oE '[0-9]+' | head -1)
PSS_MB=$(echo "scale=2; $PSS_TOTAL / 1024" | bc)

# 提取 Native Heap
HEAP_SIZE=$(echo "$MEMINFO" | grep "Native Heap" | grep -oE '[0-9]+' | head -1)
HEAP_MB=$(echo "scale=2; $HEAP_SIZE / 1024" | bc)

echo "PSS Total:     $PSS_MB MB"
echo "Native Heap:   $HEAP_MB MB"
echo ""

# 阈值检查
if (( $(echo "$PSS_MB > 200" | bc -l) )); then
    echo "⚠️  警告：内存超过 200MB 阈值！"
    echo ""
    echo "详细内存信息："
    echo "$MEMINFO"
else
    echo "✅ 内存使用正常（< 200MB）"
fi
