#!/bin/bash

# 测试MIME类型的脚本
SERVER_IP="43.138.58.71"

# 测试HTML文件的MIME类型
echo "=== 测试HTML文件的MIME类型 ==="
curl -I "http://$SERVER_IP/index.html" | grep -i "content-type"

# 测试JavaScript文件的MIME类型（如果存在）
echo "=== 测试JavaScript文件的MIME类型 ==="
curl -I "http://$SERVER_IP/web-build/index.html" | grep -i "content-type"

# 测试CDN JavaScript资源的MIME类型
echo "=== 测试CDN JavaScript资源的MIME类型 ==="
curl -I "https://unpkg.com/react@18.2.0/umd/react.production.min.js" | grep -i "content-type"

# 检查服务器状态
echo "=== 检查服务器状态 ==="
curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP"
echo ""

# 检查文件是否存在
echo "=== 检查文件是否存在 ==="
curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP/index.html"
echo "index.html"
curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP/web-build/index.html"
echo "web-build/index.html"
