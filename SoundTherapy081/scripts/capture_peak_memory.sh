#!/bin/bash

# 峰值内存自动捕获脚本
# 用途：当 PSS 超过阈值时，立即保存详细 meminfo

PACKAGE_NAME="com.anonymous.soundtherapyapp"
THRESHOLD_MB=180
OUTPUT_DIR="memory_peak_capture"

mkdir -p $OUTPUT_DIR

echo "======================================"
echo "峰值内存自动捕获"
echo "阈值：${THRESHOLD_MB}MB"
echo "输出目录：$OUTPUT_DIR"
echo "======================================"
echo ""

# 检查设备
DEVICE_COUNT=$(adb devices | grep -v "List" | grep "device$" | wc -l)
if [ $DEVICE_COUNT -eq 0 ]; then
    echo "❌ 未检测到设备"
    exit 1
fi

# 检查 App
PID=$(adb shell pidof $PACKAGE_NAME 2>/dev/null)
if [ -z "$PID" ]; then
    echo "❌ App 未运行"
    exit 1
fi

echo "✅ 监控中 (PID: $PID)"
echo "按 Ctrl+C 停止"
echo ""

LAST_PSS=0
PEAK_PSS=0
CAPTURED=false

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 获取内存
    MEMINFO=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null)
    PSS_TOTAL=$(echo "$MEMINFO" | grep "TOTAL" | grep -oE '[0-9]+' | head -1)
    PSS_MB=$(echo "scale=2; $PSS_TOTAL / 1024" | bc)
    
    # 更新峰值
    if (( $(echo "$PSS_MB > $PEAK_PSS" | bc -l) )); then
        PEAK_PSS=$PSS_MB
    fi
    
    # 显示实时数据
    printf "\r[%s] PSS: %6.2f MB | Peak: %6.2f MB" "$TIMESTAMP" "$PSS_MB" "$PEAK_PSS"
    
    # 检查是否超过阈值
    if (( $(echo "$PSS_MB > $THRESHOLD_MB" | bc -l) )); then
        echo ""
        echo ""
        echo "⚠️  ⚠️  ⚠️  警告：内存超过 ${THRESHOLD_MB}MB！"
        echo "当前 PSS: $PSS_MB MB"
        echo ""
        
        # 保存详细信息
        FILENAME="$OUTPUT_DIR/peak_capture_$(date +%Y%m%d_%H%M%S).txt"
        echo "正在保存详细内存信息到：$FILENAME"
        
        cat > $FILENAME << EOF
峰值内存捕获报告
========================
时间：$(date '+%Y-%m-%d %H:%M:%S')
包名：$PACKAGE_NAME
进程 ID: $PID
PSS Total: $PSS_MB MB
峰值 PSS: $PEAK_PSS MB
阈值：$THRESHOLD_MB MB
========================

【完整 meminfo】
$MEMINFO

【分析建议】
如果 Native Heap 过高：
- 检查 Sound 实例是否正确释放
- 减少并发音轨数量

如果 Dalvik Heap 过高：
- 检查 React 组件内存泄漏
- 优化资源管理逻辑
EOF
        
        echo "✅ 详细信息已保存"
        echo ""
        echo "继续监控..."
        
        CAPTURED=true
    fi
    
    sleep 2
done
