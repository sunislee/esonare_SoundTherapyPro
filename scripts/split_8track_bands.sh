#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 8 轨分频段资产生成（办公室 / balanced_noise 等降噪场景）
#
# 【为什么不用 split_freq.py】
# split_freq.py 用 pydub 的 high_pass_filter / low_pass_filter，二者都是 **2 阶
# biquad（12 dB/oct）**，滚降极缓；再叠加统一 `apply_gain(20)`，导致 8 条轨道频段
# 严重互相串扰。实测线上 balanced_noise_track_1..8.mp3：
#   · Track 8（号称 12k–20kHz）低通到 12kHz 后能量 0 dB 不掉 → 根本没切掉低频
#   · Track 1（号称 20–100Hz）高通到 630Hz 只掉 12.6 dB → 根本不是窄带低频
#   · 8 条 mean_volume 从 -5.3dB 递减到 -19.7dB，跨 14dB → 叠播时低频轨主导
# 用户听感即"8 个频段的声音不对"：拉任何一根滑杆都在动整条全频带。
#
# 【本脚本的做法】
#   1. ffmpeg highpass/lowpass 各 **级联 3 次 2 阶** = 每边 6 阶 ≈ 36 dB/oct，
#      相邻频段边界处带外衰减实测 35–90 dB（白噪音物理带宽差导致的除外）。
#   2. 逐条 **静态增益归一化** 到同一 mean_volume（默认 -26 dB）：白噪音每 Hz 等
#      能量，12k–20kHz 天然比 20–100Hz 低约 40dB，不归一化则高频滑杆拉满也听不见。
#      用静态 volume 而非 loudnorm，避免动态压缩破坏频段特性。
#   3. 8 条并行生成（-threads 1 + 后台 & ），全量约 2 分钟。
#
# 用法:
#   scripts/split_8track_bands.sh <源音频> <输出目录> [文件名前缀] [目标mean_volume dB]
# 例:
#   scripts/split_8track_bands.sh input_audio/balanced_noise.m4a /tmp/out8 balanced_noise -26
#
# ⚠️ 生成后必须跑 scripts/verify_8track_bands.sh 校验，再上传 assets 仓库；
#    上传后同步更新 src/constants/audioAssets.ts 里对应条目的 size / expectedSize
#    （DownloaderService.ts:612 是严格 `!==` 校验，尺寸不一致会判定损坏并无限重下）。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# ffmpeg 默认会读 stdin 接收交互按键；一旦本脚本被丢到终端后台（& / nohup），
# 那次读取会触发 SIGTTIN 把整条进程组**停住**（STAT=T，看起来像"卡死"实则零产出）。
exec < /dev/null

SRC="${1:?用法: split_8track_bands.sh <源音频> <输出目录> [前缀] [目标mean_volume dB]}"
OUT="${2:?请指定输出目录}"
PREFIX="${3:-balanced_noise}"
TARGET="${4:--26}"
BITRATE="${BITRATE:-192k}"
DURATION="${DURATION:-185}"   # 与线上资产保持一致的 185s

command -v ffmpeg >/dev/null || { echo "❌ 需要 ffmpeg"; exit 1; }
mkdir -p "$OUT"

# 频段定义（与 split_freq.py 的分界点一致，便于对照）
LOWS=(20 100 250 630 1600 4000 8000 12000)
HIGHS=(100 250 630 1600 4000 8000 12000 20000)
LABELS=(Sub-Bass Bass Low-Mid Mid High-Mid Presence Brilliance Air)

# 单个 2 阶级联 3 次 → 每边 6 阶 ≈ 36 dB/oct
cascade() { printf '%s=f=%s:p=2,%s=f=%s:p=2,%s=f=%s:p=2' "$1" "$2" "$1" "$2" "$1" "$2"; }

echo "🎚️  源: $SRC"
echo "📂 输出: $OUT   前缀: $PREFIX   目标 mean_volume: ${TARGET} dB   时长: ${DURATION}s"

# 先把源循环/裁剪到目标时长，避免每条轨道重复处理
LOOPED="$OUT/.looped_src.m4a"
ffmpeg -hide_banner -v error -stream_loop 8 -i "$SRC" -t "$DURATION" -c copy "$LOOPED" -y

for i in 0 1 2 3 4 5 6 7; do
  n=$((i + 1)); lo=${LOWS[i]}; hi=${HIGHS[i]}; label=${LABELS[i]}
  af="$(cascade highpass "$lo"),$(cascade lowpass "$hi")"
  (
    tmp="$OUT/.raw_$n.mp3"
    dst="$OUT/${PREFIX}_track_$n.mp3"
    ffmpeg -hide_banner -v error -threads 1 -i "$LOOPED" -af "$af" \
           -c:a libmp3lame -b:a "$BITRATE" -ar 44100 "$tmp" -y
    raw=$(ffmpeg -hide_banner -i "$tmp" -af volumedetect -f null - 2>&1 \
          | grep mean_volume | sed 's/.*mean_volume: //; s/ dB//')
    delta=$(awk -v t="$TARGET" -v m="$raw" 'BEGIN{printf "%.2f", t-m}')
    ffmpeg -hide_banner -v error -threads 1 -i "$tmp" -af "volume=${delta}dB" \
           -c:a libmp3lame -b:a "$BITRATE" -ar 44100 "$dst" -y
    rm -f "$tmp"
    printf 'T%s %-11s %5s-%-5sHz  raw=%7sdB  gain=%+7sdB\n' "$n" "$label" "$lo" "$hi" "$raw" "$delta"
  ) &
done
wait

rm -f "$LOOPED"
echo ""
echo "✅ 8 条轨道生成完毕 → $OUT"
echo "   下一步: scripts/verify_8track_bands.sh $OUT"
