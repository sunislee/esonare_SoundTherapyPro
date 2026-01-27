# 修复 Android 音频资产问题

## 任务清单
1. 修改 android/app/build.gradle 添加 aaptOptions 防止音频文件被压缩
2. 创建 deep-clean.sh 清理脚本
3. 创建 check-audio-files.js 脚本检查音频文件完整性

## 修改内容
1. build.gradle:
```groovy
android {
    // ... 现有配置
    aaptOptions {
        noCompress 'mp3', 'm4a', 'wav', 'aac'
    }
    // ... 其他配置
}
```

2. deep-clean.sh:
- 清理 android/build
- gradlew clean
- watchman watch-del-all
- 删除 node_modules 缓存

3. check-audio-files.js:
- 检查 audio/tracks/ 下所有文件
- 验证文件大小 > 0
- 报告空文件或异常大小的文件