#!/bin/bash

# 8 轨音频资源重命名与搬运脚本

OUTPUT_DIR="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/output_tracks"
RAW_DIR="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/SoundTherapy081/android/app/src/main/res/raw"

echo "🎵 开始处理 8 轨音频资源..."
echo "📂 源目录：$OUTPUT_DIR"
echo "📂 目标目录：$RAW_DIR"
echo ""

# 遍历所有子文件夹
for folder in "$OUTPUT_DIR"/*/; do
    if [ -d "$folder" ]; then
        folder_name=$(basename "$folder")
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📁 处理文件夹：$folder_name"
        
        # 遍历该文件夹下的所有 track_*.mp3 文件
        for track_file in "$folder"track_*.mp3; do
            if [ -f "$track_file" ]; then
                # 获取文件名（不含路径）
                track_name=$(basename "$track_file")
                
                # 重命名为：folder_name_track_n.mp3
                new_name="${folder_name}_${track_name}"
                new_path="$RAW_DIR/$new_name"
                
                echo "   📝 $track_name → $new_name"
                
                # 复制文件到 raw 目录
                cp "$track_file" "$new_path"
            fi
        done
        
        echo "   ✅ $folder_name 处理完成"
        echo ""
    fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 所有资源处理完成！"
echo ""
echo "📋 检查 raw 目录中的 8 轨文件："
ls -lh "$RAW_DIR" | grep "_track_" | awk '{print "   " $9 " (" $5 ")"}'
echo ""
