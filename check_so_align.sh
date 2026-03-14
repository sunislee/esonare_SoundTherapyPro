#!/bin/bash

# 16KB 对齐检查脚本
# 输出所有非 16KB 对齐的 .so 文件

READ ELF="/Users/sunislee/Library/Android/sdk/ndk/26.1.10909125/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf"
OUTPUT_FILE="/Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/so_align_report.txt"

echo "=== 16KB 对齐检查报告 ===" > $OUTPUT_FILE
echo "检查时间: $(date)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# 计数器
total=0
aligned_4k=0
aligned_16k=0
other=0

# 遍历所有 .so 文件
for so_file in $(find /tmp/aab137_audit/base/lib -name "*.so" -type f); do
    total=$((total + 1))
    
    # 获取第一个 LOAD segment 的对齐值
    align=$("$READ ELF" -l "$so_file" 2>/dev/null | grep "LOAD" | head -1 | awk '{print $NF}')
    
    if [ "$align" == "0x1000" ]; then
        echo "[4KB] $so_file" >> $OUTPUT_FILE
        aligned_4k=$((aligned_4k + 1))
    elif [ "$align" == "0x4000" ]; then
        echo "[16KB] $so_file" >> $OUTPUT_FILE
        aligned_16k=$((aligned_16k + 1))
    else
        echo "[OTHER:$align] $so_file" >> $OUTPUT_FILE
        other=$((other + 1))
    fi
done

echo "" >> $OUTPUT_FILE
echo "=== 统计汇总 ===" >> $OUTPUT_FILE
echo "总文件数：$total" >> $OUTPUT_FILE
echo "4KB 对齐：$aligned_4k" >> $OUTPUT_FILE
echo "16KB 对齐：$aligned_16k" >> $OUTPUT_FILE
echo "其他对齐：$other" >> $OUTPUT_FILE

echo "检查完成！报告已保存到：$OUTPUT_FILE"
cat $OUTPUT_FILE
