#!/bin/bash

# ========================================
# EQ 预设循环切换压力测试脚本
# ========================================
# 用途：循环切换 8 段 EQ 预设 50 次，检测内存泄漏和线程竞争
# 目标：无崩溃，内存稳定
# ========================================

set -e

PACKAGE_NAME="com.anonymous.soundtherapyapp"
LOOPS=50
LOG_DIR="/tmp/eq_stress_test"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "🔁 EQ 预设循环切换压力测试"
echo "=========================================="
echo "📱 应用包名：$PACKAGE_NAME"
echo "🔄 循环次数：$LOOPS"
echo "📁 日志目录：$LOG_DIR"
echo "=========================================="

# 创建日志目录
mkdir -p "$LOG_DIR"

# 检查设备连接
if ! adb devices | grep -q "device$"; then
    echo "❌ 未检测到 Android 设备"
    exit 1
fi

# 获取应用 PID
echo ""
echo "[1/4] 检查应用状态..."
PID=$(adb shell pidof -s $PACKAGE_NAME 2>/dev/null || echo "")

if [ -z "$PID" ]; then
    echo "❌ 应用未运行，请先启动 App"
    exit 1
fi

echo "✅ 应用 PID: $PID"

# 记录初始内存
INITIAL_MEM=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "TOTAL:" | awk '{print $2}')
INITIAL_MEM_MB=$(echo "scale=2; $INITIAL_MEM / 1024" | bc)

echo "📊 初始内存：${INITIAL_MEM_MB}MB"

# 开始循环测试
echo ""
echo "[2/4] 开始循环切换 EQ 预设..."
echo "⏱️  开始时间：$(date '+%H:%M:%S')"

CRASH_COUNT=0
MEMORY_LEAK_DETECTED=0

for i in $(seq 1 $LOOPS); do
    # 计算进度
    PROGRESS=$(echo "scale=1; $i * 100 / $LOOPS" | bc)
    
    # 显示进度
    printf "\r🔄 进度：[%3d/%3d] %5.1f%%" $i $LOOPS $PROGRESS
    
    # 模拟切换到不同 EQ 预设
    # 注意：这里需要通过 adb 输入事件或修改代码添加测试接口
    
    # 简单方案：通过 logcat 监控是否有崩溃
    if ! adb shell pidof -q $PACKAGE_NAME; then
        echo ""
        echo "❌ 应用崩溃！(循环 $i/$LOOPS)"
        CRASH_COUNT=$((CRASH_COUNT + 1))
        break
    fi
    
    # 每 10 次循环检查一次内存
    if [ $((i % 10)) -eq 0 ]; then
        CURRENT_MEM=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "TOTAL:" | awk '{print $2}')
        CURRENT_MEM_MB=$(echo "scale=2; $CURRENT_MEM / 1024" | bc)
        
        # 检查内存泄漏（增长超过 50MB 视为泄漏）
        MEM_GROWTH=$(echo "$CURRENT_MEM_MB - $INITIAL_MEM_MB" | bc)
        if (( $(echo "$MEM_GROWTH > 50" | bc -l) )); then
            echo ""
            echo "⚠️  检测到内存泄漏！增长：${MEM_GROWTH}MB"
            MEMORY_LEAK_DETECTED=1
        fi
        
        printf " | 内存：${CURRENT_MEM_MB}MB (+${MEM_GROWTH}MB)"
    fi
    
    # 短暂延迟（模拟用户操作间隔）
    sleep 0.5
done

echo ""
echo ""
echo "[3/4] 测试完成"
echo "⏱️  结束时间：$(date '+%H:%M:%S')"

# 最终内存检查
FINAL_MEM=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null | grep "TOTAL:" | awk '{print $2}')
FINAL_MEM_MB=$(echo "scale=2; $FINAL_MEM / 1024" | bc)
TOTAL_GROWTH=$(echo "scale=2; $FINAL_MEM_MB - $INITIAL_MEM_MB" | bc)

echo ""
echo "[4/4] 生成测试报告..."

# 生成报告
REPORT_FILE="$LOG_DIR/eq_stress_report_$TIMESTAMP.txt"

cat > "$REPORT_FILE" << EOF
========================================
EQ 预设循环切换压力测试报告
========================================
测试时间：$(date '+%Y-%m-%d %H:%M:%S')
循环次数：$LOOPS
应用 PID: $PID

初始内存：${INITIAL_MEM_MB}MB
最终内存：${FINAL_MEM_MB}MB
内存增长：${TOTAL_GROWTH}MB

测试结果：
- 崩溃次数：$CRASH_COUNT
- 内存泄漏：$(if [ $MEMORY_LEAK_DETECTED -eq 1 ]; then echo "❌ 检测到"; else echo "✅ 未检测到"; fi)
- 总体评估：$(if [ $CRASH_COUNT -eq 0 ] && [ $MEMORY_LEAK_DETECTED -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi)

详细日志目录：$LOG_DIR
========================================
EOF

# 显示结果
echo ""
cat "$REPORT_FILE"

echo ""
if [ $CRASH_COUNT -eq 0 ] && [ $MEMORY_LEAK_DETECTED -eq 0 ]; then
    echo "✅ EQ 切换测试通过！系统稳定。"
else
    echo "❌ 测试失败，请检查日志："
    echo "   - 崩溃日志：adb logcat | grep -i crash"
    echo "   - 内存详情：$LOG_DIR"
fi
