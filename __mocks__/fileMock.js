// 二进制资源(图片等)在单测里无需真实内容，统一 stub 成字符串占位。
//   App.test.tsx 渲染整棵 App 树会触达 node_modules 内包 import 的 .png，
//   RN preset 的 asset transform 受 transformIgnorePatterns 限制不覆盖这些包 → 直接映射绕过解析。
module.exports = 'test-file-stub';
