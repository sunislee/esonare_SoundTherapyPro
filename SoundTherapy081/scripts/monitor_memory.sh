#!/bin/bash

# 心声冥想 App 内存监控脚本
# 用途：每 5 秒记录一次 PSS 内存占用
# 使用：./monitor_memory.sh

PACKAGE_NAME="com.anonymous.soundtherapyapp"
OUTPUT_FILE="memory_log_$(date +%Y%m%d_%H%M%S).txt"
INTERVAL=5

echo "======================================"
echo "心声冥想 App 内存监控"
echo "包名：$PACKAGE_NAME"
echo "采样间隔：${INTERVAL}秒"
echo "输出文件：$OUTPUT_FILE"
echo "======================================"
echo ""

# 检查设备连接
echo "检查设备连接..."
DEVICE_COUNT=$(adb devices | grep -v "List" | grep "device$" | wc -l)
if [ $DEVICE_COUNT -eq 0 ]; then
    echo "❌ 未检测到已连接的设备"
    exit 1
fi

echo "✅ 检测到 $DEVICE_COUNT 台设备"
adb devices | grep "device$"

# 检查 App 是否运行
echo ""
echo "检查 App 是否运行..."
PID=$(adb shell pidof $PACKAGE_NAME 2>/dev/null)
if [ -z "$PID" ]; then
    echo "❌ App 未运行，请先启动应用"
    exit 1
fi

echo "✅ App 已运行，PID: $PID"
echo ""

# 开始监控
echo "开始监控（按 Ctrl+C 停止）..."
echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 写入文件头
cat > $OUTPUT_FILE << EOF
心声冥想 App 内存监控日志
========================
包名：$PACKAGE_NAME
进程 ID: $PID
采样间隔：${INTERVAL}秒
开始时间：$(date '+%Y-%m-%d %H:%M:%S')
========================

时间戳 | PSS Total(MB) | Private Dirty(MB) | Heap Size(MB)
-----------------------------------------------------------
EOF

# 监控循环
COUNTER=0
while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 获取内存信息
    MEMINFO=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null)
    
    if [ -z "$MEMINFO" ]; then
        echo "❌ 无法获取内存信息，App 可能已关闭"
        break
    fi
    
    # 提取关键数据
    PSS_TOTAL=$(echo "$MEMINFO" | grep "TOTAL" | grep -oE '[0-9]+' | head -1)
    PRIVATE_DIRTY=$(echo "$MEMINFO" | grep "Private Dirty" | grep -oE '[0-9]+' | head -1)
    HEAP_SIZE=$(echo "$MEMINFO" | grep "Native Heap" | grep -oE '[0-9]+' | head -1)
    
    # 转换为 MB（dumpsys 返回的是 KB）
    PSS_MB=$(echo "scale=2; $PSS_TOTAL / 1024" | bc)
    PRIVATE_DIRTY_MB=$(echo "scale=2; $PRIVATE_DIRTY / 1024" | bc)
    HEAP_SIZE_MB=$(echo "scale=2; $HEAP_SIZE / 1024" | bc)
    
    # 输出到控制台
    printf "\r[%s] PSS: %6.2f MB | Private: %6.2f MB | Heap: %6.2f MB" \
        "$TIMESTAMP" "$PSS_MB" "$PRIVATE_DIRTY_MB" "$HEAP_SIZE_MB"
    
    # 写入文件
    echo "$TIMESTAMP | $PSS_MB | $PRIVATE_DIRTY_MB | $HEAP_SIZE_MB" >> $OUTPUT_FILE
    
    # 检查是否超过阈值
    if (( $(echo "$PSS_MB > 200" | bc -l) )); then
        echo ""
        echo "⚠️  警告：内存超过 200MB 阈值！"
        echo "📊 详细内存信息已保存到：${OUTPUT_FILE%.txt}_detail.txt"
        echo "$MEMINFO" > "${OUTPUT_FILE%.txt}_detail.txt"
    fi
    
    COUNTER=$((COUNTER + 1))
    
    sleep $INTERVAL
done

# 结束统计
echo ""
echo "监控结束"
echo "结束时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "总采样次数：$COUNTER"
echo "日志文件：$OUTPUT_FILE"
echo ""

# 计算平均值
if [ $COUNTER -gt 0 ]; then
    echo "统计信息："
    tail -n +10 $OUTPUT_FILE | awk -F'|' '
    BEGIN {sum=0; count=0; max=0}
    {
        gsub(/ /, "", $2);
        if ($2 != "") {
            sum += $2;
            count++;
            if ($2 > max) max = $2;
        }
    }
    END {
        if (count > 0) {
            printf "  平均 PSS: %.2f MB\n", sum/count;
            printf "  最大 PSS: %.2f MB\n", max;
        }
    }'
fi

echo ""
echo "✅ 监控完成"
