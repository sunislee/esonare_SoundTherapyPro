// 强制占用前几个资源 ID，防止业务图片与库图片冲突
console.log('Fixing Metro IDs...');
const id1 = require('./assets/images/loading_icon.webp');
const id2 = require('./assets/images/loading_icon.webp');
const id3 = require('./assets/images/loading_icon.webp');
const id4 = require('./assets/images/loading_icon.webp');
const id5 = require('./assets/images/loading_icon.webp');
console.log('Fixed IDs:', id1, id2, id3, id4, id5);
