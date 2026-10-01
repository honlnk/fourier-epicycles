/**
 * 把 "honlnk" 用 Great Vibes（Google Fonts 花体签名体）转成 SVG 路径数据。
 * 用法：node gen.js
 * 输出：signature-path.txt（路径 d 字符串）+ preview.html（大图预览）
 * 字体：Great Vibes, Copyright 2010 The Great Vibes Pro Project Authors (SIL OFL 1.1)
 *
 * 说明：opentype.js 的整段排版会因该字体的 GSUB 查找表报错，
 * 这里改为逐字形手动排版（advance + kerning），完全绕开文本整形。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const HERE = __dirname;
const font = opentype.parse(fs.readFileSync(path.join(HERE, 'GreatVibes-Regular.ttf')));

const TEXT = 'honlnk';
const SIZE = 100; // 字号（单位任意，最终页面会自动缩放）

const glyphs = [...TEXT].map(ch => font.charToGlyph(ch));
const scale = SIZE / font.unitsPerEm;

let x = 0;
const combined = new opentype.Path();
for (let i = 0; i < glyphs.length; i++) {
  const g = glyphs[i];
  const gp = g.getPath(x, 0, SIZE);
  combined.commands.push(...gp.commands);
  let kern = 0;
  if (i < glyphs.length - 1) {
    kern = font.getKerningValue(g, glyphs[i + 1]) * scale;
  }
  x += g.advanceWidth * scale + kern;
}

// 自己序列化路径：opentype.js 的 toPathData 对缺失控制点的命令会输出 NaN，
// 这里做容错处理——缺控制点的 Q/C 降级为 L。
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fmt = v => String(Math.round(v * 10) / 10);
let d = '';
let degraded = 0;
for (const c of combined.commands) {
  if (c.type === 'M' && finite(c.x) && finite(c.y)) {
    d += `M${fmt(c.x)} ${fmt(c.y)}`;
  } else if (c.type === 'L' && finite(c.x) && finite(c.y)) {
    d += `L${fmt(c.x)} ${fmt(c.y)}`;
  } else if (c.type === 'Q' && finite(c.x1) && finite(c.y1) && finite(c.x) && finite(c.y)) {
    d += `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
  } else if (c.type === 'C' && [c.x1, c.y1, c.x2, c.y2, c.x, c.y].every(finite)) {
    d += `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
  } else if ((c.type === 'Q' || c.type === 'C') && finite(c.x) && finite(c.y)) {
    d += `L${fmt(c.x)} ${fmt(c.y)}`;
    degraded++;
  } else if (c.type === 'Z') {
    d += 'Z';
  }
}
if (/NaN/.test(d)) throw new Error('生成的路径数据包含 NaN，拒绝输出');

let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
for (const c of combined.commands) {
  for (const v of [c.x, c.x1, c.x2]) {
    if (finite(v)) { x1 = Math.min(x1, v); x2 = Math.max(x2, v); }
  }
  for (const v of [c.y, c.y1, c.y2]) {
    if (finite(v)) { y1 = Math.min(y1, v); y2 = Math.max(y2, v); }
  }
}
const bbox = { x1, y1, x2, y2 };
console.log('path data length:', d.length);
console.log('degraded Q/C -> L:', degraded);
console.log('bbox:', JSON.stringify(bbox));
console.log('bbox:', JSON.stringify(bbox));
console.log('commands:', combined.commands.length);

fs.writeFileSync(path.join(HERE, 'signature-path.txt'), d, 'utf8');

// 生成一个预览页面（黑底青线，方便视觉检查）
const w = Math.ceil(bbox.x2 - bbox.x1) + 40;
const h = Math.ceil(bbox.y2 - bbox.y1) + 40;
const preview = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>honlnk signature preview</title>
<style>body{background:#0b0e14;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
svg{width:90vw;max-width:1200px;height:auto}</style></head>
<body>
<svg viewBox="${bbox.x1 - 20} ${bbox.y1 - 20} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <path d="${d}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
</body></html>`;
fs.writeFileSync(path.join(HERE, 'preview.html'), preview, 'utf8');
console.log('wrote signature-path.txt & preview.html');
