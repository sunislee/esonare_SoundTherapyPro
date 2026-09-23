#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# 8 轨分频段资产的「真实频谱」校验器（替代 volumedetect 探针）
#
# 【为什么需要它】
# verify_8track_bands.sh 原先用 `ffmpeg -af highpass=f=hi*2,volumedetect` 量带外残留，
# 这个判据是错的，会把合格资产判成 FAIL（实测 balanced_noise 8 条全 FAIL）：
#   1. 探针只有单个 2 阶 biquad（-12 dB/oct），交越区（hi ~ 2·hi）里轨道自身的强能量
#      直接漏进探针 → 把「带内」算成了「带外」；
#   2. volumedetect 的 mean_volume 是时域平均幅度，对已被压到 -60 dB 以下的残留
#      会被 MP3 块窗口伪影 / 解码器过冲主导，读数与频段无关。
# 结果：判据给出 13–25 dB 的假低值，而按功率谱积分的真实带外衰减是 30–80 dB。
#
# 【本脚本的做法】
# 直接解码成 float PCM，用 Welch 平均周期图求单边功率谱密度，再按频带做功率积分：
#   in_band      = ∫ PSD(lo..hi)
#   lower_leak   = ∫ PSD(20..lo/2)      → REJ_LO = in_band − lower_leak
#   upper_leak   = ∫ PSD(hi*2..20 kHz)  → REJ_HI = in_band − upper_leak
# 与生成脚本 split_8track_bands.sh 使用同一组分频点，判据物理意义明确、可复现。
#
# 用法: verify_bands_spectrum.py <轨道目录> [前缀] [阈值dB]
# 退出码 = 未达标项数（0 = 全绿）
# ─────────────────────────────────────────────────────────────────────────────
import os
import subprocess
import sys

import numpy as np

SR = 44100
BANDS = [(20, 100), (100, 250), (250, 630), (630, 1600),
         (1600, 4000), (4000, 8000), (8000, 12000), (12000, 20000)]
LABELS = ['Sub-Bass', 'Bass', 'Low-Mid', 'Mid',
          'High-Mid', 'Presence', 'Brilliance', 'Air']


def decode(path):
    """把任意音频解码成 float32 单声道数组（不落临时文件）。"""
    p = subprocess.run(
        ['ffmpeg', '-nostdin', '-v', 'error', '-i', path,
         '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
        stdout=subprocess.PIPE, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)


def welch_psd(x, nperseg=16384):
    """Welch 平均周期图 → 单边功率谱密度 (V²/Hz)。"""
    hop = nperseg // 2
    win = np.hanning(nperseg)
    acc, cnt = None, 0
    for s in range(0, max(1, len(x) - nperseg), hop):
        seg = x[s:s + nperseg] * win
        p = np.abs(np.fft.rfft(seg)) ** 2
        acc = p if acc is None else acc + p
        cnt += 1
        if s + nperseg >= len(x):
            break
    return np.fft.rfftfreq(nperseg, 1 / SR), acc / cnt / (np.sum(win ** 2) * SR)


def band_db(f, psd, lo, hi):
    m = (f >= lo) & (f < hi)
    if not m.any():
        return -np.inf
    # numpy 2.x 用 trapezoid，1.x 只有 trapz
    integ = getattr(np, 'trapezoid', None) or np.trapz
    return 10 * np.log10(max(integ(psd[m], f[m]), 1e-300))


def main():
    d = sys.argv[1]
    prefix = sys.argv[2] if len(sys.argv) > 2 else 'balanced_noise'
    thresh = float(sys.argv[3]) if len(sys.argv) > 3 else 25.0

    fails, rms_list = 0, []
    print(f"{'TRK':<4} {'LABEL':<11} {'BAND(Hz)':<13} {'IN(dB)':>8} "
          f"{'REJ_LO':>8} {'REJ_HI':>8}  RESULT")
    for i, (lo, hi) in enumerate(BANDS, start=1):
        path = os.path.join(d, f'{prefix}_track_{i}.mp3')
        if not os.path.exists(path):
            print(f'T{i:<3} MISSING {path}')
            fails += 1
            continue
        x = decode(path)
        f, psd = welch_psd(x)
        inb = band_db(f, psd, lo, hi)
        rms = 20 * np.log10(max(np.sqrt(np.mean(x ** 2)), 1e-12))
        rms_list.append(rms)

        rlo = inb - band_db(f, psd, 20, max(lo / 2, 21)) if lo > 40 else float('nan')
        rhi = inb - band_db(f, psd, min(hi * 2, 20000), 20000)

        ok = (rlo >= thresh or np.isnan(rlo)) and rhi >= thresh
        fails += 0 if ok else 1
        print(f'T{i:<3} {LABELS[i-1]:<11} {f"{lo}-{hi}":<13} {inb:8.1f} '
              f'{rlo:8.1f} {rhi:8.1f}  {"PASS" if ok else "FAIL"}')

    spread = max(rms_list) - min(rms_list) if rms_list else 99
    print(f"\n带外衰减门槛 ≥{thresh:.0f} dB")
    print(f'轨间 RMS 极差 = {spread:.1f} dB')
    print('✅ 频谱隔离度全部达标' if fails == 0 else f'❌ {fails} 条轨道隔离度不足')
    return fails


if __name__ == '__main__':
    sys.exit(main())
