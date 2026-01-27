## 彻底重构 App.js 修复所有语法错误

### 1. 修复音频文件路径错误
- 修正 SCENES 数组中的音频文件名
- 确保 require 路径正确

### 2. 修复 ScrollView 闭合错误
- 确保 ScrollView 正确闭合
- 修复所有 JSX 语法错误

### 3. 视觉升级（去丑计划）
**顶部：**
- RESONARE 标题：`fontSize: 16, letterSpacing: 12, opacity: 0.5`

**中间：**
- 倒计时：纤细字体，移除臃肿边框

**底部：**
- 分类 Tab：纯文字，选中项下方加 2px 柔和白线
- 场景列表：放在大卡片中，`backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 32, margin: 20`

### 4. 确保 LinearGradient 稳定
- 使用 THEMES 常量对象
- colors={THEMES[CATEGORY_CONFIG[selectedCategory]?.theme]?.colors || THEMES.nature.colors}
- style={StyleSheet.absoluteFill}

### 5. 添加分类指示线
- 选中的分类下方添加白色指示线
- 宽度与文字宽度一致