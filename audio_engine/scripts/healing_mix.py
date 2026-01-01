#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
雨夜书屋音频混音脚本
更新版本：适配新的音频素材目录结构
"""

import os
import sys
import math
from pathlib import Path

try:
    from pydub import AudioSegment
    from pydub.effects import low_pass_filter
except ImportError as e:
    print(f"缺少依赖包: {e}")
    print("请运行: pip install -r ../requirements.txt")
    sys.exit(1)

class HealingRainMixer:
    def __init__(self):
        # --- 1. 路径配置 - 适配新的目录结构 ---
        script_dir = Path(__file__).parent
        assets_dir = script_dir.parent / "raw_assets"
        
        self.rain_path = assets_dir / "rain" / "天窗上循环雨滴音效纹理.wav"
        self.fire_path = assets_dir / "fire" / "fire.aiff"
        self.bird_path = assets_dir / "bird" / "溪流伴随鸟叫.mp3"
        self.output_path = script_dir / "final_healing_rain.wav"
        
        # --- 2. 雨夜书屋音频参数配置 ---
        self.duration_min = 5.0      # 合成时长（分钟）
        self.sample_rate = 44100     # 标准采样率，保持音质
        self.rain_volume = -18       # 雨声：-18dB（项目要求）
        self.fire_volume = -12       # 火声：-12dB（项目要求）
        self.bird_volume = -20       # 鸟鸣：作为装饰音
        self.fire_pan = 0.3          # 火声轻微偏右
        self.low_pass_freq = 1500    # 低通滤波：1500Hz（项目要求）
        self.fade_time_ms = 2000     # 2秒淡入淡出
        
    def run(self):
        print("�️ 雨夜书屋音频引擎启动中...")
        print(f"📁 音频素材路径: {Path(self.rain_path).parent}")
        
        try:
            # 检查文件是否存在
            if not self.rain_path.exists():
                raise FileNotFoundError(f"雨声音频文件不存在: {self.rain_path}")
            if not self.fire_path.exists():
                raise FileNotFoundError(f"火声音频文件不存在: {self.fire_path}")
            
            print(f"🎵 正在加载音频文件...")
            print(f"  - 雨声: {self.rain_path.name}")
            print(f"  - 火声: {self.fire_path.name}")
            
            # 加载音频文件
            rain = AudioSegment.from_file(str(self.rain_path))
            fire = AudioSegment.from_file(str(self.fire_path))
            
            # 检查是否有鸟鸣文件
            bird = None
            if self.bird_path.exists():
                bird = AudioSegment.from_file(str(self.bird_path))
                print(f"  - 鸟鸣: {self.bird_path.name}")
            
            # 应用项目要求的音频处理
            print(f"🎛️ 应用音频参数...")
            print(f"  - 雨声音量: {self.rain_volume} dB")
            print(f"  - 火声音量: {self.fire_volume} dB") 
            print(f"  - 低通滤波: {self.low_pass_freq} Hz")
            
            # 低通滤波处理
            rain_filtered = rain.low_pass_filter(self.low_pass_freq)
            fire_filtered = fire.low_pass_filter(self.low_pass_freq)
            
            if bird:
                bird_filtered = bird.low_pass_filter(self.low_pass_freq)
            
            # 循环计算
            target_ms = int(self.duration_min * 60 * 1000)
            def loop_to_duration(segment, duration):
                loops = math.ceil(duration / len(segment))
                return (segment * loops)[:duration]

            print(f"🔄 循环扩展到 {self.duration_min} 分钟...")
            full_rain = loop_to_duration(rain_filtered, target_ms)
            full_fire = loop_to_duration(fire_filtered, target_ms)
            
            if bird:
                full_bird = loop_to_duration(bird_filtered, target_ms)
            
            # 音量调整
            full_rain = full_rain + self.rain_volume
            full_fire = full_fire + self.fire_volume
            full_fire = full_fire.pan(self.fire_pan)
            
            if bird:
                full_bird = full_bird + self.bird_volume
            
            # 开始混音
            print("�️ 开始多轨混音...")
            combined = full_rain.overlay(full_fire)
            
            if bird:
                combined = combined.overlay(full_bird)
            
            # 添加淡入淡出效果
            print(f"✨ 添加 {self.fade_time_ms/1000}秒 淡入淡出效果...")
            combined = combined.fade_in(self.fade_time_ms).fade_out(self.fade_time_ms)
            
            # 导出文件
            print(f"💾 正在导出到: {self.output_path}")
            combined.export(str(self.output_path), format="wav")
            
            # 成功信息
            file_size = self.output_path.stat().st_size / (1024 * 1024)  # MB
            print("\n" + "🌧️" * 20)
            print("✅ 雨夜书屋音频制作完成！")
            print(f"📊 文件大小: {file_size:.2f} MB")
            print(f"🎧 时长: {self.duration_min} 分钟")
            print(f"📁 位置: {self.output_path}")
            print("🌧️" * 20)
            
            return True
            
        except FileNotFoundError as e:
            print(f"❌ 文件未找到: {e}")
            return False
        except Exception as e:
            print(f"❌ 处理过程中出现错误: {e}")
            return False

if __name__ == "__main__":
    mixer = HealingRainMixer()
    success = mixer.run()
    if success:
        print("🎉 脚本执行成功！可以复制音频文件到移动应用了。")
    else:
        print("❌ 脚本执行失败，请检查错误信息。")
        sys.exit(1)