#!/bin/bash

# 音频分频段批量处理脚本 v2
# 修复：使用更兼容的编码格式

RAW_DIR="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/android/app/src/main/res/raw"

echo "🎵 开始批量拆分音频文件 (v2 修复版)..."
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

# 先删除旧的拆分文件
echo "🗑️ 清理旧的拆分文件..."
rm -f low_*.m4a mid_*.m4a high_*.m4a 2>/dev/null
rm -f low_*.wav mid_*.wav high_*.wav 2>/dev/null
echo "✅ 清理完成"
echo ""

# 只处理原始文件（不以 low_/mid_/high_ 开头）
for audio_file in balanced_noise.m4a wind_noise.m4a; do
    if [ ! -f "$audio_file" ]; then
        continue
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎧 处理文件：$audio_file"
    
    # 获取文件名（不含扩展名）
    filename="${audio_file%.*}"
    
    echo ""
    
    # 低频：0-300Hz (使用低通滤波器)
    echo "   🔵 拆分低频 (0-300Hz)..."
    ffmpeg -y -i "$audio_file" \
        -af "lowpass=f=300" \
        -c:a aac -b:a 192k -ar 44100 -ac 2 \
        "low_${filename}.m4a" \
        -loglevel error
    
    if [ $? -ne 0 ]; then
        echo "   ❌ 低频拆分失败"
        continue
    fi
    
    # 中频：300Hz-3kHz (使用带通滤波器)
    echo "   🟢 拆分成中频 (300Hz-3kHz)..."
    ffmpeg -y -i "$audio_file" \
        -af "highpass=f=300,lowpass=f=3000" \
        -c:a aac -b:a 192k -ar 44100 -ac 2 \
        "mid_${filename}.m4a" \
        -loglevel error
    
    if [ $? -ne 0 ]; then
        echo "   ❌ 中频拆分失败"
        continue
    fi
    
    # 高频：3kHz-20kHz (使用高通滤波器)
    echo "   🔴 拆分高频 (3kHz-20kHz)..."
    ffmpeg -y -i "$audio_file" \
        -af "highpass=f=3000" \
        -c:a aac -b:a 192k -ar 44100 -ac 2 \
        "high_${filename}.m4a" \
        -loglevel error
    
    if [ $? -ne 0 ]; then
        echo "   ❌ 高频拆分失败"
        continue
    fi
    
    echo "   ✅ 拆分完成"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 所有音频拆分完成！"
echo ""
echo "📋 生成的文件："
ls -lh low_*.m4a mid_*.m4a high_*.m4a 2>/dev/null
echo ""
