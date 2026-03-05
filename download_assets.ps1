# ============================================================
# 心声冥想 - 音频资源下载脚本
# 用法：在 Windows 服务器 PowerShell 中直接运行
# ============================================================

# 配置
$DownloadBase = "https://gitee.com/sunislee/sound-therapy-assets/raw/master"
$TargetDir = "C:\Users\Administrator\Desktop\nginx-1.24.0\nginx-1.24.0\html\resources"

Write-Host "==================================" -ForegroundColor Green
Write-Host "  心声冥想 - 音频资源下载工具" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""

# 创建目录结构
Write-Host "创建目录..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$TargetDir\base" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\fx" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\interactive" | Out-Null

# 音频文件列表（18 个）
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
    Write-Host "2. 测试访问：curl http://localhost/resources/base/deep_ocean_abyss.m4a" -ForegroundColor White
}
