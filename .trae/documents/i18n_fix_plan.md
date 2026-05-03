# i18n 模块 Release 包失效修复计划

## 任务分解与优先级

### \[x] 任务 1：强制保留 i18n 模块

* **优先级**: P0

* **依赖**: 无

* **描述**:

  * 在 `src/i18n/index.ts` 顶部添加 `global.i18n = i18next`

  * 在 `index.js` 入口处显式 `import './src/i18n'`

* **成功标准**:

  * i18n 模块在 Release 模式下被正确保留

* **测试要求**:

  * `programmatic`: 编译后检查 Hermes 字节码是否包含 i18n 模块

  * `human-judgement`: 应用启动后 i18n 全局对象存在

### \[x] 任务 2：改为同步加载语言文件

* **优先级**: P0

* **依赖**: 任务 1

* **描述**:

  * 将语言文件的引入方式从 `import` 改为 `require`

  * 确保 `zh.json` 和 `en.json` 通过静态引入加载

* **成功标准**:

  * 语言文件被物理打包进 Hermes 字节码

* **测试要求**:

  * `programmatic`: 编译后检查资源是否包含翻译文件

  * `human-judgement`: 应用启动后不显示 Key 名

### \[/] 任务 3：修复异步竞争问题

* **优先级**: P0

* **依赖**: 任务 1, 任务 2

* **描述**:

  * 在 `index.js` 的 App 组件中添加 `isReady` 状态

  * 使用 `useEffect` 等待 `i18next.init()` 和 `AsyncStorage.getItem('USER_NAME')` 完成

  * 加载完成前显示 Loading 界面

* **成功标准**:

  * 应用启动时先显示 Loading，再进入主流程

* **测试要求**:

  * `programmatic`: 日志显示初始化完成后才渲染导航器

  * `human-judgement`: 应用启动流畅，无白屏或 Key 名闪烁

### \[ ] 任务 4：强制清理重打 Release

* **优先级**: P0

* **依赖**: 任务 1, 任务 2, 任务 3

* **描述**:

  * 执行 `cd android && ./gradlew clean assembleGoogleRelease`

  * 确保清除所有旧的 Hermes 字节码缓存

* **成功标准**:

  * Release 包编译成功

  * 安装包大小合理

* **测试要求**:

  * `programmatic`: 编译过程无错误

  * `human-judgement`: 安装包能够成功安装

### \[ ] 任务 5：修正导航逻辑

* **优先级**: P1

* **依赖**: 任务 3

* **描述**:

  * 检查 `LandingScreen` 逻辑

  * 确保如果 `AsyncStorage` 读到 `USER_NAME` 且 i18n 已 ready，直接跳转到 `Main`

* **成功标准**:

  * 已设置用户名的用户直接进入主页

* **测试要求**:

  * `programmatic`: 日志显示正确的导航决策

  * `human-judgement`: 应用启动后直接进入主页，不再停留在命名页面

## 实施步骤

1. 首先修改 `src/i18n/index.ts`，添加全局引用 ✅
2. 修改 `index.js`，添加显式导入 ✅
3. 修改语言文件加载方式为 `require` ✅
4. 在 `index.js` 中添加 `isReady` 状态和等待逻辑
5. 清理并重新编译 Release 包
6. 安装并测试应用行为
7. 验证 i18n 是否正常工作

## 风险评估

* **风险 1**: `require` 语法可能与 TypeScript 类型定义冲突

  * 缓解: 确保类型定义正确，或使用类型断言

* **风险 2**: 全局变量可能被其他模块覆盖

  * 缓解: 使用唯一命名，如 `global.__SOUND_THERAPY_I18N__`

* **风险 3**: 初始化时间过长导致启动变慢

  * 缓解: 优化初始化逻辑，确保并发执行

## 成功标准

* [ ] i18n 模块在 Release 模式下正常工作

* [ ] 不显示 Key 名（如 common.confirmExit）

* [ ] 应用启动流畅，无白屏

* [ ] 已设置用户名的用户直接进入主页

* [ ] Release 包编译成功并可安装

