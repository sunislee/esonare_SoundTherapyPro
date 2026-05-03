# Android 兼容性与稳定性规范

## 1. 禁用高版本 Java 集合方法 (预防 NoSuchMethodError)
- **风险**：某些低版本 Android 系统不支持 Java 21+ 的新集合方法（如 `removeLast()`），会导致 60% 以上的机型闪退。
- **规则**：严禁在原生层及 RN 桥接层使用高版本特有 API。
- **替代方案**：统一使用通用的集合操作方法（如 `list.remove(list.size() - 1)`）。

## 2. 静态资源管理规范
- **原则**：App 采用全内置资源架构以确保弱网环境下的稳定性。
- **规则**：所有新增音频资源必须放置在 `android/app/src/main/res/raw` 目录下。
- **调用逻辑**：禁止硬编码 R.raw ID，必须保持 `audioAssets.ts` 与原生目录同步。

## 3. 混淆保护 (Proguard)
- **规则**：发布包必须确保 `com.anonymous.soundtherapyapp.R$*` 不被混淆，防止资源 ID 错位。

## 4. 音频资源下载双向保护策略 (Dual-Source Fallback)

- **原则**：根据应用分发渠道，动态调整主/备下载源，确保全球范围内的下载成功率。
- **策略逻辑**：
  - **Google Play 渠道**：
    - **主源 (Primary)**：GitHub
    - **备源 (Secondary)**：Gitee
  - **国内渠道 (Gitee/应用宝等)**：
    - **主源 (Primary)**：Gitee
    - **备源 (Secondary)**：GitHub
- **技术实现要求**：
  - 封装 `getDownloadUrl(assetId)` 方法，根据当前 `packageName` 或 `flavor` 返回对应的 URL 列表。
  - 必须实现 **自动重试机制**：主源请求失败（超时、404、连接错误）后，立即静默切换到备源进行重试。
  - 严禁硬编码单一下载源，所有远程资源必须具备这两个镜像地址。