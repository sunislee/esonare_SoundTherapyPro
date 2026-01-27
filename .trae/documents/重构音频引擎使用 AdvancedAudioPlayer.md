## 重构 ResonareAudioEngine.cpp 使用 AdvancedAudioPlayer

### 1. 修改 C++ 代码
- 引入 Superpowered::AdvancedAudioPlayer
- 添加 AAssetManager 实例变量
- 添加 openScene 函数：通过 AAssetManager 打开 assets 文件
- 获取文件 offset 和 length
- 调用 player->open(path, offset, length)
- 修改 audioProcessing 回调：使用 player->processStereo() 替代噪声生成

### 2. 修改 Java 代码
- SuperpoweredModule.java 添加 openScene 方法
- 传递 AssetManager 到 nativeInitialize

### 3. 修改 CMakeLists.txt
- 确保链接了 Superpowered 库

### 4. 测试
- 重新构建 APK
- 安装到真机测试