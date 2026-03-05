# Web 版本部署指南

## 当前状态
- ✅ 已生成最新的 `final_web.zip` 文件（包含精美 UI 界面）
- ✅ 本地打包完成，文件大小：4.9KB
- ❌ 服务器上的文件还是旧版本（需要手动更新）

## 部署步骤

### 方法 1：手动上传（推荐）

1. **下载打包文件**
   ```bash
   # 在 Mac 上找到文件位置
   ls -lh /Users/sunislee/Documents/trae_projects/esonare_SoundTherapyPro/final_web.zip
   ```

2. **通过远程桌面连接 Windows 服务器**
   - 服务器 IP：`43.138.58.71`
   - 用户名：`Administrator`
   - 密码：（你的密码）

3. **上传文件**
   - 将 `final_web.zip` 复制到 Windows 服务器桌面

4. **解压部署**
   - 右键点击 `final_web.zip`
   - 选择"全部提取..."
   - 目标路径：`C:\Users\Administrator\Desktop\nginx-1.24.0\html`
   - 勾选"覆盖现有文件"

5. **重启 Nginx**
   - 以管理员身份打开命令提示符
   - 执行：
     ```cmd
     cd C:\Users\Administrator\Desktop\nginx-1.24.0
     nginx -s stop
     nginx
     ```

### 方法 2：使用 PowerShell 远程执行

如果你的 Mac 和 Windows 服务器之间配置了 PowerShell Remoting：

```powershell
# 在 Mac 上安装 PowerShell
# 然后执行：
Enter-PSSession -ComputerName 43.138.58.71 -Credential Administrator

# 下载并解压
Invoke-WebRequest -Uri "http://你的 MacIP/final_web.zip" -OutFile "C:\Users\Administrator\Desktop\final_web.zip"
Expand-Archive -Path "C:\Users\Administrator\Desktop\final_web.zip" -DestinationPath "C:\Users\Administrator\Desktop\nginx-1.24.0\html" -Force

# 重启 Nginx
Stop-Process -Name nginx -Force
Start-Process -FilePath "C:\Users\Administrator\Desktop\nginx-1.24.0\nginx.exe"
```

## 验证部署

部署完成后，执行以下命令验证：

```bash
# 1. 检查页面内容
curl http://43.138.58.71/index.html | grep "心声冥想"

# 2. 检查 MIME 类型
curl -I http://43.138.58.71/index.html | grep "content-type"

# 3. 检查文件大小（新版本应该是 4.9KB 左右）
curl -s -o /dev/null -w "%{size_download}" http://43.138.58.71/index.html
```

## 预期结果

成功部署后，访问 `http://43.138.58.71` 应该看到：
- ✅ 紫色渐变背景
- ✅ 圆形 Logo（带"心"字）
- ✅ "心声冥想"大标题
- ✅ 四个功能卡片（专注冥想、深海呼吸、火焰之声、雨声白噪音）
- ✅ 加载动画效果

## 常见问题

### Q: 页面还是黑色的旧版本？
A: 清除浏览器缓存，按 `Ctrl+F5` 强制刷新

### Q: 404 错误？
A: 检查 Nginx 的 html 目录路径是否正确

### Q: MIME 类型错误？
A: 确保 Nginx 配置中包含 `include mime.types;`
