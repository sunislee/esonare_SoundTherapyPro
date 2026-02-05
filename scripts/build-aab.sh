#!/bin/bash

# 设置颜色变量
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 切换到项目根目录
cd "$(dirname "$0")/.." || exit

echo "开始构建 AAB 包..."

# 切换到 android 目录
cd android || exit

# 清理构建缓存
echo "清理构建缓存..."
./gradlew clean

# 配置 Gradle 并行构建和 JVM 内存
export GRADLE_OPTS="-Xmx8g -XX:MaxMetaspaceSize=1g"
export ORG_GRADLE_PROJECT_org_gradle_parallel=true

# 构建 AAB 包
echo "构建 Release 版本 AAB 包..."
./gradlew bundleRelease

# 检查构建是否成功
if [ $? -eq 0 ]; then
    echo "\n${GREEN}构建成功！${NC}"
    
    # 查找生成的 AAB 文件
    AAB_FILE=$(find app/build/outputs/bundle/release -name "*.aab" | head -1)
    
    if [ -f "$AAB_FILE" ]; then
        # 打印绝对路径
        ABSOLUTE_PATH=$(realpath "$AAB_FILE")
        echo "\n${GREEN}生成的 AAB 文件路径：${NC}"
        echo "${GREEN}$ABSOLUTE_PATH${NC}"
    else
        echo "\n未找到生成的 AAB 文件"
    fi
else
    echo "\n构建失败，请检查错误信息"
    exit 1
fi