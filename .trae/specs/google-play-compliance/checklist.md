# Google Play 合规性检查清单

## 权限合规性
- [x] AndroidManifest.xml 不包含 MANAGE_EXTERNAL_STORAGE
- [x] AndroidManifest.xml 不包含 WRITE_EXTERNAL_STORAGE
- [x] AndroidManifest.xml 只包含 INTERNET 和 ACCESS_NETWORK_STATE 权限
- [x] 所有权限声明都是必要的

## Target SDK 合规性
- [x] targetSdkVersion >= 34 (Android 14)
- [x] compileSdkVersion >= 34

## 依赖库合规性
- [x] package.json 不包含主动申请外部存储权限的库
- [x] 没有使用 react-native-permissions 或类似库申请不必要的权限

## 最终输出
- [x] 输出所有 <uses-permission> 标签代码给用户确认
- [x] 输出 targetSdkVersion 和 compileSdkVersion 给用户确认
