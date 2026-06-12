// @ts-nocheck
// 【路径规范化工具】统一处理 Android/iOS 音频文件路径解析
import { Platform } from 'react-native';

/**
 * 规范化音频文件路径，确保跨平台兼容性
 * - 去除重复的 file:// 前缀
 * - 确保本地文件有正确的路径格式
 * - 网络 URL 保持原样（ TrackPlayer 支持直接播放）
 */
export function normalizeAudioPath(path: string): string {
  if (!path || typeof path !== 'string') {
    console.warn('[normalizeAudioPath] ❌ 无效的路径输入:', path);
    return '';
  }

  // 去除首尾空格
  let cleaned = path.trim();
  
  // 【关键】处理重复前缀：file://file:///path → file:///path
  if (cleaned.startsWith('file://')) {
    const afterPrefix = cleaned.substring(7); // 移除 "file://" 前缀
    if (afterPrefix.startsWith('file://')) {
      cleaned = 'file://' + afterPrefix.substring(7);
      console.log('[normalizeAudioPath] 🔄 检测到重复 file:// 前缀，已修复');
    }
  }

  // 【关键】处理双重斜杠（Android 特殊情况）
  // file:///path//to/file.mp3 → file:///path/to/file.mp3
  if (Platform.OS === 'android') {
    cleaned = cleaned.replace(/file:\/\//g, 'file://'); // 确保只有 3 个斜杠
    cleaned = cleaned.replace(/\/\/+/g, '/'); // 去除多余的 //
    
    // Android 下划线转横线处理（文件系统兼容性）
    if (cleaned.includes('_')) {
      const fixedPath = cleaned.replace(/_/g, '-');
      console.log('[normalizeAudioPath] 🔄 Android 下划线转横线:', cleaned, '→', fixedPath);
      cleaned = fixedPath;
    }
  }

  // 【诊断日志】输出规范化过程
  if (cleaned !== path) {
    console.log(`[normalizeAudioPath] ⚠️ 路径修正: ${path} → ${cleaned}`);
  } else {
    console.log('[normalizeAudioPath] ✅ 路径无需修正:', cleaned);
  }

  // 验证路径格式
  if (cleaned.startsWith('file://') && !cleaned.match(/^file:\/\/\/[^/]/)) {
    console.error('[normalizeAudioPath] ❌ 无效的 file:// 格式:', cleaned);
    return '';
  }

  return cleaned;
}

/**
 * 检查路径是否为有效音频文件路径
 */
export function isValidAudioPath(path: string): boolean {
  if (!path) return false;
  
  const normalized = normalizeAudioPath(path);
  
  // 必须是网络 URL 或本地文件路径（以 file:// 开头）
  if (normalized.startsWith('http') || normalized.startsWith('file://')) {
    return true;
  }
  
  console.warn('[isValidAudioPath] ❌ 无效的音频路径:', path);
  return false;
}