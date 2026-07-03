#!/bin/bash

# GitHub 图片资源下载脚本
# 下载 sunislee/sound-therapy-assets 仓库的所有 .webp 图片到指定目录

set -e

TARGET_DIR="$HOME/Downloads/github_bg"
mkdir -p "$TARGET_DIR"

BASE_URL="https://raw.githubusercontent.com/sunislee/sound-therapy-assets/main"

echo "开始下载 GitHub 资源..."
echo "目标目录: $TARGET_DIR"
echo ""

# 图片列表 (来自各个目录)
IMAGES=(
    # 根目录
    "moonlight.webp"
    "offroad.webp"
    "star_glass.webp"
    "western_church_candlelight.webp"
    "western_church_corridor.webp"
    "western_church_light_rays.webp"
    "western_church_sunlight_monastery.webp"
    # base 目录
    "base/morning_forest.webp"
    "base/serene_lakeside.webp"
    "base/starlit_wilderness.webp"
    # scenes 目录  
    "scenes/morning_forest.webp"
    "scenes/serene_lakeside.webp"
    "scenes/starlit_wilderness.webp"
    # zen 目录
    "zen/bg_bamboo_mist.webp"
    "zen/bg_bamboo_sunrise.webp"
    "zen/bg_fountain_ritual.webp"
    "zen/bg_guzheng_zen.webp"
    "zen/bg_temple_lantern_gate.webp"
    "zen/bg_temple_roof.webp"
    "zen/bg_temple_zen_lantern.webp"
    "zen/buddha_morning.webp"
    "zen/dawn_temple_mist.webp"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for IMAGE in "${IMAGES[@]}"; do
    URL="${BASE_URL}/${IMAGE}"
    OUTPUT="${TARGET_DIR}/${IMAGE//\//-}"  # 将路径分隔符替换为连字符
    
    echo "正在下载: ${IMAGE} ..."
    
    if curl -L -o "$OUTPUT" "$URL" 2>/dev/null; then
        if [ -f "$OUTPUT" ]; then
            SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
            echo "✓ 成功: $(basename $IMAGE) ($SIZE)"
            ((SUCCESS_COUNT++))
        else
            echo "✗ 失败: $(basename $IMAGE) (文件未创建)"
            ((FAIL_COUNT++))
        fi
    else
        echo "✗ 失败: $(basename $IMAGE) (下载失败)"
        ((FAIL_COUNT++))
    fi
done

echo ""
echo "================================"
echo "下载完成!"
echo "成功: $SUCCESS_COUNT 个文件"
echo "失败: $FAIL_COUNT 个文件"
echo ""

# 显示文件列表
echo "下载的文件:"
ls -lh "$TARGET_DIR"/*.webp 2>/dev/null | awk '{print $NF, $5}'