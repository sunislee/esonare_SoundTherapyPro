// @dr.pogodin/react-native-fs 使用具名导出，无默认导出
import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * 【坏文件固化防护】图片魔数（magic bytes）校验工具。
 *
 * 背景：ghproxy 缓存 miss 会回源到 raw.githubusercontent 的 404 HTML 错误页，
 * 该页面体积 >1KB，旧的「size>1024」判定会把它当作有效 webp 落盘并永久跳过重下，
 * 导致坏文件被固化。此处仅读取文件头若干字节做真实格式判定，杜绝 HTML/文本冒充图片。
 *
 * 支持格式：
 *   - WEBP : "RIFF" (0-3) + 任意4字节长度 (4-7) + "WEBP" (8-11)
 *   - JPEG : FF D8 (0-1)
 *   - PNG  : 89 50 4E 47 (0-3)
 *
 * 语义：静默、不抛异常；任何读取/解码失败一律返回 false（视为不合法）。
 */

// base64 字符表 → 6-bit 值，自实现以避免依赖 Buffer/atob（Hermes/node 通用）。
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS[i]] = i;
}

/** 将 base64 字符串解码为字节数组（忽略 '=' 填充与非表内字符）。 */
const base64ToBytes = (b64: string): number[] => {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64[i];
    if (c === '=' || c === '\n' || c === '\r') continue;
    const val = B64_LOOKUP[c];
    if (val === undefined) continue;
    buffer = (buffer << 6) | val;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }
  return bytes;
};

/**
 * 读取文件头 12 字节并判定是否为合法 WEBP / JPEG / PNG。
 * @param filePath 本地绝对路径
 * @returns true = 魔数合法；false = 不合法或读取失败（静默）
 */
export const hasValidImageMagicBytes = async (filePath: string): Promise<boolean> => {
  try {
    // 只读头部 12 字节即可覆盖三种格式判定所需长度，避免整文件读入。
    const b64 = await RNFS.read(filePath, 12, 0, 'base64');
    const b = base64ToBytes(b64);
    if (b.length < 4) return false;

    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return true;
    }
    // JPEG: FF D8
    if (b[0] === 0xff && b[1] === 0xd8) {
      return true;
    }
    // WEBP: "RIFF" .... "WEBP"（需要至少 12 字节）
    if (
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // R I F F
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50   // W E B P
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * 【取证日志】读取文件头 N 字节并返回 hex 字符串（默认 16 字节），用于 magic 门删除时
 * 打印"实际收到的前 16 字节"，区分 404 HTML(`3c 21 44 4f 43 ...` = "<!DOC") / gzip / 空文件等。
 * 静默失败：读取异常返回 `<read-error>`，绝不抛出。
 */
export const readMagicHexPrefix = async (filePath: string, n = 16): Promise<string> => {
  try {
    const b64 = await RNFS.read(filePath, n, 0, 'base64');
    const bytes = base64ToBytes(b64);
    if (bytes.length === 0) return '<empty>';
    return bytes.map((x) => x.toString(16).padStart(2, '0')).join(' ');
  } catch {
    return '<read-error>';
  }
};
