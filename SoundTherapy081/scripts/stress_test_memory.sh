#!/bin/bash

# ========================================
# Android 16KB 页内存压力测试脚本
# ========================================
# 用途：监控 8 段音轨并发加载 + 降噪资源下载时的内存峰值
# 目标：PSS Total < 200MB
# ========================================

set -e

# 配置
PACKAGE_NAME="com.anonymous.soundtherapyapp"
TEST_DURATION=120  # 测试时长（秒）
SAMPLE_INTERVAL=2  # 采样间隔（秒）
MEMORY_THRESHOLD=200  # 内存阈值（MB）
LOG_DIR="/tmp/soundtherapy_stress_test"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 创建日志目录
mkdir -p "$LOG_DIR"

echo "=========================================="
echo "🔥 Android 16KB 页内存压力测试"
echo "=========================================="
echo "📱 应用包名：$PACKAGE_NAME"
echo "⏱️  测试时长：${TEST_DURATION}s"
echo "📊 采样间隔：${SAMPLE_INTERVAL}s"
echo "⚠️  内存阈值：${MEMORY_THRESHOLD}MB"
echo "📁 日志目录：$LOG_DIR"
echo "=========================================="

# 获取应用 PID
echo ""
echo "[1/4] 获取应用 PID..."
PID=$(adb shell pidof -s $PACKAGE_NAME 2>/dev/null || echo "")

if [ -z "$PID" ]; then
    echo "❌ 未找到应用进程，请先启动 App"
    exit 1
fi

echo "✅ 应用 PID: $PID"

# 初始化日志文件
MEMORY_LOG="$LOG_DIR/memory_log_$TIMESTAMP.txt"
DETAIL_LOG="$LOG_DIR/memory_detail_$TIMESTAMP.txt"
PEAK_LOG="$LOG_DIR/peak_memory_$TIMESTAMP.txt"

echo "时间戳,PSS_Total(MB),Native_Heap(MB),Dalvik_Heap(MB),Gfx_Resources(MB)" > "$MEMORY_LOG"
echo "" > "$DETAIL_LOG"

# 记录初始内存
echo ""
echo "[2/4] 记录初始内存状态..."
echo "=== 初始内存状态 ($(date '+%H:%M:%S')) ===" >> "$DETAIL_LOG"
adb shell dumpsys meminfo $PACKAGE_NAME >> "$DETAIL_LOG"

# 开始监控循环
echo ""
echo "[3/4] 开始内存监控（按 Ctrl+C 停止）..."
echo "⏰ 开始时间：$(date '+%H:%M:%S')"

