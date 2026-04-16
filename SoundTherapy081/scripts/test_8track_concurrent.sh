#!/bin/bash

# 8 段音轨并发加载测试脚本
# 用途：自动触发多个场景切换，模拟 8 段音轨并发加载

PACKAGE_NAME="com.anonymous.soundtherapyapp"
ACTIVITY="com.anonymous.soundtherapyapp.MainActivity"

echo "======================================"
echo "8 段音轨并发加载测试"
echo "======================================"
echo ""

# 检查设备连接
echo "检查设备连接..."
DEVICE_COUNT=$(adb devices | grep -v "List" | grep "device$" | wc -l)
if [ $DEVICE_COUNT -eq 0 ]; then
    echo "❌ 未检测到已连接的设备"
    exit 1
fi

echo "✅ 设备已连接"

# 检查 App 是否运行
echo "检查 App 是否运行..."
PID=$(adb shell pidof $PACKAGE_NAME 2>/dev/null)
if [ -z "$PID" ]; then
    echo "❌ App 未运行，正在启动..."
    adb shell am start -n $ACTIVITY
    sleep 3
fi

echo "✅ App 已运行，PID: $PID"
echo ""

# 启动内存监控（后台）
echo "启动后台内存监控..."
LOG_FILE="memory_test_$(date +%Y%m%d_%H%M%S).txt"

(
    echo "8 段音轨并发加载测试日志" > $LOG_FILE
    echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
    echo "======================================" >> $LOG_FILE
    echo "" >> $LOG_FILE
    
    COUNTER=0
    while [ $COUNTER -lt 60 ]; do
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        MEMINFO=$(adb shell dumpsys meminfo $PACKAGE_NAME 2>/dev/null)
        
        if [ -n "$MEMINFO" ]; then
            PSS_TOTAL=$(echo "$MEMINFO" | grep "TOTAL" | grep -oE '[0-9]+' | head -1)
            PSS_MB=$(echo "scale=2; $PSS_TOTAL / 1024" | bc)
            
            echo "$TIMESTAMP | $PSS_MB MB" >> $LOG_FILE
        fi
        
        COUNTER=$((COUNTER + 1))
        sleep 1
    done
    
    echo "" >> $LOG_FILE
    echo "结束时间：$(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
) &

MONITOR_PID=$!
echo "✅ 内存监控已启动（PID: $MONITOR_PID）"
echo ""

# 等待 5 秒，确保监控开始
sleep 5

# 开始测试
echo "======================================"
echo "开始 8 段音轨并发加载测试"
echo "======================================"
echo ""

# 步骤 1：进入降噪房间页面
echo "步骤 1：进入降噪房间页面"
# 这里需要根据实际路由调整
adb shell am start -n "$PACKAGE_NAME/.MainActivity" --ei "scene_type" "noise"
sleep 2

# 步骤 2：快速切换 4 个降噪场景
echo "步骤 2：快速切换 4 个降噪场景（模拟 8 段音轨并发加载）"

SCENES=("noise_wind" "noise_traffic" "noise_crowd" "noise_balanced")

for SCENE in "${SCENES[@]}"; do
    echo "  → 切换到场景：$SCENE"
    
    # 使用 adb 输入事件模拟点击（需要根据实际 UI 调整坐标）
    # 或者使用 accessibility 命令直接触发点击
    adb shell input tap 540 1200  # 示例坐标，需要根据实际 UI 调整
    
    sleep 0.5
done

echo ""
echo "✅ 4 个场景切换完成"
echo ""

# 步骤 3：等待并观察内存峰值
echo "步骤 3：等待并观察内存峰值（30 秒）"
sleep 30

# 步骤 4：停止监控
echo "步骤 4：停止监控"
kill $MONITOR_PID 2>/dev/null

echo ""
echo "======================================"
echo "测试完成"
echo "======================================"
echo "日志文件：$LOG_FILE"
echo ""

# 显示最后 10 条记录
echo "最后 10 条内存记录："
tail -n 10 $LOG_FILE

# 计算峰值
echo ""
echo "内存峰值统计："
grep -oE '[0-9]+\.[0-9]+ MB' $LOG_FILE | sort -rn | head -1

echo ""
echo "⚠️  请检查日志文件查看详细数据"
echo "📊 如需分析详细内存信息，执行："
echo "   adb shell dumpsys meminfo $PACKAGE_NAME"
