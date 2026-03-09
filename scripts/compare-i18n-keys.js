const fs = require('fs');
const path = require('path');

// 读取 JSON 文件
const zhPath = path.join(__dirname, '../src/i18n/locales/zh.json');
const enPath = path.join(__dirname, '../src/i18n/locales/en.json');

const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// 递归获取所有 Key 路径
function getAllKeys(obj, prefix = '') {
  let keys = [];
  
  for (const key in obj) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  
  return keys;
}

// 获取所有 Key
const zhKeys = getAllKeys(zh);
const enKeys = getAllKeys(en);

console.log('\n=== i18n Key 对比报告 ===\n');
console.log(`zh.json 总 Key 数：${zhKeys.length}`);
console.log(`en.json 总 Key 数：${enKeys.length}`);
console.log(`差异：${zhKeys.length - enKeys.length}`);
console.log('');

// 找出 en.json 缺失的 Key
const missingKeys = zhKeys.filter(key => !enKeys.includes(key));

if (missingKeys.length > 0) {
  console.log('❌ en.json 中缺失的 Key：\n');
  missingKeys.forEach(key => {
    // 获取对应的中文值
    const keys = key.split('.');
    let value = zh;
    for (const k of keys) {
      value = value[k];
    }
    console.log(`  - ${key}`);
    console.log(`    中文值：${value}`);
    console.log('');
  });
} else {
  console.log('✅ en.json 包含所有 zh.json 的 Key！');
}

// 找出 en.json 多余的 Key（zh.json 中没有的）
const extraKeys = enKeys.filter(key => !zhKeys.includes(key));

if (extraKeys.length > 0) {
  console.log('\n⚠️  en.json 中多余的 Key（zh.json 中没有）：\n');
  extraKeys.forEach(key => {
    const keys = key.split('.');
    let value = en;
    for (const k of keys) {
      value = value[k];
    }
    console.log(`  - ${key}`);
    console.log(`    英文值：${value}`);
    console.log('');
  });
}

// 输出统计
console.log('\n=== 统计 ===');
console.log(`缺失 Key 数：${missingKeys.length}`);
console.log(`多余 Key 数：${extraKeys.length}`);
console.log(`匹配度：${((1 - missingKeys.length / zhKeys.length) * 100).toFixed(2)}%`);
console.log('');

// 如果有缺失，退出时返回错误码
process.exit(missingKeys.length > 0 ? 1 : 0);
