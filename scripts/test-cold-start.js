const { execSync } = require('child_process');

console.log('\n=== 性能测试脚本 ===\n');
console.log('📱 测试设备：REDMI K80 Pro (b0784a24)');
console.log('');
console.log('🔍 测试步骤：');
console.log('1. 清除应用数据');
console.log('2. 强制停止应用');
console.log('3. 启动应用并记录冷启动时间');
console.log('4. 监控 i18n 初始化日志');
console.log('');
console.log('📊 开始执行...\n');

try {
  // 清除应用数据
  console.log('🗑️  清除应用数据...');
  execSync('adb -s b0784a24 shell pm clear com.anonymous.soundtherapyapp', { stdio: 'inherit' });
  
  // 强制停止
  console.log('⏹️  强制停止应用...');
  execSync('adb -s b0784a24 shell am force-stop com.anonymous.soundtherapyapp', { stdio: 'inherit' });
  
  console.log('\n🚀 启动应用并监控日志...\n');
  console.log('=== 请按 Ctrl+C 停止日志监控 ===\n');
  
  // 启动应用
  execSync('adb -s b0784a24 shell am start -n com.anonymous.soundtherapyapp/.MainActivity', { stdio: 'inherit' });
  
  // 监控日志
  execSync('adb -s b0784a24 logcat -c && adb -s b0784a24 logcat | grep -E "\\[i18n\\]|ReactNative|cold start|ActivityManager"', { stdio: 'inherit' });
  
} catch (error) {
  console.log('\n⚠️  测试中断或出错');
  if (error.status === 130) {
    console.log('用户手动停止 (Ctrl+C)');
  } else {
    console.error('错误:', error.message);
  }
}

console.log('\n\n💡 分析建议：');
console.log('================');
console.log('1. 冷启动时间应 < 2 秒');
console.log('2. i18n 初始化应在 Activity 创建后 500ms 内完成');
console.log('3. 如果看到 "Cannot detect system locale" 警告，说明语言检测失败');
console.log('4. 注意观察是否有 "RedScreen" 或 "YellowBox" 警告');
console.log('');
