/**
 * 一次性验收脚本：打印 mood='unknown' 下的推荐分布表（铁证，非断言）。
 *
 * 运行：node scripts/recommend_unknown_report.js
 *
 * 做法：用仓库自带 @babel/core 现场把 RecommendationEngine.ts 转成 CJS 后 require，
 * 直接调用真实引擎 recommend()——不复制评分逻辑。桩掉 '../constants/scenes'（引擎只在
 * sceneName/getSceneVisual 里用到 SCENES；sceneId/confidence 完全由 LOGICAL_SCENES+打分决定），
 * 从而绕开 react-native / RNFS 等重型依赖。
 */
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

// 1) 桩掉 constants/scenes（recommend 的 sceneId/confidence 不依赖它）。
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (typeof request === 'string' && request.includes('constants/scenes')) {
    return { SCENES: [] };
  }
  return origLoad.apply(this, arguments);
};

// 2) 现场转译 .ts（纯类型剥离 + ESM->CJS，无需 RN preset）。
require.extensions['.ts'] = function (module, filename) {
  const out = babel.transformFileSync(filename, {
    filename,
    presets: [require.resolve('@babel/preset-typescript')],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  module._compile(out.code, filename);
};

const ENGINE = path.join(__dirname, '..', 'src', 'services', 'RecommendationEngine.ts');
const { RecommendationEngine } = require(ENGINE);

// 3) 调用真实引擎。
function rec(hour, recentScenes) {
  const r = RecommendationEngine.recommend({ hour, mood: 'unknown', recentScenes, listeningDuration: 0 });
  return { id: r.sceneId, conf: r.confidence };
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const line = (c) => '-'.repeat(c);

// ---- 表1：24 整点，recentScenes=[] ----
console.log('=== 表1: mood=unknown, recentScenes=[] — 每个整点的赢家 ===');
console.log(pad('hour', 6) + pad('scene_id', 26) + 'confidence');
console.log(line(45));
const reach = new Set();
for (let h = 0; h < 24; h++) {
  const { id, conf } = rec(h, []);
  reach.add(id);
  console.log(pad(lpad(h, 2), 6) + pad(id, 26) + conf.toFixed(3));
}
console.log(line(45));
console.log('本表覆盖到的场景集合: ' + JSON.stringify([...reach].sort()));

// ---- 表2：hour=23 三组夜间 recentScenes ----
console.log('');
console.log('=== 表2: hour=23 深夜，recentScenes 递进（检验首推是否仍为禅钵/雨声）===');
console.log(pad('recentScenes', 46) + pad('winner scene_id', 26) + 'confidence');
console.log(line(80));
const nightCases = [
  [],
  ['healing_zen_bowl'],
  ['healing_zen_bowl', 'city_rain_urban'],
];
for (const rc of nightCases) {
  const { id, conf } = rec(23, rc);
  console.log(pad(JSON.stringify(rc), 46) + pad(id, 26) + conf.toFixed(3));
}

// ---- 表3：hour=12 午间 ----
console.log('');
console.log('=== 表3: hour=12 午间，recentScenes=[] ===');
{
  const { id, conf } = rec(12, []);
  console.log(pad('winner scene_id', 26) + 'confidence');
  console.log(line(40));
  console.log(pad(id, 26) + conf.toFixed(3));
}
