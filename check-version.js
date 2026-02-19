#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// 读取文件内容
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    error(`无法读取文件: ${filePath}`);
  }
}

// 从 build.gradle 提取版本信息
function extractVersionFromGradle(content) {
  const versionCodeMatch = content.match(/versionCode\s+(\d+)/);
  const versionNameMatch = content.match(/versionName\s+"([^"]+)"/);
  
  if (!versionCodeMatch || !versionNameMatch) {
    error('无法从 build.gradle 中提取版本信息');
  }
  
  return {
    versionCode: parseInt(versionCodeMatch[1]),
    versionName: versionNameMatch[1]
  };
}

// 从 UI 文件提取版本信息
function extractVersionFromUI(content, fileType) {
  let versionMatch;
  
  if (fileType === 'AboutScreen') {
    // 匹配 {t('settings.version')} 1.1.2 格式
    versionMatch = content.match(/\{t\('settings\.version'\)\}\s+([\d.]+)/);
  } else if (fileType === 'SettingsScreen') {
    versionMatch = content.match(/subtitle:\s*['"]v([\d.]+)['"]/);
  }
  
  return versionMatch ? versionMatch[1] : null;
}

// 检查翻译文件完整性
function checkTranslationFiles() {
  const localesDir = path.join(__dirname, 'src/i18n/locales');
  const files = ['zh.json', 'en.json', 'ja.json'];
  
  // 需要检查的关键 Key
  const requiredKeys = [
    'profile.modals.exitTitle',
    'profile.modals.exitMsg', 
    'profile.modals.exitConfirm',
    'profile.modals.cancel'
  ];
  
  const categoryKeys = [
    'categories.nature',
    'categories.healing',
    'categories.brainwave',
    'categories.life'
  ];
  
  const allKeys = [...requiredKeys, ...categoryKeys];
  
  files.forEach(file => {
    const filePath = path.join(localesDir, file);
    const content = readFile(filePath);
    
    try {
      const data = JSON.parse(content);
      
      allKeys.forEach(key => {
        const keys = key.split('.');
        let current = data;
        
        for (const k of keys) {
          if (!current || !current[k]) {
            error(`${file} 缺少关键 Key: ${key}`);
          }
          current = current[k];
        }
      });
      
      success(`${file} 翻译文件完整性检查通过`);
    } catch (err) {
      error(`${file} JSON 解析失败: ${err.message}`);
    }
  });
}

// 主检查函数
function main() {
  info('开始版本号一致性检查...');
  
  // 1. 检查 build.gradle
  const gradlePath = path.join(__dirname, 'android/app/build.gradle');
  const gradleContent = readFile(gradlePath);
  const gradleVersion = extractVersionFromGradle(gradleContent);
  
  info(`Build.gradle 版本: ${gradleVersion.versionName} (${gradleVersion.versionCode})`);
  
  // 2. 检查 AboutScreen
  const aboutScreenPath = path.join(__dirname, 'src/screens/AboutScreen.tsx');
  const aboutScreenContent = readFile(aboutScreenPath);
  const aboutScreenVersion = extractVersionFromUI(aboutScreenContent, 'AboutScreen');
  
  if (!aboutScreenVersion) {
    error('无法从 AboutScreen.tsx 中提取版本号');
  }
  
  info(`AboutScreen 版本: ${aboutScreenVersion}`);
  
  // 3. 检查 SettingsScreen
  const settingsScreenPath = path.join(__dirname, 'src/screens/SettingsScreen.tsx');
  const settingsScreenContent = readFile(settingsScreenPath);
  const settingsScreenVersion = extractVersionFromUI(settingsScreenContent, 'SettingsScreen');
  
  if (!settingsScreenVersion) {
    error('无法从 SettingsScreen.tsx 中提取版本号');
  }
  
  info(`SettingsScreen 版本: ${settingsScreenVersion}`);
  
  // 4. 版本号一致性检查
  if (gradleVersion.versionName !== aboutScreenVersion || 
      gradleVersion.versionName !== settingsScreenVersion) {
    error('版本号不一致！请确保所有文件的版本号相同');
  }
  
  success('版本号一致性检查通过');
  
  // 5. 检查翻译文件完整性
  info('检查翻译文件完整性...');
  checkTranslationFiles();
  
  // 6. 最终成功
  success(`🎉 所有检查通过！当前版本: ${gradleVersion.versionName} (${gradleVersion.versionCode})`);
  
  // 7. 输出总结
  info('\n📋 检查结果总结:');
  info(`   应用版本: ${gradleVersion.versionName}`);
  info(`   版本代码: ${gradleVersion.versionCode}`);
  info(`   翻译文件: 3/3 通过`);
  info(`   关键 Key: 8/8 完整`);
}

// 运行检查
if (require.main === module) {
  main();
}

module.exports = { main, extractVersionFromGradle, extractVersionFromUI };