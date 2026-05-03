# i18n 模块暴力修复计划

## 任务分解与优先级

### [ ] 任务 1：物理注入翻译
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 打开 `src/i18n/locales/zh.json`
  - 复制所有内容
  - 在 `src/i18n/index.ts` 中硬编码为 `const zh = { ... }` 变量
  - 移除 `require('./locales/zh.json')` 引用
- **成功标准**:
  - 翻译内容被直接硬编码到 TypeScript 文件中
- **测试要求**:
  - `programmatic`: 编译时无语法错误
  - `human-judgement`: 硬编码内容与原 JSON 文件一致

### [ ] 任务 2：屏蔽所有混淆
- **优先级**: P0
- **依赖**: 任务 1
- **描述**:
  - 打开 `android/app/build.gradle`
  - 找到 `minifyEnabled` 配置
  - 暂时改为 `false`
- **成功标准**:
  - 混淆被完全禁用
- **测试要求**:
  - `programmatic`: 编译配置正确
  - `human-judgement`: 构建过程无混淆警告

### [ ] 任务 3：强制 Key 校验
- **优先级**: P0
- **依赖**: 任务 1, 任务 2
- **描述**:
  - 在 `index.js` 入口处添加 `AsyncStorage.getItem('USER_NAME').then(v => console.log('CRITICAL_CHECK:', v))`
  - 在判断逻辑中添加 `if (__DEV__) console.log('Current Route Decision...')`
- **成功标准**:
  - 启动时打印关键检查信息
- **测试要求**:
  - `programmatic`: 日志中显示 CRITICAL_CHECK 信息
  - `human-judgement`: 路由决策信息正确打印

### [ ] 任务 4：直接弹窗查杀
- **优先级**: P1
- **依赖**: 任务 1, 任务 2, 任务 3
- **描述**:
  - 在 `index.js` 入口处添加 `alert(JSON.stringify(i18n.languages))`
  - 确保在 i18n 初始化后执行
- **成功标准**:
  - 应用启动时弹出 i18n 语言信息
- **测试要求**:
  - `human-judgement`: 弹窗显示正确的语言信息

### [ ] 任务 5：终极清理构建
- **优先级**: P0
- **依赖**: 任务 1, 任务 2, 任务 3, 任务 4
- **描述**:
  - 执行 `cd android && ./gradlew clean`
  - 执行 `./gradlew assembleGoogleRelease`
  - 安装并测试应用
- **成功标准**:
  - Release 包编译成功
  - 应用能够正常启动
- **测试要求**:
  - `programmatic`: 编译过程无错误
  - `human-judgement`: 应用启动后显示正确的翻译

## 实施步骤

1. 首先打开 `src/i18n/locales/zh.json`，复制所有内容
2. 修改 `src/i18n/index.ts`，硬编码翻译内容
3. 修改 `android/app/build.gradle`，禁用混淆
4. 修改 `index.js`，添加 Key 校验和弹窗
5. 清理并重新编译 Release 包
6. 安装并测试应用行为
7. 验证 i18n 是否正常工作

## 风险评估

- **风险 1**: 硬编码内容可能导致维护困难
  - 缓解: 注释说明这是临时修复，后续可恢复

- **风险 2**: 禁用混淆可能增加包大小
  - 缓解: 这是临时措施，确认问题后可重新启用

- **风险 3**: 弹窗可能影响用户体验
  - 缓解: 这是调试措施，确认问题后可移除

## 成功标准

- [ ] i18n 模块在 Release 模式下正常工作
- [ ] 不显示 Key 名（如 common.confirmExit）
- [ ] 应用启动流畅，无白屏
- [ ] 已设置用户名的用户直接进入主页
- [ ] Release 包编译成功并可安装