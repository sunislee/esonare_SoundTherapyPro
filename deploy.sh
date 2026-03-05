#!/bin/bash

# 部署脚本 - 用于将web-build打包并上传到腾讯云服务器

# 服务器信息
SERVER_IP="43.138.58.71"
SERVER_USER="Administrator"  # Windows用户名
SERVER_PATH="C:\\Users\\Administrator\\Desktop\\nginx-1.24.0\\html"
NGINX_CONF_PATH="C:\\Users\\Administrator\\Desktop\\nginx-1.24.0\\conf\\nginx.conf"

# 项目根目录
PROJECT_ROOT=$(pwd)

# 打包文件名
ZIP_FILE="final_web.zip"

# 步骤1: 打包web-build文件夹内容
echo "=== 开始打包web-build文件夹内容 ==="
cd web-build && zip -r "../$ZIP_FILE" * && cd ..

if [ $? -eq 0 ]; then
    echo "✅ 打包成功: $ZIP_FILE"
else
    echo "❌ 打包失败"
    exit 1
fi

# 步骤2: 上传到服务器
echo "=== 开始上传到服务器 $SERVER_IP ==="

# 上传打包文件
scp "$ZIP_FILE" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"

if [ $? -eq 0 ]; then
    echo "✅ 上传打包文件成功"
else
    echo "❌ 上传打包文件失败"
    exit 1
fi

# 上传Nginx配置文件（可选）
if [ -f "nginx.conf" ]; then
    echo "=== 上传Nginx配置文件 ==="
    scp "nginx.conf" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/nginx.conf.tmp"
    
    if [ $? -eq 0 ]; then
        echo "✅ 上传Nginx配置文件成功"
    else
        echo "⚠️  上传Nginx配置文件失败（非致命错误）"
    fi
fi

# 步骤3: 在服务器上解压并部署
echo "=== 在服务器上解压文件 ==="
# 使用Windows命令解压
ssh "$SERVER_USER@$SERVER_IP" "powershell -Command "& {cd '$SERVER_PATH'; Expand-Archive -Path '$ZIP_FILE' -DestinationPath '.' -Force; Remove-Item -Path '$ZIP_FILE' -Force}""

if [ $? -eq 0 ]; then
    echo "✅ 解压成功"
else
    echo "❌ 解压失败"
    exit 1
fi

# 步骤4: 检查并更新Nginx配置（可选）
if [ -f "nginx.conf" ]; then
    echo "=== 检查并更新Nginx配置 ==="
    # 使用Windows命令移动文件
    ssh "$SERVER_USER@$SERVER_IP" "powershell -Command "& {Move-Item -Path '$SERVER_PATH/nginx.conf.tmp' -Destination '$NGINX_CONF_PATH' -Force}""
    
    if [ $? -eq 0 ]; then
        echo "✅ Nginx配置更新成功"
        # 重启Nginx服务
        ssh "$SERVER_USER@$SERVER_IP" "powershell -Command "& {Stop-Process -Name nginx -Force -ErrorAction SilentlyContinue; Start-Process -FilePath 'C:\\Users\\Administrator\\Desktop\\nginx-1.24.0\\nginx.exe'}""
        if [ $? -eq 0 ]; then
            echo "✅ Nginx服务重启成功"
        else
            echo "⚠️  Nginx服务重启失败（可能需要手动重启）"
        fi
    else
        echo "⚠️  Nginx配置更新失败（可能需要手动检查）"
    fi
fi

# 步骤5: 清理本地临时文件
echo "=== 清理本地临时文件 ==="
rm "$ZIP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 清理成功"
else
    echo "❌ 清理失败"
    exit 1
fi

echo "🎉 部署完成！"
echo "可以通过 http://$SERVER_IP 访问部署后的页面"
echo ""
echo "请按照以下步骤检查："
echo "1. 打开浏览器访问 http://$SERVER_IP"
echo "2. 按下 F12 打开开发者工具"
echo "3. 查看 Console 标签页是否有报错"
echo "4. 如果有404错误，检查文件路径是否正确"
echo "5. 如果有MIME类型错误，检查Nginx配置是否包含 include mime.types;"
