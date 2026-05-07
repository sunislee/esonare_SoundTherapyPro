# ⚠️ Android 签名证书指南 (Keystore)

## 🔴 **重要警告**

**此目录下的签名文件已设为 Git 忽略，更新环境后请手动从私密备份中拷贝原件至此，严禁重新生成！**

---

## 📁 **必需文件**

| 文件名 | 用途 | 状态 |
|--------|------|------|
| `my-release-key.keystore` | Release 签名证书 | ❌ 需手动放置 |
| `debug.keystore` | Debug 签名证书 | ✅ 已存在（可自动生成） |

---

## 🎯 **操作步骤（换机/重装环境后）**

### 1. 从安全备份恢复 Keystore
```bash
# 从您的私密备份位置拷贝到此处
cp /path/to/your/secure/backup/my-release-key.keystore android/app/
```

### 2. 验证文件权限
```bash
# 确保文件权限正确（建议 600 或 644）
chmod 600 android/app/my-release-key.keystore
```

### 3. 验证构建
```bash
cd android
./gradlew clean
./gradlew assembleRelease   # 生成 APK
# 或
./gradlew bundleRelease     # 生成 AAB (Google Play)
```

---

## 🔐 **签名配置详情**

### build.gradle 配置 (第 107-111 行)
```groovy
release {
    storeFile file('my-release-key.keystore')
    storePassword 'esonare123'
    keyAlias 'my-key-alias'
    keyPassword 'esonare123'
}
```

### 应用信息
- **Package**: `com.anonymous.soundtherapyapp`
- **Version Code**: 142
- **Version Name**: 1.4.2-beta

---

## ⛔ **严禁事项**

1. **❌ 绝对不要重新生成 keystore**
   - 已发布到 Google Play 的 App 使用固定签名
   - 更换签名会导致用户无法更新（"签名不一致"错误）

2. **❌ 不要将 keystore 提交到 Git**
   - `.gitignore` 已配置忽略规则
   - 如发现被跟踪，立即执行：
     ```bash
     git rm --cached android/app/my-release-key.keystore
     ```

3. **❌ 不要在公开场合分享密码**
   - 当前密码仅用于开发环境
   - 生产环境建议使用环境变量或 CI/CD 密钥管理

---

## 💾 **备份建议**

请将 `my-release-key.keystore` 备份到以下位置：

- [ ] 本地加密磁盘（如 VeraCrypt 卷）
- [ ] 云端密码管理器（如 1Password、Bitwarden）
- [ ] 离线存储（如 USB 安全密钥、纸质 QR 码）
- [ ] 受信任的团队成员（如有）

---

## 🆘 **如果丢失 Keystore**

**这是严重问题！** 如果原始 keystore 丢失且无备份：

1. 联系 Google Play 支持申请签名更换（需验证身份）
2. 或使用新签名发布为新应用（用户需手动卸载旧版）

**预防措施：立即备份！！！**

---

## 📞 **相关链接**

- Google Play 签名文档: https://developer.android.com/studio/publish/app-signing
- 密钥库工具: https://developer.android.com/tools/keystore

---

**最后更新**: 2025-05-07  
**维护者**: SoundTherapyPro Team