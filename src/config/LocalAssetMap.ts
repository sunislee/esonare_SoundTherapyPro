/**
 * 静态资源映射表
 * 使用 Metro 打包器的 require() 方法加载本地 .webp 图片，确保兼容 React Native 0.81+
 */
export const LOCAL_ASSETS: Record<string, any> = {
  'bg_western_church_candlelight.webp': require('../assets/images/bg_western_church_candlelight.webp'),
  'bg_western_church_sunlight_monastery.webp': require('../assets/images/bg_western_church_sunlight_monastery.webp'),
  'bg_western_church_light_rays.webp': require('../assets/images/bg_western_church_light_rays.webp'),
  'bg_western_church_corridor.webp': require('../assets/images/bg_western_church_corridor.webp'),
  'bg_temple_lantern_gate.webp': require('../assets/images/bg_temple_lantern_gate.webp'),
  'bg_temple_zen_lantern.webp': require('../assets/images/bg_temple_zen_lantern.webp'),
  'bg_temple_roof.webp': require('../assets/images/bg_temple_roof.webp'),
};
export const LOCAL_ASSET_KEYS = Object.keys(LOCAL_ASSETS);
