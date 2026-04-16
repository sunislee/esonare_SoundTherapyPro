#!/bin/bash

# Sound 实例堆栈分析脚本
# 用途：当内存超过 200MB 时，分析 Sound 实例占用情况

PACKAGE_NAME="com.anonymous.soundtherapyapp"

echo "======================================"
echo "Sound 实例堆栈分析"
echo "======================================"
echo ""

# 检查设备连接
DEVICE_COUNT=$(adb devices | grep -v "List" | grep "device$" | wc -l)
if [ $DEVICE_COUNT -eq 0 ]; then
    echo "❌ 未检测到已连接的设备"
    exit 1
fi

# 获取内存信息
echo "获取内存信息..."
MEMINFO=$(adb shell dumpsys meminfo $PACKAGE_NAME)

# 提取 PSS Total
PSS_TOTAL=$(echo "$MEMINFO" | grep "TOTAL" | grep -oE '[0-9]+' | head -1)
PSS_MB=$(echo "scale=2; $PSS_TOTAL / 1024" | bc)

echo "当前 PSS Total: $PSS_MB MB"
echo ""

# 阈值检查
if (( $(echo "$PSS_MB < 200" | bc -l) )); then
    echo "✅ 内存使用正常（< 200MB）"
    echo "无需进行详细分析"
    exit 0
fi

echo "⚠️  警告：内存超过 200MB 阈值！"
echo ""

# 保存详细日志
OUTPUT_FILE="memory_analysis_$(date +%Y%m%d_%H%M%S).txt"
echo "详细分析已保存到：$OUTPUT_FILE"
echo ""

cat > $OUTPUT_FILE << EOF
Sound 实例堆栈分析报告
========================
时间：$(date '+%Y-%m-%d %H:%M:%S')
包名：$PACKAGE_NAME
PSS Total: $PSS_MB MB
========================

EOF

# 1. 分析 Native Heap
echo "1. 分析 Native Heap 占用..."
echo "【Native Heap 分析】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -A 20 "Native Heap" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 2. 分析 Dalvik Heap
echo "2. 分析 Dalvik Heap 占用..."
echo "【Dalvik Heap 分析】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -A 20 "Dalvik Heap" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 3. 查找 Sound 相关对象
echo "3. 查找 Sound/Audio 相关对象..."
echo "【Sound/Audio 相关对象】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -i "sound\|audio\|track\|player" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 4. 分析图形相关内存
echo "4. 分析图形相关内存..."
echo "【Graphics 内存】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -i "graphics\|bitmap\|image" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 5. 分析内存映射
echo "5. 分析内存映射（Top 20）..."
echo "【内存映射 Top 20】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -A 100 "Objects" | head -20 | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 6. 获取 Java Heap 信息
echo "6. 获取 Java Heap 详细信息..."
echo "【Java Heap 详情】" | tee -a $OUTPUT_FILE
adb shell dumpsys meminfo $PACKAGE_NAME --all | grep -A 50 "Java Heap" | head -50 | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 7. 分析 Code 和 Stack
echo "7. 分析 Code 和 Stack..."
echo "【Code & Stack】" | tee -a $OUTPUT_FILE
echo "$MEMINFO" | grep -E "Code|Stack" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 8. 总结
echo "8. 生成总结..."
echo "【总结】" | tee -a $OUTPUT_FILE
echo "PSS Total: $PSS_MB MB" | tee -a $OUTPUT_FILE

# 计算各部分占比
NATIVE_DIRTY=$(echo "$MEMINFO" | grep "Private Dirty" | grep -oE '[0-9]+' | head -1)
NATIVE_DIRTY_MB=$(echo "scale=2; $NATIVE_DIRTY / 1024" | bc)

DALVIK_DIRTY=$(echo "$MEMINFO" | grep "Dalvik Private Dirty" | grep -oE '[0-9]+' | head -1)
if [ -n "$DALVIK_DIRTY" ]; then
    DALVIK_DIRTY_MB=$(echo "scale=2; $DALVIK_DIRTY / 1024" | bc)
else
    DALVIK_DIRTY_MB="0"
fi

echo "Native Private Dirty: $NATIVE_DIRTY_MB MB" | tee -a $OUTPUT_FILE
echo "Dalvik Private Dirty: $DALVIK_DIRTY_MB MB" | tee -a $OUTPUT_FILE
echo "" | tee -a $OUTPUT_FILE

# 建议
echo "【优化建议】" | tee -a $OUTPUT_FILE
if (( $(echo "$NATIVE_DIRTY_MB > 100" | bc -l) )); then
    echo "⚠️  Native 层内存占用过高，建议：" | tee -a $OUTPUT_FILE
    echo "   - 检查 Sound 实例是否正确释放" | tee -a $OUTPUT_FILE
    echo "   - 减少并发音轨数量" | tee -a $OUTPUT_FILE
    echo "   - 优化音频缓冲区大小" | tee -a $OUTPUT_FILE
fi

if (( $(echo "$DALVIK_DIRTY_MB > 80" | bc -l) )); then
    echo "⚠️  Dalvik 层内存占用过高，建议：" | tee -a $OUTPUT_FILE
    echo "   - 检查 React 组件是否正确卸载" | tee -a $OUTPUT_FILE
    echo "   - 优化音频资源管理逻辑" | tee -a $OUTPUT_FILE
    echo "   - 添加内存警告处理" | tee -a $OUTPUT_FILE
fi

echo "" | tee -a $OUTPUT_FILE
echo "分析完成：$OUTPUT_FILE"
