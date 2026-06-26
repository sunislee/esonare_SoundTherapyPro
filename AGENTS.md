# 开发规范

## 重要：文件系统库
必须使用 `@dr.pogodin/react-native-fs`，禁止使用 `react-native-fs`。
历史原因：react-native-fs 有 NullPointerException bug，已迁移。

## CDN
使用 ghproxy.net 格式，本地代理端口 17897。

## 禁止修改
- android/settings.gradle 的 includeBuild
- libs.versions.toml
