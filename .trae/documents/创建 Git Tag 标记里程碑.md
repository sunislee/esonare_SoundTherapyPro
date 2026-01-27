## 创建 Git Tag 标记里程碑

### 1. 添加所有修改到暂存区
- 执行 `git add .`

### 2. 提交修改
- 执行 `git commit -m "feat: 修复核心播放逻辑，实现本地音频稳定输出"`

### 3. 创建标签
- 执行 `git tag -a v1.0.0-Genesis-Voice -m "Resonare 第一次发声纪念版"`

### 4. 推送到远程仓库（可选）
- 如果需要，可以执行 `git push origin v1.0.0-Genesis-Voice`