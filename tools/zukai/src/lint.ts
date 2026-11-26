// 配置チェック：npx tsx src/lint.ts out/<name>.props.json
// 各ステップの途中と終わりで、見えている部品の「はみ出し・重なり・ミケとの重なり」と、見出しの長さを調べる。
// ERROR が1つでもあれば終了コード1。
import fs from 'fs';
import {ResolvedScene, compile, propsAt, bbox, textW, SAFE, MIKE} from './engine';

const scene: ResolvedScene = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8')).scene;
const tracks = compile(scene);
const out: string[] = [];
let errors = 0;
const err = (m: string) => { errors++; out.push('ERROR ' + m); };
const warn = (m: string) => out.push('WARN  ' + m);
const ids = new Set(Object.keys(scene.nodes));
const hit = (a: number[], b: number[], pad = 8) => a[0] < b[2] - pad && b[0] < a[2] - pad && a[1] < b[3] - pad && b[1] < a[3] - pad;

scene.steps.forEach((s, i) => {
  const tag = `step${i}「${s.headline.replace(/\n/g, '')}」`;
  // 見出しの長さ
  const lines = s.headline.split('\n');
  const max = i === 0 || s.cta ? 10.5 : 14;
  for (const l of lines) if (textW(l, 1) > max) err(`${tag} 見出しの1行が長い（${l}）。全角${max}字以内で改行する`);
  if (lines.length > (i === 0 || s.cta ? 3 : 2)) err(`${tag} 見出しの行数が多い`);
  // keys
  for (const k of s.keys || []) {
    for (const id of [...(k.show || []), ...(k.hide || []), ...Object.keys(k.set || {})]) if (!ids.has(id)) err(`${tag} 未定義の部品 ${id}`);
    if ((k.at || 0) + (k.dur ?? 0.4) > s.len + 0.01) warn(`${tag} at+dur がステップの長さ(${s.len.toFixed(1)}s)を超える。次のステップにずれ込む`);
  }
  if (s.cta) return;
  for (const t of [s.start + s.len * 0.5, s.start + s.len - 0.05]) {
    const vis: [string, number[], string][] = [];
    for (const [id, spec] of Object.entries(scene.nodes)) {
      const p = propsAt(id, spec, tracks, t);
      if (p.opacity < 0.5) continue;
      const b = bbox(p);
      if (!b) continue;
      if (b[0] < SAFE.x0 || b[2] > SAFE.x1 || b[1] < SAFE.y0 || b[3] > SAFE.y1)
        err(`${tag} ${id} が表示範囲の外（x ${b[0] | 0}〜${b[2] | 0}, y ${b[1] | 0}〜${b[3] | 0}）。範囲は x ${SAFE.x0}〜${SAFE.x1}, y ${SAFE.y0}〜${SAFE.y1}`);
      if (hit(b, [MIKE.x0, MIKE.y0, MIKE.x1, MIKE.y1])) err(`${tag} ${id} がミケの場所（右下 x>${MIKE.x0}, y>${MIKE.y0}）と重なる`);
      if (p.type !== 'dot') vis.push([id, b, p.type]);
    }
    for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++)
      if (hit(vis[a][1], vis[b][1])) err(`${tag} ${vis[a][0]} と ${vis[b][0]} が重なる（t=${t.toFixed(1)}s）`);
  }
});
const uniq = [...new Set(out)];
console.log(uniq.length ? uniq.join('\n') : 'OK 配置チェック問題なし');
console.log(`steps=${scene.steps.length} total=${scene.total}s errors=${new Set(out.filter((x) => x.startsWith('ERROR'))).size}`);
process.exit(errors ? 1 : 0);
