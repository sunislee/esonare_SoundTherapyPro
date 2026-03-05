#!/bin/bash

# ============================================================
# 心声冥想 - 音频资源上传脚本（HTTP 上传版）
# 用途：通过 HTTP POST 上传文件到腾讯云服务器
# ============================================================

# 腾讯云服务器配置
TENCENT_SERVER="43.138.58.71"
UPLOAD_PORT="80"  # 使用 HTTP 端口

# Windows 服务器目标路径
REMOTE_BASE_DIR="http://$TENCENT_SERVER/upload/"

# 本地临时目录
TEMP_DIR="./temp_audio_upload"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  心声冥想 - 音频资源上传工具${NC}"
echo -e "${GREEN}  (HTTP 上传版 - 无需 SSH)${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""

# 检查本地目录
if [ ! -d "$TEMP_DIR" ]; then
    echo -e "${YELLOW}临时目录不存在：$TEMP_DIR${NC}"
    echo ""
    echo -e "${GREEN}正在从 Gitee 下载音频文件...${NC}"
    mkdir -p "$TEMP_DIR/base" "$TEMP_DIR/fx" "$TEMP_DIR/interactive"
    
    # 定义需要下载的音频文件
    declare -a AUDIO_FILES=(
        "base/deep_ocean_abyss.m4a"
        "base/foggy_forest_ritual.m4a"
        "base/deep_sea_breathing_rhythm.m4a"
        "base/misty_woods_dripping.m4a"
        "base/morning_river.mp3"
        "base/night_tribe.mp3"
        "base/rain_boat.mp3"
        "fx/library_vibe.m4a"
        "fx/zen_bowl.m4a"
        "base/liquid_peace.m4a"
        "base/crystal_bowl.m4a"
        "base/alpha_wave.m4a"
        "base/binaural_beat.mp3"
        "interactive/white_noise.m4a"
        "interactive/wind-chime.m4a"
        "interactive/breath.m4a"
        "interactive/apple_crunch.m4a"
        "interactive/match_strike.wav"
    )
    
    # 从 Gitee 下载
    GITEE_BASE="https://gitee.com/sunislee/sound-therapy-assets/raw/master"
    
    for file in "${AUDIO_FILES[@]}"; do
        echo -n "下载 $file ... "
        curl -sL "$GITEE_BASE/$file" -o "$TEMP_DIR/$file"
        if [ -f "$TEMP_DIR/$file" ] && [ -s "$TEMP_DIR/$file" ]; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗ 失败${NC}"
        fi
    done
    
    echo ""
    echo -e "${GREEN}下载完成！${NC}"
fi

# 检查下载的文件
FILE_COUNT=$(find "$TEMP_DIR" -type f \( -name "*.mp3" -o -name "*.m4a" -o -name "*.wav" \) | wc -l)
echo "本地音频文件数量：$FILE_COUNT"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo -e "${RED}错误：没有找到任何音频文件${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}重要提示：${NC}"
echo "由于腾讯云服务器是 Windows 系统，需要通过以下方式之一上传："
echo ""
echo "方案 A: 在 Windows 服务器上运行 PowerShell 下载脚本（推荐）"
echo "方案 B: 使用 Windows 文件共享 (SMB)"
echo "方案 C: 使用 FTP/SFTP 工具（如 FileZilla）"
echo ""

# 生成 PowerShell 下载脚本
POWERSHELL_SCRIPT="./upload_to_tencent.ps1"
cat > "$POWERSHELL_SCRIPT" << 'PSEOF'
# ============================================================
# 心声冥想 - PowerShell 上传脚本
# 用途：在 Windows 服务器上执行，从 Gitee 下载所有音频资源
# ============================================================

$ErrorActionPreference = "Stop"

# 配置
$DownloadBase = "https://gitee.com/sunislee/sound-therapy-assets/raw/master"
$TargetDir = "C:\Users\Administrator\Desktop\nginx-1.24.0\nginx-1.24.0\html\resources"

# 音频文件列表
$AudioFiles = @(
    "base/deep_ocean_abyss.m4a",
    "base/foggy_forest_ritual.m4a",
    "base/deep_sea_breathing_rhythm.m4a",
    "base/misty_woods_dripping.m4a",
    "base/morning_river.mp3",
    "base/night_tribe.mp3",
    "base/rain_boat.mp3",
    "fx/library_vibe.m4a",
    "fx/zen_bowl.m4a",
    "base/liquid_peace.m4a",
    "base/crystal_bowl.m4a",
    "base/alpha_wave.m4a",
    "base/binaural_beat.mp3",
    "interactive/white_noise.m4a",
    "interactive/wind-chime.m4a",
    "interactive/breath.m4a",
    "interactive/apple_crunch.m4a",
    "interactive/match_strike.wav"
)

Write-Host "==================================" -ForegroundColor Green
Write-Host "  心声冥想 - 音频资源下载工具" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""

# 创建目录
Write-Host "创建目录结构..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$TargetDir\base" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\fx" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\interactive" | Out-Null

# 下载文件
$Success = 0
$Failed = 0

foreach ($file in $AudioFiles) {
    $Url = "$DownloadBase/$file"
    $TargetPath = Join-Path $TargetDir $file
    
    Write-Host "下载 $file ... " -NoNewline
    
    try {
        Invoke-WebRequest -Uri $Url -OutFile $TargetPath -UseBasicParsing
        if (Test-Path $TargetPath) {
            Write-Host "✓" -ForegroundColor Green
            $Success++
        } else {
            Write-Host "✗ 文件不存在" -ForegroundColor Red
            $Failed++
        }
    } catch {
        Write-Host "✗ $($_.Exception.Message)" -ForegroundColor Red
        $Failed++
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "  下载完成！" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host "成功：$Success 个文件" -ForegroundColor Green
Write-Host "失败：$Failed 个文件" -ForegroundColor Yellow
Write-Host ""

if ($Failed -eq 0) {
    Write-Host "所有音频文件已下载到：$TargetDir" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步：" -ForegroundColor Yellow
    Write-Host "1. 重启 Nginx: nginx -s stop && start nginx" -ForegroundColor White
    Write-Host "2. 测试访问：curl http://localhost/resources/base/ocean.mp3" -ForegroundColor White
}
PSEOF

echo -e "${GREEN}已生成 PowerShell 脚本：$POWERSHELL_SCRIPT${NC}"
echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  操作步骤${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo "1️⃣  在 Windows 服务器上："
echo "   - 复制 $POWERSHELL_SCRIPT 到服务器"
echo "   - 右键 → 使用 PowerShell 运行"
echo ""
echo "2️⃣  或者手动下载："
echo "   - 在服务器上打开浏览器"
echo "   - 访问 https://gitee.com/sunislee/sound-therapy-assets"
echo "   - 下载所有音频文件到 resources 目录"
echo ""
echo "3️⃣  验证："
echo "   curl -I http://43.138.58.71/resources/base/ocean.mp3"
echo ""
