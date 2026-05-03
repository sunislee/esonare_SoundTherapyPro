# 修复 react-native-fs 空指针问题

## 问题分析

**现象**：App 在进入主页时闪退

**崩溃位置**：`com.rnfs.RNFSManager.reject` 方法

**根本原因**：调用 `promise.reject(code, message)` 时，`code` 参数为 `null`，导致空指针异常

**影响范围**：react-native-fs 库的 Java 原生层

## 修复策略

### 方案一：patch-package 修复（推荐）
1. 定位 node_modules 中的 RNFSManager.java 文件
2. 修复所有调用 promise.reject() 时 code 可能为 null 的地方
3. 使用 patch-package 生成补丁文件
4. 确保补丁在 postinstall 时自动应用

### 方案二：检查库更新
1. 检查 react-native-fs 是否有针对 RN 0.81 的补丁版本
2. 查看 GitHub issues 是否有相关修复

## 实施步骤

### 步骤 1：定位问题文件
- 文件路径：`node_modules/react-native-fs/android/src/main/java/com/rnfs/RNFSManager.java`
- 重点检查：第 978 行附近及所有调用 `reject()` 的地方

### 步骤 2：分析崩溃调用链
- 检查项目中所有使用 RNFS 的地方
- 确定哪个操作触发了崩溃（下载、读取、写入等）

### 步骤 3：应用修复
- 修改 RNFSManager.java 中所有 `promise.reject(code, message)` 调用
- 添加空值检查：`code != null ? code : "ERROR"`

### 步骤 4：生成补丁
- 使用 patch-package 生成持久化补丁
- 验证 postinstall 脚本正确配置

### 步骤 5：测试验证
- 清理并重新编译 Release 包
- 在真机上测试进入主页流程
- 监控日志确认无崩溃

## 验收标准
- [ ] RNFSManager.java 中所有 reject 调用都有非空 code
- [ ] patch-package 补丁正确生成并纳入版本控制
- [ ] Release 包编译成功
- [ ] 真机测试进入主页不再闪退
- [ ] 日志中无 RNFS 相关错误

## 风险评估
- **风险**：直接修改 node_modules 可能在依赖更新时丢失
- **缓解**：使用 patch-package 确保持久化
- **备选**：如问题复杂，考虑替换为 react-native-blob-util 等替代库
