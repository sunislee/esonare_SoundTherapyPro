# GitHub Pages 404 错误修复指南

## 问题诊断

### 已发现的问题：
1. ❌ 缺少 GitHub Actions 工作流文件
2. ❌ `web-build` 目录缺少构建产物（bundle.js）
3. ❌ `package.json` 缺少 `homepage` 字段
4. ✅ `legal/` 目录的隐私政策页面已存在

## 已完成的修复

### 1. 创建 GitHub Actions 工作流
- ✅ 已创建 `.github/workflows/static.yml`
- 配置自动部署到 GitHub Pages
- 支持手动触发部署
- 自动复制 `legal/` 目录到构建产物

### 2. 更新 package.json
- ✅ 已添加 `homepage` 字段：
  ```json
  "homepage": "https://sunislee.github.io/esonare_SoundTherapyPro/"
  ```

### 3. 修复 webpack 配置
- ✅ 修改输出文件名为 `bundle.js`（与 `web/index.html` 中的引用匹配）
- ✅ 保持 `publicPath: './'` 确保相对路径正确

## 部署验证步骤

### 第一步：本地构建测试

在提交代码之前，先在本地测试构建：

```bash
# 1. 清理旧构建
rm -rf web-build/

# 2. 安装依赖（如果需要）
pnpm install

# 3. 执行构建
pnpm build:web

# 4. 检查构建产物
ls -la web-build/
```

**预期输出**：
```
web-build/
├── bundle.js          # 主应用 bundle
├── index.html         # 主页面
└── static/
    ├── css/          # CSS 文件
    ├── js/           # 代码分割的 chunk
    └── media/        # 图片等资源
```

### 第二步：测试 legal 目录

```bash
# 复制 legal 目录到构建产物
cp -r legal web-build/

# 验证文件存在
ls -la web-build/legal/
```

**预期输出**：
```
web-build/legal/
├── index.html    # Privacy Policy
└── terms.html    # Terms of Service
```

### 第三步：本地预览（可选）

```bash
# 安装 http-server（如果未安装）
pnpm add -g http-server

# 启动本地服务器
http-server web-build -p 8080

# 访问 http://localhost:8080
```

### 第四步：提交并推送代码

```bash
# 1. 添加所有更改
git add .

# 2. 提交更改
git commit -m "fix: 修复 GitHub Pages 部署配置

- 添加 GitHub Actions 工作流自动部署
- 更新 package.json 添加 homepage 字段
- 修复 webpack 输出配置
- 确保 legal 目录正确复制"

# 3. 推送到 main 分支
git push origin main
```

### 第五步：验证 GitHub Actions

1. 访问 GitHub 仓库的 **Actions** 标签页
2. 查看 "Deploy to GitHub Pages" 工作流
3. 确认构建成功（绿色勾）
4. 查看部署日志，确认输出包含：
   - ✅ index.html 存在
   - ✅ JavaScript bundle 存在
   - ✅ legal 目录复制完成

### 第六步：验证 GitHub Pages 部署

等待 2-5 分钟让部署完成后，访问以下 URL：

#### 主应用
- ✅ https://sunislee.github.io/esonare_SoundTherapyPro/

#### 隐私政策页面
- ✅ https://sunislee.github.io/esonare_SoundTherapyPro/legal/
- ✅ https://sunislee.github.io/esonare_SoundTherapyPro/legal/terms.html

#### 预期结果
- 主页面应该显示 "心声冥想" 加载界面
- 隐私政策页面应该能正常访问
- 不应该出现 404 错误

## 常见问题排查

### 问题 1：仍然显示 404

**可能原因**：
- GitHub Pages 还未完成部署
- 分支配置错误

**解决方案**：
1. 检查 GitHub Actions 是否完成
2. 访问仓库 **Settings > Pages**
3. 确认 **Source** 设置为 `GitHub Actions`
4. 确认 **Branch** 设置为 `main`

### 问题 2：页面加载但显示空白

**可能原因**：
- JavaScript bundle 加载失败
- 资源路径错误

**解决方案**：
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签页的错误信息
3. 查看 Network 标签页，确认所有资源加载成功（状态码 200）

### 问题 3：legal 页面 404

**解决方案**：
1. 确认 GitHub Actions 日志中包含 "legal 目录复制完成"
2. 手动访问：`https://sunislee.github.io/esonare_SoundTherapyPro/legal/index.html`

## 手动触发部署

如果需要重新部署（无需提交代码）：

1. 访问仓库 **Actions** 标签页
2. 选择 "Deploy to GitHub Pages" 工作流
3. 点击 **Run workflow** 按钮
4. 选择 `main` 分支
5. 点击 **Run workflow**

## 技术细节

### GitHub Actions 工作流特性

- **触发条件**：
  - 推送到 `main` 分支
  - `web/`、`webpack.config.js`、`package.json` 变更
  - 手动触发

- **构建环境**：
  - Node.js 20
  - pnpm 包管理器
  - Ubuntu latest

- **部署目标**：
  - GitHub Pages (通过 GitHub Actions)
  - 自动配置 SSL（HTTPS）

### 文件结构

```
esonare_SoundTherapyPro/
├── .github/
│   └── workflows/
│       └── static.yml          # GitHub Actions 配置
├── web/
│   ├── App.js                  # Web 入口文件
│   └── index.html              # HTML 模板
├── legal/
│   ├── index.html              # Privacy Policy
│   └── terms.html              # Terms of Service
├── web-build/                   # 构建产物（自动生成）
├── package.json                 # 包含 homepage 字段
└── webpack.config.js            # Webpack 配置
```

## 下一步

如果所有测试通过：
1. ✅ 主应用可访问
2. ✅ 隐私政策页面可访问
3. ✅ 无 404 错误

那么修复完成！🎉

---

**最后更新**: 2026-03-11
**版本**: 1.3.0
