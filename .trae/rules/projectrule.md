---
alwaysApply: false
---
1. 网络与依赖加速 (Network Optimization)
由于 React Native 0.83.0 依赖大量的原生库（尤其是 Android 端的 Maven 依赖），必须配置镜像源。

npm/yarn 镜像：使用淘宝/腾讯镜像。

Bash

npm config set registry https://registry.npmmirror.com
Android Gradle 加速：在 android/build.gradle 中优先使用阿里云镜像。

Gradle

allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/jcenter' }
        maven { url 'https://maven.aliyun.com/repository/public' }
        google()
        mavenCentral()
    }
}
iOS CocoaPods 代理：建议在 .bashrc 或 .zshrc 中配置 https_proxy，避免 pod install 失败。

2. 中文字体与排版规则 (Typography)
疗愈类 App 对视觉要求极高，系统默认字体在不同品牌安卓手机上表现不一。

规则：定义 src/theme/Typography.ts。

优先级：iOS 优先使用 PingFang SC，Android 优先使用 Noto Sans CJK SC 或系统默认 sans-serif。

字重限制：尽量避免使用 FontWeight: '500'（Android 部分系统不支持），建议统一使用 400 (Regular) 和 700 (Bold)。

3. 合规性与隐私策略 (Compliance)
中国应用商店（App Store, 华为, 小米等）对隐私权限审查极严。

权限规则：禁止在 App 启动时立即申请存储或通知权限。必须在用户点击“同意”隐私政策后，再初始化 react-native-track-player 的某些原生部分（如果涉及日志上报）。

备案要求：在 App.json 中预留 Android 备案号展示区域，通常在“关于我们”或登录页面底部。

4. 资源处理 (Assets)
音频加载：针对国内 CDN 情况，如果音频文件存放在远程（如阿里云 OSS/腾讯云 COS），务必在 src/assets 中保留一份低码率的本地 .mp3 作为断网时的“疗愈保底音”。

中文命名禁止：src/assets 文件夹下的所有音频和图片文件名严禁使用中文，必须使用小写字母 + 下划线（如 rain_meditation_01.wav），以防止 Metro 构建在 Windows 环境下出现乱码报错。

5. 重点机型适配 (Device Testing)
测试机矩阵：必须包含至少一台华为（HarmonyOS 兼容性）和一台低端 Android 机。

灵动岛适配：由于使用了 react-native-safe-area-context，需特别注意 iOS 灵动岛（Dynamic Island）对顶部 Header 文字的遮挡，至少预留 44dp 的顶部安全区。

6. Git 提交规范 (Commit Convention)
为了方便管理，建议使用带有 Emoji 的语义化提交，增加可读性：

feat(audio): 增加新音效

fix(ios): 修复 iOS 锁屏控制失效

chore(mirror): 更新国内 Maven 镜像地址