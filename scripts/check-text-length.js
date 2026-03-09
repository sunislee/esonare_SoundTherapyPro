const fs = require('fs');
const path = require('path');

// 读取英文语言包
const enPath = path.join(__dirname, '../src/i18n/locales/en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

console.log('\n=== 英文文本长度检查 ===\n');

// 检查场景描述
console.log('📍 场景描述长度检查：');
console.log('-------------------');

const scenes = en.scenes;
let hasLongDesc = false;

for (const [key, value] of Object.entries(scenes)) {
  const titleLen = value.title?.length || 0;
  const descLen = value.desc?.length || 0;
  
  // 英文单词平均长度 5 字符，超过 40 字符可能在小屏上溢出
  if (descLen > 35) {
    console.log(`⚠️  ${key}.desc: "${value.desc}" (${descLen} 字符)`);
    hasLongDesc = true;
  }
  
  if (titleLen > 25) {
    console.log(`⚠️  ${key}.title: "${value.title}" (${titleLen} 字符)`);
    hasLongDesc = true;
  }
}

if (!hasLongDesc) {
  console.log('✅ 所有场景描述长度合理');
}

// 检查设置项描述
console.log('\n\n⚙️  设置项描述长度检查：');
console.log('-------------------');

const settings = en.settings;
for (const [key, value] of Object.entries(settings)) {
  if (key.endsWith('Desc') && typeof value === 'string') {
    const len = value.length;
    if (len > 50) {
      console.log(`⚠️  settings.${key}: "${value}" (${len} 字符)`);
    }
  }
}

// 统计
console.log('\n\n📊 文本长度统计：');
console.log('================');

const allTexts = [];

function collectTexts(obj, prefix = '') {
  for (const key in obj) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      collectTexts(obj[key], fullPath);
    } else if (typeof obj[key] === 'string') {
      allTexts.push({ path: fullPath, text: obj[key], length: obj[key].length });
    }
  }
}

collectTexts(en);

const avgLength = allTexts.reduce((sum, t) => sum + t.length, 0) / allTexts.length;
const maxLength = Math.max(...allTexts.map(t => t.length));
const maxText = allTexts.find(t => t.length === maxLength);

console.log(`总文本数：${allTexts.length}`);
console.log(`平均长度：${avgLength.toFixed(1)} 字符`);
console.log(`最长文本：${maxLength} 字符`);
console.log(`最长内容：${maxText?.path} = "${maxText?.text}"`);

// 建议
console.log('\n\n💡 建议：');
console.log('========');
console.log('1. 标题超过 25 字符时，建议在小屏设备上测试是否溢出');
console.log('2. 描述超过 35 字符时，建议添加 numberOfLines={2} 限制');
console.log('3. 使用 adjustsFontSizeToFit 或 allowFontScaling={false} 控制字体缩放');
console.log('');
