#!/bin/bash

# AudioTrack 和 16KB 错误监听脚本
# 用途：捕获与音频和 16KB 对齐相关的错误

OUTPUT_FILE="logcat_audio_errors_$(date +%Y%m%d_%H%M%S).txt"

echo "======================================"
echo "AudioTrack & 16KB 错误监听"
echo "输出文件：$OUTPUT_FILE"
echo "======================================"
echo ""

# 清空旧日志
adb logcat -c

# 开始监听，过滤关键错误
echo "开始监听（按 Ctrl+C 停止）..."
echo ""

# 监听的关键词
# - AudioTrack: 音频轨道错误
# - AudioFlinger: 音频混音器错误
# - ELF: 16KB 对齐错误
# - sound: 音频相关
# - track: 音轨相关
# - alignment: 对齐错误
# - jni: JNI 相关错误

adb logcat | grep -iE "AudioTrack|AudioFlinger|ELF|sound|track|alignment|jni|Sound|MediaPlayer|ExoPlayer" | while read line; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 输出到控制台（带颜色）
    if echo "$line" | grep -qiE "error|exception|fail|crash"; then
        # 错误信息（红色）
        echo -e "\033[31m[$TIMESTAMP] \033[0m$line" | tee -a "$OUTPUT_FILE"
        
        # 如果发现严重错误，立即告警
        if echo "$line" | grep -qiE "ELF.*alignment|16.*kb|page.*align"; then
            echo ""
            echo "⚠️  ⚠️  ⚠️  警告：检测到 16KB 对齐错误！"
            echo "详细信息：$line"
            echo ""
        fi
        
        if echo "$line" | grep -qiE "AudioTrack.*error|underrun|buffer"; then
            echo ""
            echo "⚠️  AudioTrack 错误 detected!"
            echo "详细信息：$line"
            echo ""
        fi
    else
        # 普通信息（白色）
        echo "[$TIMESTAMP] $line" >> "$OUTPUT_FILE"
    fi
done
