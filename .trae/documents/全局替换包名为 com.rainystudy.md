## Android 全局重构方案：com.resonare → com.rainystudy

### 1. 更新配置文件
**android/app/build.gradle：**
- 更新 `namespace "com.resonare"` → `namespace "com.rainystudy"`
- 更新 `applicationId "com.resonare"` → `applicationId "com.rainystudy"`

**AndroidManifest.xml：**
- 更新 `package="com.resonare"` → `package="com.rainystudy"`

**package.json：**
- 更新 `"name": "RainyStudy"`（已完成）

### 2. 物理搬迁 Java/Kotlin 文件
- 将 `android/app/src/main/java/com/resonare/` 目录移动到 `android/app/src/main/java/com/rainystudy/`
- 删除旧的 `com/resonare/` 空文件夹

### 3. 更新 Java/Kotlin 文件中的 package 声明
- **MainActivity.kt：** `package com.resonare` → `package com.rainystudy`
- **MainApplication.kt：** `package com.resonare` → `package com.rainystudy`
- **SuperpoweredModule.java：** `package com.resonare` → `package com.rainystudy`
- **SuperpoweredPackage.java：** `package com.resonare` → `package com.rainystudy`

### 4. 更新 C++ JNI 函数名
- 在 `ResonareAudioEngine.cpp` 中搜索所有 `Java_com_resonare_`
- 替换为 `Java_com_rainystudy_`

### 5. 清理并重新构建
- 执行 `cd android && ./gradlew clean`
- 清理构建缓存

完成后执行 `npm run android` 开始编译和安装到真机