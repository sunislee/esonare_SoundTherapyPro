#!/bin/bash

# Zen Assets 下载脚本
# 从 GitHub 仓库 sunislee/sound-therapy-assets 下载 zen 目录下的所有 .webp 图片

set -e  # 出错时退出

echo "开始下载 Zen 主题图片资源..."

# 创建目标目录
TARGET_DIR="$HOME/Downloads/zen"
mkdir -p "$TARGET_DIR"

# GitHub 原始文件链接模板（使用 raw.githubusercontent.com）
REPO_OWNER="sunislee"
REPO_NAME="sound-therapy-assets"
BRANCH="main"
BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/zen"

# 图片列表
IMAGES=(
    "bg_bamboo_mist.webp"
    "bg_bamboo_sunrise.webp"
    "bg_fountain_ritual.webp"
    "bg_guzheng_zen.webp"
    "bg_temple_lantern_gate.webp"
    "bg_temple_roof.webp"
    "bg_temple_zen_lantern.webp"
    "buddha_morning.webp"
    "dawn_temple_mist.webp"
)

echo "目标目录: $TARGET_DIR"
echo ""

# 下载每个图片
for IMAGE in "${IMAGES[@]}"; do
    URL="${BASE_URL}/${IMAGE}"
    OUTPUT="${TARGET_DIR}/${IMAGE}"
    
    echo "正在下载: ${IMAGE} ..."
    
    # 使用 curl 下载（macOS 自带）
    if curl -L -o "$OUTPUT" "$URL" 2>/dev/null; then
        if [ -f "$OUTPUT" ]; then
            echo "✓ 成功: $IMAGE"
        else
            echo "✗ 失败: $IMAGE (文件未创建)"
        fi
    else
        echo "✗ 失败: $IMAGE (下载失败)"
    fi
done

echo ""
echo "================================"
echo "下载完成!"
echo "图片保存位置: $TARGET_DIR"
echo "总计: ${#IMAGES[@]} 个文件"

# 显示文件列表和大小
echo ""
echo "下载的文件:"
ls -lh "$TARGET_DIR"/*.webp 2>/dev/null || echo "未找到 .webp 文件"