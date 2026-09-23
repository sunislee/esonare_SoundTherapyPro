#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 8 轨分频段资产校验门禁（上传 assets 仓库前必须全绿）
#
# 四道闸门：
#   ① 频谱隔离度 —— 交给 verify_bands_spectrum.py（Welch PSD 功率积分）。
#      ⚠️ 旧版这里用 `highpass=f=hi*2,volumedetect` 探针，判据是错的：探针自身只有
#      2 阶 -12 dB/oct，交越区里轨道自身的能量被当成"带外残留"，把合格资产判成
#      13–25 dB 的假低值（真实值 30–80 dB）。别再改回那种测法。
#   ② 连续性 —— 时长 >180 s 且中段无 ≥2 s 静音。这是 df843460 事故（8 轨只有开头
#      0.97 s 有声，之后纯静音）的直接闸门；ffprobe duration 会被静音尾巴骗到，
#      必须 silencedetect，并排除结尾 3 s 收尾淡出。
#   ③ MD5 唯一性 —— df843460 的原始症状就是"同一坏文件复制 8 遍"。
#   ④ 叠播安全 —— 8 条 mean_volume 极差 ≤ RMS_SPREAD dB；amix 后峰值 ≤ PEAK_MAX
#      dBFS（App 侧 Track8ControlPanel.tsx:193 默认 8 轨全 1.0，无余量即真机削波）。
#
# 用法: scripts/verify_8track_bands.sh <轨道目录> [前缀] [隔离阈值dB] [RMS极差dB] [峰值上限dB]
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
exec < /dev/null   # 防止 ffmpeg 读 stdin 在后台触发 SIGTTIN 把进程组停住

DIR="${1:?用法: verify_8track_bands.sh <轨道目录> [前缀] [隔离阈值dB] [RMS极差dB]}"
PREFIX="${2:-balanced_noise}"
THRESH="${3:-25}"
RMS_SPREAD="${4:-3}"
PEAK_MAX="${5:--1.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mean_of() { # $1=file  $2=filter chain(可空)
  local af="${2:-}"
  [ -n "$af" ] && af="$af,"
  ffmpeg -nostdin -hide_banner -i "$1" -af "${af}volumedetect" -f null - 2>&1 \
    | grep mean_volume | sed 's/.*mean_volume: //; s/ dB//'
}

md5_of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }

fails=0

echo "── ① 频谱隔离度（PSD 功率积分，门槛 ≥${THRESH} dB）──"
if command -v python3 >/dev/null 2>&1 && python3 -c 'import numpy' >/dev/null 2>&1; then
  python3 "$HERE/verify_bands_spectrum.py" "$DIR" "$PREFIX" "$THRESH" || fails=$((fails + 1))
else
  echo "⚠️  缺少 python3 / numpy，无法做频谱隔离度检测（视为未通过，禁止跳过上传）"
  fails=$((fails + 1))
fi

echo ""
echo "── ② 连续性闸门（时长 >180s、中段无 ≥2s 静音）+ ③ MD5 唯一性 ──"
md5_all=()
for i in 1 2 3 4 5 6 7 8; do
  f="$DIR/${PREFIX}_track_$i.mp3"
  [ -f "$f" ] || { printf 'T%-3s MISSING %s\n' "$i" "$f"; fails=$((fails + 1)); continue; }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  ffmpeg -nostdin -i "$f" -af silencedetect=noise=-55dB:d=2 -f null - 2>"/tmp/sd_$$_$i.log"
  bad=$(sed -n 's/.*silence_start: //p' "/tmp/sd_$$_$i.log" | awk -v d="$dur" '{if ($1+0 < d-3) c++} END{print c+0}')
  rm -f "/tmp/sd_$$_$i.log"
  m=$(md5_of "$f"); md5_all+=("$m")
  okdur=$(awk -v d="$dur" 'BEGIN{print (d>180)?1:0}')
  if [ "$okdur" = "1" ] && [ "$bad" = "0" ]; then st=PASS; else st=FAIL; fails=$((fails + 1)); fi
  printf 'T%-3s dur=%7.2fs mid_silence=%s md5=%s %s\n' "$i" "$dur" "$bad" "${m:0:8}" "$st"
done
uniq_md5=$(printf '%s\n' "${md5_all[@]}" | sort -u | grep -c .)
if [ "$uniq_md5" = "8" ]; then dup_v=PASS; else dup_v="FAIL(仅 $uniq_md5/8 唯一)"; fails=$((fails + 1)); fi
echo "MD5 唯一性 = ${uniq_md5}/8 → $dup_v"

echo ""
echo "── ④ 响度一致性 + 叠播削波 ──"
rms_all=()
for i in 1 2 3 4 5 6 7 8; do
  f="$DIR/${PREFIX}_track_$i.mp3"
  [ -f "$f" ] && rms_all+=("$(mean_of "$f" "")")
done
# 注意：值以 '-' 开头，绝不能写成 printf "$rms_all"（会被当成选项 → 极差算成垃圾值并误判 PASS）
spread=$(printf '%s\n' "${rms_all[@]}" | awk -v want=8 '
  BEGIN{min=1e9; max=-1e9}
  NF{n++; if($1<min)min=$1; if($1>max)max=$1}
  END{if(n<want){print "nan"} else printf "%.1f", max-min}')
if [ "$spread" = "nan" ]; then
  rms_v="FAIL(仅取到 ${#rms_all[@]}/8 条读数)"; fails=$((fails + 1))
elif awk -v s="$spread" -v t="$RMS_SPREAD" 'BEGIN{exit !(s<=t)}'; then
  rms_v=PASS
else
  rms_v=FAIL; fails=$((fails + 1))
fi
echo "8 轨 mean_volume 极差 = ${spread} dB (门槛 ≤${RMS_SPREAD}dB) → $rms_v"

files=""
for i in 1 2 3 4 5 6 7 8; do files="$files -i $DIR/${PREFIX}_track_$i.mp3"; done
peak=$(ffmpeg -nostdin -hide_banner $files -filter_complex "amix=inputs=8:normalize=0,volumedetect" -f null - 2>&1 \
       | grep max_volume | sed 's/.*max_volume: //; s/ dB//')
if [ -n "$peak" ] && awk -v p="$peak" -v m="$PEAK_MAX" 'BEGIN{exit !(p<=m)}'; then mix_v=PASS; else mix_v=FAIL; fails=$((fails+1)); fi
echo "8 轨 unity 叠播峰值 = ${peak:-?} dBFS (门槛 ≤${PEAK_MAX}) → $mix_v"

echo ""
if [ "$fails" -eq 0 ]; then
  echo "✅ 全部通过，可上传 assets 仓库"
  echo "   记得同步 src/constants/audioAssets.ts 的 size / expectedSize（DownloaderService.ts:612 严格 !== 校验）"
else
  echo "❌ 有 $fails 项未达标，禁止上传"
fi
exit "$fails"
