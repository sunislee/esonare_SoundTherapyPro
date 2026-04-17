# HeartSound Meditation - Development Roadmap

## v1.4.0+ Next Week Plan (2026.04.20 - 2026.04.24)

### Monday First Feature
- [ ] **[Feature] Jazz-Funk 场景 UI 实装**
  - 在 `src/constants/scenes.ts` 中定义 Jazz-Funk 场景
  - 在首页场景列表中添加入口
  - 关联 `EQManager.ts` 中已注入的 `jazzFunk` EQ 预设
  - 配置对应音频文件（需确认音频资源）
  - 测试 EQ 预设切换效果

---

## v1.3.0+ Optimization Focus

### High Priority

1. **Backend Account System**
   - Introduce formal backend account system
   - Implement user registration and authentication
   - Ensure secure data storage and retrieval

2. **Account Deletion API**
   - Integrate with actual Account Deletion API
   - Comply with Google's long-term policies
   - Implement proper data deletion流程

3. **Dynamic Island Deep Optimization**
   - Fix cover image flip/disappearance issue during playback
   - Ensure consistent display and animation
   - Optimize for different device models

4. **Offline Mode**
   - Complete offline audio playback and management
   - Ensure all downloaded resources are accessible without network connection
   - Implement proper caching and storage management

5. **Remove Offline Mode Switch**
   - Remove unnecessary offline logic to prevent crashes
   - Simplify user experience by automatically handling offline/online states
   - Ensure stable operation across all network conditions

### Secondary Tasks

- Improve audio quality and latency
- Optimize app startup time
- Enhance battery usage during playback
- Add more personalized meditation recommendations

## Current Status

- [x] Basic offline playback functionality
- [ ] Backend account system
- [ ] Account deletion API integration
- [ ] Dynamic Island optimization
- [ ] Offline mode switch removal
- [ ] Complete offline mode implementation