START_TIME=$(date +%s)
PEAK_MEMORY=0
PEAK_TIME=""
SAMPLE_COUNT=0
ALERT_TRIGGERED=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    # 检查是否超时
    if [ $ELAPSED -ge $TEST_DURATION ]; then
        echo ""
        echo "⏰ 测试时间到达 (${TEST_DURATION}s)"
        break
    fi
    
    # 采样内存
    TIMESTAMP_STR=$(date '+%H:%M:%S')
    
    # 获取 PSS 内存（单位 KB）
    MEM_INFO=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "TOTAL:" || echo "")
    
    if [ -n "$MEM_INFO" ]; then
        # 解析 PSS Total（KB 转 MB）
        PSS_TOTAL_KB=$(echo "$MEM_INFO" | awk '{print $2}')
        PSS_TOTAL_MB=$(echo "scale=2; $PSS_TOTAL_KB / 1024" | bc)
        
        # 解析 Native Heap
        NATIVE_HEAP_KB=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "Native Heap:" | awk '{print $4}' || echo "0")
        NATIVE_HEAP_MB=$(echo "scale=2; $NATIVE_HEAP_KB / 1024" | bc)
        
        # 解析 Dalvik Heap
        DALVIK_HEAP_KB=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "Dalvik Heap:" | awk '{print $4}' || echo "0")
        DALVIK_HEAP_MB=$(echo "scale=2; $DALVIK_HEAP_KB / 1024" | bc)
        
        # 解析 Graphics Resources
        GFX_KB=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "Gfx:" | awk '{print $2}' || echo "0")
        GFX_MB=$(echo "scale=2; $GFX_KB / 1024" | bc)
        
        # 记录到 CSV
        echo "$TIMESTAMP_STR,$PSS_TOTAL_MB,$NATIVE_HEAP_MB,$DALVIK_HEAP_MB,$GFX_MB" >> "$MEMORY_LOG"
        
        # 更新峰值
        if (( $(echo "$PSS_TOTAL_MB > $PEAK_MEMORY" | bc -l) )); then
            PEAK_MEMORY=$PSS_TOTAL_MB
            PEAK_TIME=$TIMESTAMP_STR
        fi
        
        # 阈值告警
        if (( $(echo "$PSS_TOTAL_MB > $MEMORY_THRESHOLD" | bc -l) )) && [ $ALERT_TRIGGERED -eq 0 ]; then
            echo ""
            echo "⚠️  ⚠️  ⚠️  内存超过阈值 ${MEMORY_THRESHOLD}MB！当前：${PSS_TOTAL_MB}MB"
            echo "⚠️  详细日志已保存到：$DETAIL_LOG"
            
            # 记录详细内存信息
            echo "" >> "$DETAIL_LOG"
            echo "=== 内存峰值告警 ($TIMESTAMP_STR) ===" >> "$DETAIL_LOG"
            adb shell dumpsys meminfo $PACKAGE_NAME >> "$DETAIL_LOG"
            
            ALERT_TRIGGERED=1
        fi
        
        # 实时显示（每 5 次采样显示一次）
        SAMPLE_COUNT=$((SAMPLE_COUNT + 1))
        if [ $((SAMPLE_COUNT % 5)) -eq 0 ]; then
            printf "\r📊 [${ELAPSED}s] PSS: ${PSS_TOTAL_MB}MB | Native: ${NATIVE_HEAP_MB}MB | Dalvik: ${DALVIK_HEAP_MB}MB | 峰值：${PEAK_MEMORY}MB (@${PEAK_TIME})"
        fi
    else
        echo "❌ 无法获取内存信息，应用可能已崩溃"
        break
    fi
    
    sleep $SAMPLE_INTERVAL
done

# 结束监控
echo ""
echo "[4/4] 测试完成，生成报告..."

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

# 记录最终内存状态
echo "" >> "$DETAIL_LOG"
echo "=== 最终内存状态 ($(date '+%H:%M:%S')) ===" >> "$DETAIL_LOG"
adb shell dumpsys meminfo $PACKAGE_NAME >> "$DETAIL_LOG"

# 生成峰值报告
cat > "$PEAK_LOG" << EOF
========================================
内存压力测试报告
========================================
测试时间：$(date '+%Y-%m-%d %H:%M:%S')
测试时长：${TOTAL_TIME}s
采样次数：$SAMPLE_COUNT

内存峰值：${PEAK_MEMORY}MB (@${PEAK_TIME})
内存阈值：${MEMORY_THRESHOLD}MB
测试结果：$(if (( $(echo "$PEAK_MEMORY <= $MEMORY_THRESHOLD" | bc -l) )); then echo "✅ PASS"; else echo "❌ FAIL"; fi)

详细日志:
- 内存采样：$MEMORY_LOG
- 详细信息：$DETAIL_LOG
========================================
EOF

# 显示结果
echo ""
cat "$PEAK_LOG"

# 如果超过阈值，尝试分析原因
if (( $(echo "$PEAK_MEMORY > $MEMORY_THRESHOLD" | bc -l) )); then
    echo ""
    echo "🔍 内存分析建议："
    echo "1. 检查是否有 Sound 实例未释放"
    echo "2. 验证音频缓冲区大小配置"
    echo "3. 查看 Native Heap 是否异常增长"
    echo ""
    echo "💡 执行以下命令分析 Sound 实例："
    echo "   adb shell dumpsys meminfo $PACKAGE_NAME | grep -A 20 'Native Heap'"
fi

echo ""
echo "✅ 测试完成！"
