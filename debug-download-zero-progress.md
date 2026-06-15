[OPEN] download-zero-progress

# Debug Session: download-zero-progress

## Symptom
- 全新安装后首页下载卡在 0%，进度不变化

## Hypotheses
- H1: `startDownload()` 没有真正触发，`processQueue()` 未执行
- H2: `processQueue()` 执行了，但队列为空或被锁条件短路
- H3: `downloadResource()` 进入前被资源解析/前置检查拦截
- H4: 底层下载请求已触发，但原生层未产生正常回调

## Plan
- 先添加最小化插桩
- 复现并收集日志
- 根据日志判定卡点位置
