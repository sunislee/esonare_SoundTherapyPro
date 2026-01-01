#!/usr/bin/env python3
import os
import math
from pydub import AudioSegment

class HealingRainMixer:
    def __init__(self):
        # --- 1. 路径配置 ---
        self.rain_path = "自然音频/天窗上循环雨滴音效纹理.wav"
        self.fire_path = "自然音频/fire.aiff"
        self.output_path = "final_healing_rain.wav"
        
        # --- 2. 调音台配置 (李上专属 - 压缩版) ---
        self.duration_min = 2.5     # 合成时长（分钟）- 压缩到2.5分钟
        self.sample_rate = 22050    # 采样率压缩到22050Hz，减少文件大小
        self.rain_volume = -20      # 雨声：设为背景底噪
        self.fire_volume = -15      # 火声：稍微明显一点点
        self.fire_pan = 0.4         # 火声偏右，拉开立体声感
        self.low_pass_freq = 1500   # 关键：切掉高频噪音，声音会变温润
        self.fade_time_ms = 3000    # 3秒淡入，减少处理时间
        
    def run(self):
        print("🎬 正在启动李上的书屋音频引擎...")
        
        try:
            # 安全加载 (使用压缩采样率)
            rain = AudioSegment.from_file(self.rain_path).set_frame_rate(self.sample_rate).set_channels(2)
            fire = AudioSegment.from_file(self.fire_path).set_frame_rate(self.sample_rate).set_channels(2)
            
            # 声学美化：模拟隔窗听雨
            print(f"🧱 正在进行声学隔音过滤...")
            rain = rain.low_pass_filter(self.low_pass_freq) 
            
            # 循环计算
            target_ms = self.duration_min * 60 * 1000
            def loop_to_duration(segment, duration):
                loops = math.ceil(duration / len(segment))
                return (segment * loops)[:duration]

            print(f"🔄 正在铺设 {self.duration_min} 分钟音轨...")
            full_rain = loop_to_duration(rain, target_ms)
            full_fire = loop_to_duration(fire, target_ms)

            # 音量与方位
            full_rain = full_rain + self.rain_volume
            full_fire = full_fire + self.fire_volume
            full_fire = full_fire.pan(self.fire_pan)
            
            # 最终混音（正确逻辑：combined = A.overlay(B)）
            print("🏗️ 正在多轨无损合成...")
            combined = full_rain.overlay(full_fire)
            
            # 增加呼吸感
            combined = combined.fade_in(self.fade_time_ms).fade_out(self.fade_time_ms)
            
            # 导出
            print(f"💾 正在导出至: {self.output_path}")
            combined.export(self.output_path, format="wav")
            
            print("\n" + "✨" * 15)
            print("✅ 制作成功！")
            print(f"🎧 播放命令: open {self.output_path}")
            print("✨" * 15)
            
        except Exception as e:
            print(f"❌ 脚本运行出错了，可能是环境没配好: {e}")

if __name__ == "__main__":
    mixer = HealingRainMixer()
    mixer.run()