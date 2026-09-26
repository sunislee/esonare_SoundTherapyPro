#!/usr/bin/env node
/**
 * 【常量层场景/资源 ID 静态自检 · CI 闸门】
 *
 * 为什么存在（2026-09 取证结论）：
 *   首页「永久卡在 0% 准备中」类故障的历史根因不在运行期，而在常量层 ID 漂移——
 *   BUILTIN_SCENES 曾出现 id 拼错（life_rain_urban，真实为 city_rain_urban），导致内置短路
 *   静默失效、场景回落下载；filename/expectedSize 与 AUDIO_MANIFEST 不一致时，
 *   BuiltinAssetBootstrap 的落盘目标 ≠ OfflineService.getLocalPath 判定路径，就绪真相恒为 false。
 *   BuiltinSceneIntegrity.test.ts 已锁死内置四条不变式，本脚本补它不覆盖的全量交叉面。
 *
 * 检查项（任一失败 → exit 1）：
 *   A. AUDIO_MANIFEST 无重复 id，每条含 filename/category/size>0
 *   B. manifest ↔ ASSET_LIST 双向对齐（无孤儿、无缺失）
 *   C. 硬编码 id 清单（SMALL_SCENE_IDS / SCENE_ORDER / RECORD_SHOP_SFX_IDS）无死 id
 *   D. BUILTIN_SCENES 每个 id ∈ 场景集合，且 filename/expectedSize 与 manifest 一致
 *   E. sceneKey（若存在）必须指向现存场景 —— tickSceneByAsset 依赖它做 assetId→sceneId 映射
 *
 * 用法：node scripts/check-scene-ids.js
 * 取舍：正则直解 TS 源，不引入 ts-node/babel —— 本脚本必须在无 RN 环境下可跑（CI 友好）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 取 marker 之后第一个 '[' 或 '{' 起始的平衡括号块（自适应数组/对象字面量）。 */
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const ai = src.indexOf('[', start);
  const oi = src.indexOf('{', start);
  const i = ai < 0 ? oi : oi < 0 ? ai : Math.min(ai, oi);
  if (i < 0) throw new Error(`no block for: ${marker}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error(`unbalanced block for: ${marker}`);
}

/**
 * 构建「标识符表达式 → 字符串值」符号表：解析 `const NAME = { KEY: 'value', ... }` 形式的资源常量表。
 * 必要性：AUDIO_MANIFEST 里 interactive_* / life_record_shop_* 等条目的 filename 写成
 *   `filename: AMBIENT_RESOURCES.WHITE_NOISE`（标识符引用）。若正则只认字符串字面量，
 *   会把这些合法条目误报为「缺 filename」——本表用于把它们解析回真实路径再校验。
 */
function buildSymbolTable(src) {
  const table = new Map();
  for (const m of src.matchAll(/(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*\{([\s\S]*?)\n\};/g)) {
    const name = m[1];
    for (const kv of m[2].matchAll(/^\s*(\w+)\s*:\s*'([^']*)'/gm)) table.set(`${name}.${kv[1]}`, kv[2]);
  }
  return table;
}

/** 解析字段值：字符串字面量直接取值；`A.B` 形式查符号表；无法解析返回 null。 */
function resolveValue(token, table) {
  if (!token) return null;
  const t = token.trim();
  const lit = t.match(/^'([^']*)'$/);
  if (lit) return lit[1];
  if (table.has(t)) return table.get(t);
  return null;
}

/** 从块中切出每个顶层对象的关键字段（filename/category 支持字面量或符号表引用）。 */
function parseObjects(block, table) {
  const bodies = [];
  let depth = 0;
  let buf = '';
  for (const c of block) {
    if (c === '{') { depth++; if (depth === 1) { buf = ''; continue; } }
    if (c === '}') { depth--; if (depth === 0) { bodies.push(buf); continue; } }
    if (depth >= 1) buf += c;
  }
  return bodies.map((b) => {
    const raw = (k) => (b.match(new RegExp(`\\b${k}\\s*:\\s*([^,}]+)`)) || [])[1];
    return {
      id: resolveValue(raw('id'), table) ?? undefined,
      filenameRaw: raw('filename'),
      filename: resolveValue(raw('filename'), table),
      category: resolveValue(raw('category'), table),
      sceneKey: resolveValue(raw('sceneKey'), table),
      size: Number((b.match(/\bsize\s*:\s*(\d+)/) || [])[1]),
    };
  }).filter((r) => r.id);
}

/** 取 `const X = [...]` 形式的字符串 id 清单；不存在返回 null。 */
function parseIdList(src, marker) {
  if (src.indexOf(marker) < 0) return null;
  return [...extractBlock(src, marker).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** 取 `const X: Record<string, number> = { id: 1, ... }` 形式的对象键清单。 */
function parseObjectKeys(src, marker) {
  if (src.indexOf(marker) < 0) return null;
  return [...extractBlock(src, marker).matchAll(/^\s*(\w+)\s*:\s*\d+/gm)].map((m) => m[1]);
}

const failures = [];
const fail = (m) => failures.push(m);
const ok = (m) => console.log(`  ✅ ${m}`);

const aaSrc = readSrc('src/constants/audioAssets.ts');
const scSrc = readSrc('src/constants/scenes.ts');

const symbolTable = buildSymbolTable(aaSrc);
const manifest = parseObjects(extractBlock(aaSrc, 'export const AUDIO_MANIFEST'), symbolTable);
const assetList = parseObjects(extractBlock(aaSrc, 'export const ASSET_LIST'), symbolTable);

// 场景集合：与 scenes.ts 生成式一致（排除 8track_ 多轨素材与 bg_ 背景图）。
const sceneIds = new Set(
  manifest.filter((m) => !m.id.startsWith('8track_') && !m.id.startsWith('bg_')).map((m) => m.id),
);

console.log(`\n=== 场景/资源 ID 自检 ===\nmanifest=${manifest.length} ASSET_LIST=${assetList.length} 场景=${sceneIds.size}\n`);

// A. manifest 自洽
for (const [i, m] of manifest.entries()) {
  if (manifest.findIndex((x) => x.id === m.id) !== i) fail(`A. manifest 重复 id: ${m.id}`);
  if (m.filename === null || m.filename === undefined) {
    fail(`A. manifest[${m.id}] filename 缺失或无法解析（原文=${String(m.filenameRaw).trim()}，符号表未命中）`);
  } else if (!m.filename.trim()) {
    fail(`A. manifest[${m.id}] filename 为空串 → getLocalPath/下载 URL 会变空串`);
  }
  if (!m.category) fail(`A. manifest[${m.id}] 缺 category`);
  if (!(m.size > 0)) fail(`A. manifest[${m.id}] size 必须 > 0（就绪按 size≥95% 判定）`);
}
ok(`A. manifest 自洽：${manifest.length} 条，无重复 id / 空 filename / 零 size`);

// B. manifest ↔ ASSET_LIST 双向对齐
{
  const mIds = new Set(manifest.map((m) => m.id));
  const aIds = new Set(assetList.map((a) => a.id));
  for (const id of mIds) if (!aIds.has(id)) fail(`B. manifest 有但 ASSET_LIST 缺: ${id}`);
  for (const id of aIds) if (!mIds.has(id)) fail(`B. ASSET_LIST 有但 manifest 缺（孤儿）: ${id}`);
  ok(`B. manifest ↔ ASSET_LIST 双向对齐：${mIds.size} / ${aIds.size}`);
}

// C. 硬编码 id 清单不得含死 id
for (const [name, src, kind] of [
  ['SMALL_SCENE_IDS', scSrc, 'list'],
  ['RECORD_SHOP_SFX_IDS', scSrc, 'list'],
  ['SCENE_ORDER', scSrc, 'keys'],
]) {
  const ids = kind === 'keys' ? parseObjectKeys(src, `const ${name}`) : parseIdList(src, `const ${name}`);
  if (!ids) { console.log(`  ⚠️ C. 未找到 ${name}，跳过`); continue; }
  const dead = ids.filter((id) => !sceneIds.has(id));
  if (dead.length) fail(`C. ${name} 含不存在的场景 id: ${dead.join(', ')}`);
  else ok(`C. ${name} 全部命中现存场景（${ids.length} 个）`);
}

// D. BUILTIN_SCENES ↔ SCENES ↔ manifest（与 BuiltinSceneIntegrity.test.ts 同向，脚本侧兜底）
{
  const start = aaSrc.indexOf('export const BUILTIN_SCENES');
  if (start < 0) throw new Error('BUILTIN_SCENES not found');
  const eq = aaSrc.indexOf('= {', start); // 跳过类型注解 Readonly<Record<string, {...}>> 里的 '{'
  if (eq < 0) throw new Error('BUILTIN_SCENES initializer not found');
  const oi = eq + 2;
  let depth = 0, block = '';
  for (let j = oi; j < aaSrc.length; j++) {
    const c = aaSrc[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { block = aaSrc.slice(oi, j + 1); break; } }
  }
  const builtin = [...block.matchAll(/(\w+)\s*:\s*\{\s*filename:\s*'([^']+)',\s*assetPath:\s*'([^']+)',\s*expectedSize:\s*(\d+)/g)]
    .map((m) => ({ id: m[1], filename: m[2], assetPath: m[3], expectedSize: Number(m[4]) }));
  if (!builtin.length) fail('D. 未解析到 BUILTIN_SCENES 条目（正则失配，需修脚本）');

  const byId = new Map(manifest.map((m) => [m.id, m]));
  for (const b of builtin) {
    if (!sceneIds.has(b.id)) fail(`D. BUILTIN_SCENES id 不存在于场景集合: ${b.id}（内置短路静默失效）`);
    const m = byId.get(b.id);
    if (!m) continue;
    if (m.filename !== b.filename)
      fail(`D. BUILTIN[${b.id}].filename=${b.filename} ≠ manifest.filename=${m.filename}（落盘目标≠就绪判定路径 → 永久准备中）`);
    if (m.size !== b.expectedSize) fail(`D. BUILTIN[${b.id}].expectedSize=${b.expectedSize} ≠ manifest.size=${m.size}`);
    if (!b.assetPath.endsWith(b.filename)) fail(`D. BUILTIN[${b.id}].assetPath 未镜像 filename: ${b.assetPath}`);
  }
  ok(`D. BUILTIN_SCENES ↔ manifest 对齐：${builtin.length} 个内置场景`);
}

// E. sceneKey（当前为 0 条，留作前向闸门）
{
  const withKey = manifest.filter((m) => m.sceneKey);
  for (const m of withKey) {
    if (!sceneIds.has(m.sceneKey))
      fail(`E. manifest[${m.id}].sceneKey=${m.sceneKey} 不是现存场景（tickSceneByAsset 会丢进度）`);
  }
  ok(`E. sceneKey 检查：${withKey.length} 条带 key，全部指向现存场景`);
}

console.log('');
if (failures.length) {
  console.error(`❌ 自检失败 ${failures.length} 项：`);
  for (const f of failures) console.error('   - ' + f);
  process.exit(1);
}
console.log('✅ 全部通过：常量层 ID 交叉面一致。');
