---
alwaysApply: false
description: 
---
规则：AAB 产物规范化管理

渠道区分：在 /Releases 文件夹下，根据构建渠道（Flavor/Variant）自动创建子文件夹。
- Google Play 渠道 → /Releases/GooglePlay/
- 国内渠道 → /Releases/Domestic/
- 其他渠道 → /Releases/Other/

存储位置：每次执行 bundleGoogleRelease 后，必须将生成的 .aab 文件从默认的 build 目录移动或复制到对应的渠道子文件夹中。

自动创建：如果 /Releases 及子文件夹不存在，Trae 需在脚本或操作中自动创建它。

命名规范：文件名必须包含版本号、VersionCode 和日期，例如：HeartSound_v1.2.0_vc111_20260306.aab。

自动清理：每个渠道文件夹仅保留最新的 AAB 文件，或者按版本号有序排列，严禁在根目录乱扔临时文件。

自动映射：脚本要能识别当前执行的是 bundleGoogleRelease、bundleDomesticRelease 还是其他渠道任务，并精准投递到对应的子文件夹。
