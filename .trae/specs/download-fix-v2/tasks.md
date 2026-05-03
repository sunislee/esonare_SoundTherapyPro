# Tasks

- [x] Task 1: 物理清空标记 - 在 MainNavigator.tsx 的 useEffect 最开始添加 `await AsyncStorage.removeItem('RESOURCES_READY_KEY')`
  - [x] Subtask 1.1: 修改 MainNavigator.tsx 的 useEffect
  - [x] Subtask 1.2: 添加日志输出

- [x] Task 2: 异步等待空窗期 - 在判断 resourcesReady 之前强制等待 500ms
  - [x] Subtask 2.1: 添加 500ms 延迟代码
  - [x] Subtask 2.2: 添加日志输出

- [x] Task 3: 核心校验降级 - 在 OfflineService 的 Core 资源检查中强制打印文件大小
  - [x] Subtask 3.1: 修改 Core 资源检查逻辑
  - [x] Subtask 3.2: 添加文件大小读取和日志输出
  - [x] Subtask 3.3: 处理文件不存在的情况

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 is independent
