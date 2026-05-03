#!/usr/bin/env python3
"""
8 轨分频段批量处理脚本
功能：将输入音频拆分为 8 个独立频段轨道
"""

import os
import sys
from pathlib import Path
from pydub import AudioSegment
from pydub.effects import low_pass_filter, high_pass_filter

# ==================== 配置区域 ====================

# 输入输出目录
INPUT_DIR = Path(__file__).parent / "input_audio"
OUTPUT_DIR = Path(__file__).parent / "output_tracks"

# 8 段频率定义 (Hz)
# 分界点：20, 100, 250, 630, 1600, 4000, 8000, 12000, 20000
FREQUENCY_BANDS = [
    {"track": 1, "low": 20, "high": 100, "label": "Sub-Bass"},      # 超低频
    {"track": 2, "low": 100, "high": 250, "label": "Bass"},          # 低频
    {"track": 3, "low": 250, "high": 630, "label": "Low-Mid"},       # 中低频
    {"track": 4, "low": 630, "high": 1600, "label": "Mid"},          # 中频
    {"track": 5, "low": 1600, "high": 4000, "label": "High-Mid"},    # 中高频
    {"track": 6, "low": 4000, "high": 8000, "label": "Presence"},    # 临场感
    {"track": 7, "low": 8000, "high": 12000, "label": "Brilliance"}, # 辉煌感
    {"track": 8, "low": 12000, "high": 20000, "label": "Air"},       # 空气感
]

# 输出质量控制
OUTPUT_BITRATE = "192k"  # 比特率
OUTPUT_FORMAT = "mp3"    # 输出格式

# ==================== 核心函数 ====================

def split_audio_to_8_tracks(audio_file: Path, output_folder: Path) -> bool:
    """
    将单个音频文件拆分为 8 个频段轨道
    
    Args:
        audio_file: 输入音频文件路径
        output_folder: 输出文件夹路径
    
    Returns:
        bool: 是否成功
    """
    print(f"\n{'='*60}")
    print(f"🎵 处理文件：{audio_file.name}")
    print(f"{'='*60}")
    
    try:
        # 加载音频
        print(f"📥 加载音频文件...")
        original_audio = AudioSegment.from_file(audio_file)
        print(f"   ✅ 加载成功 - 时长：{len(original_audio)/1000:.1f}s, "
              f"采样率：{original_audio.frame_rate}Hz, "
              f"声道：{original_audio.channels}")
        
        # 创建输出目录
        output_folder.mkdir(parents=True, exist_ok=True)
        
        # 拆分 8 个频段
        success_count = 0
        for band in FREQUENCY_BANDS:
            track_num = band["track"]
            low_freq = band["low"]
            high_freq = band["high"]
            label = band["label"]
            
            print(f"\n   🎚️  Track {track_num}: {label} ({low_freq}-{high_freq}Hz)")
            
            try:
                # 应用滤波器
                # 先高通滤波（切除低频）
                filtered = high_pass_filter(original_audio, cutoff=low_freq)
                # 再低通滤波（切除高频）
                filtered = low_pass_filter(filtered, cutoff=high_freq)
                
                # 【关键修复】音量补偿：拆分后音量会下降，需要放大 20dB 补偿
                # 使用 pydub 的 gain 方法增加音量
                filtered = filtered.apply_gain(20)  # 增加 20dB
                
                # 导出文件
                output_path = output_folder / f"track_{track_num}.{OUTPUT_FORMAT}"
                filtered.export(
                    output_path,
                    format=OUTPUT_FORMAT,
                    bitrate=OUTPUT_BITRATE,
                    parameters=["-ar", str(original_audio.frame_rate)]  # 保持原采样率
                )
                
                print(f"      ✅ 导出成功：{output_path.name} (+10dB)")
                success_count += 1
                
            except Exception as e:
                print(f"      ❌ 失败：{str(e)}")
                continue
        
        print(f"\n✅ 完成：成功拆分 {success_count}/8 个轨道")
        return success_count == 8
        
    except Exception as e:
        print(f"❌ 处理失败：{str(e)}")
        import traceback
        traceback.print_exc()
        return False


def batch_process():
    """
    批量处理 input_audio 目录下的所有音频文件
    """
    print("\n" + "="*60)
    print("🎼 8 轨分频段批量处理脚本")
    print("="*60)
    
    # 检查输入目录
    if not INPUT_DIR.exists():
        print(f"❌ 输入目录不存在：{INPUT_DIR}")
        sys.exit(1)
    
    # 扫描所有音频文件
    audio_extensions = {'.m4a', '.mp3', '.wav', '.flac', '.aac', '.ogg'}
    audio_files = []
    
    for file in INPUT_DIR.iterdir():
        if file.suffix.lower() in audio_extensions:
            audio_files.append(file)
    
    if not audio_files:
        print(f"❌ 输入目录下没有找到音频文件")
        sys.exit(1)
    
    print(f"\n📂 输入目录：{INPUT_DIR}")
    print(f"📂 输出目录：{OUTPUT_DIR}")
    print(f"📊 找到 {len(audio_files)} 个音频文件")
    
    # 批量处理
    success_count = 0
    for audio_file in sorted(audio_files):
        # 生成输出文件夹名（去掉扩展名）
        output_folder_name = audio_file.stem
        output_folder = OUTPUT_DIR / output_folder_name
        
        if split_audio_to_8_tracks(audio_file, output_folder):
            success_count += 1
    
    # 输出统计
    print("\n" + "="*60)
    print("📊 批量处理完成")
    print("="*60)
    print(f"✅ 成功：{success_count}/{len(audio_files)} 组素材")
    print(f"📁 输出位置：{OUTPUT_DIR}")
    
    if success_count > 0:
        print(f"\n🎯 生成的素材组:")
        for folder in sorted(OUTPUT_DIR.iterdir()):
            if folder.is_dir():
                tracks = list(folder.glob("track_*.mp3"))
                print(f"   📂 {folder.name}/ - {len(tracks)} 个轨道")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    # 检查 pydub 是否安装
    try:
        import pydub
    except ImportError:
        print("❌ 未安装 pydub 库")
        print("请执行：pip3 install pydub")
        sys.exit(1)
    
    # 检查 ffmpeg 是否可用
    try:
        AudioSegment.from_file(INPUT_DIR / "test.m4a")
    except Exception:
        print("⚠️  警告：pydub 可能需要 ffmpeg")
        print("请执行：brew install ffmpeg")
    
    # 执行批量处理
    batch_process()
