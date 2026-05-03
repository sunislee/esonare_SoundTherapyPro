#!/bin/bash

# 音频分频段批量处理脚本
# 功能：将 raw 目录下的所有音频文件拆分为 low/mid/high 三个频段

RAW_DIR="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/android/app/src/main/res/raw"

echo "🎵 开始批量拆分音频文件..."
echo "📂 目标目录：$RAW_DIR"
echo ""

# 检查 ffmpeg 是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 错误：未找到 ffmpeg"
    echo "请安装：brew install ffmpeg"
    exit 1
fi

echo "✅ ffmpeg 已安装"
echo ""

# 切换到目标目录
cd "$RAW_DIR"

# 遍历所有音频文件（排除已经拆分好的 low_ mid_ high_ 开头的文件）
for audio_file in *.m4a *.wav *.mp3; do
    # 跳过不存在的文件模式
    [ -e "$audio_file" ] || continue
    
    # 跳过已经拆分好的文件
    if [[ "$audio_file" == low_* ]] || [[ "$audio_file" == mid_* ]] || [[ "$audio_file" == high_* ]]; then
        echo "⏭️  跳过已拆分文件：$audio_file"
        continue
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎧 处理文件：$audio_file"
    
    # 获取文件名（不含扩展名）
    filename="${audio_file%.*}"
    extension="${audio_file##*.}"
    
    echo "   - 文件名：$filename"
    echo "   - 扩展名：$extension"
    echo ""
    
    # 低频：0-300Hz (使用低通滤波器)
    echo "   🔵 拆分低频 (0-300Hz)..."
    ffmpeg -y -i "$audio_file" \
        -af "lowpass=f=300" \
        -c:a aac -b:a 192k \
        "low_${filename}.${extension}" \
        -loglevel error
    
    # 中频：300Hz-3kHz (使用带通滤波器)
    echo "   🟢 拆分成中频 (300Hz-3kHz)..."
    ffmpeg -y -i "$audio_file" \
        -af "highpass=f=300,lowpass=f=3000" \
        -c:a aac -b:a 192k \
        "mid_${filename}.${extension}" \
        -loglevel error
    
    # 高频：3kHz-20kHz (使用高通滤波器)
    echo "   🔴 拆分高频 (3kHz-20kHz)..."
    ffmpeg -y -i "$audio_file" \
        -af "highpass=f=3000" \
        -c:a aac -b:a 192k \
        "high_${filename}.${extension}" \
        -loglevel error
    
    echo "   ✅ 拆分完成：low_${filename}.${extension}, mid_${filename}.${extension}, high_${filename}.${extension}"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 所有音频拆分完成！"
echo ""
echo "📋 文件列表："
ls -lh *.m4a *.wav *.mp3 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
echo ""
