const fs = require('fs');
const path = require('path');

// 创建一个简单的白色音符图标 (24x24 dp = 48x48 px for xhdpi)
// 使用 PNG 格式，白色前景，透明背景

// 这是一个简化的 1x1 白色像素的 base64
// 实际应该用 ImageMagick 或其他工具生成真正的音符图标

const outputPath = path.join(__dirname, 'android/app/src/main/res/drawable/ic_notification.png');

// 使用 sips 从现有 Logo 创建
const { execSync } = require('child_process');

const logoPath = path.join(__dirname, 'android/app/src/main/res/drawable/app_main_logo.png');

try {
  // 调整尺寸到 48x48
  execSync(`sips --resampleWidth 48 "${logoPath}" --out "${outputPath}"`);
  console.log('✓ 图标已创建：48x48 像素');
  console.log('📁 文件位置:', outputPath);
  console.log('\n注意：Android 系统会自动将彩色图标转换为白色剪影显示在通知栏');
} catch (e) {
  console.error('❌ 失败:', e.message);
  process.exit(1);
}
