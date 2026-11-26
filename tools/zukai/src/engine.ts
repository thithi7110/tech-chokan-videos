// 描画に依存しない部分：既定値・補間・おおよその占有範囲（配置チェック用）。
// Remotion（描画）と lint.ts（node で実行するチェック）の両方から使う。

export type Props = Record<string, any>;
export type NodeType = 'box' | 'chip' | 'counter' | 'bar' | 'text' | 'dot' | 'line' | 'code';
export type NodeSpec = {type: NodeType} & Props;
export type Key = {at?: number; dur?: number; ease?: 'inOut' | 'out' | 'linear'; set?: Record<string, Props>; show?: string[]; hide?: string[]};
export type Step = {headline: string; narration: string; mike?: string; keys?: Key[]; cta?: boolean; start: number; len: number};
export type ResolvedScene = {fps: number; total: number; audio: string | null; env: number[]; nodes: Record<string, NodeSpec>; steps: Step[]; moods?: string[]};

export const C: Record<string, string> = {
  gray: '#8b93a7', blue: '#3b82f6', green: '#22c55e', red: '#ef4444', yellow: '#facc15', white: '#f3f4f6',
};
export const W = 1080, H = 1920;
// 図を置いてよい範囲（見出しの下〜ミケの上）。ミケは右下の MIKE 範囲を占める。
export const SAFE = {x0: 40, x1: 1040, y0: 470, y1: 1860};
export const MIKE = {x0: 690, y0: 1440, x1: 1060, y1: 1880};  // ミケの枠：右30・下60、幅360・高さ400

export const DEFAULTS: Record<string, Props> = {
  common: {x: 540, y: 960, opacity: 0, scale: 0.92, color: 'gray', dim: 0},
  box: {w: 300, h: 150, label: '', sub: ''},
  chip: {text: '', size: 34},
  counter: {value: 0, decimals: 0, prefix: '', suffix: '', size: 96, caption: ''},
  bar: {w: 0, h: 44, label: '', text: ''},
  text: {text: '', size: 36, weight: 700},
  dot: {r: 16},
  line: {x1: 0, y1: 0, x2: 0, y2: 0, draw: 0, dashed: false, text: ''},
  code: {lines: [] as string[], size: 38, w: 820, hl: -1},
};

export const isColor = (v: any) => typeof v === 'string' && (v in C || v.startsWith('#'));

// ---- イージング・色補間（依存なしで自前実装） ----
const cubicInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const cubicOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeOf = (e: string) => (e === 'linear' ? (p: number) => p : e === 'out' ? cubicOut : cubicInOut);
const hex = (s: string) => { const h = (C[s] || s).replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
export const mixColor = (a: string, b: string, p: number) => {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * p).toString(16).padStart(2, '0')).join('');
};

type Track = {t0: number; t1: number; to: any; ease: string};
export type Tracks = Record<string, Record<string, Track[]>>;

export function compile(scene: {steps: Step[]}): Tracks {
  const tracks: Tracks = {};
  const push = (id: string, p: string, tr: Track) => { ((tracks[id] ||= {})[p] ||= []).push(tr); };
  for (const s of scene.steps) {
    for (const k of s.keys || []) {
      const t0 = s.start + (k.at || 0);
      const t1 = t0 + (k.dur ?? 0.4);
      const ease = k.ease || 'inOut';
      for (const id of k.show || []) { push(id, 'opacity', {t0, t1, to: 1, ease: 'out'}); push(id, 'scale', {t0, t1, to: 1, ease: 'out'}); }
      for (const id of k.hide || []) push(id, 'opacity', {t0, t1, to: 0, ease});
      for (const [id, props] of Object.entries(k.set || {})) for (const [p, v] of Object.entries(props)) push(id, p, {t0, t1, to: v, ease});
    }
  }
  for (const n of Object.values(tracks)) for (const arr of Object.values(n)) arr.sort((a, b) => a.t0 - b.t0);
  return tracks;
}

export function valueAt(init: any, trs: Track[] | undefined, t: number) {
  let v = init;
  for (const tr of trs || []) {
    if (t < tr.t0) break;
    const p = tr.t1 <= tr.t0 ? 1 : Math.min(1, (t - tr.t0) / (tr.t1 - tr.t0));
    if (typeof tr.to === 'number' && typeof v === 'number') v = v + (tr.to - v) * easeOf(tr.ease)(p);
    else if (isColor(tr.to) && isColor(v)) v = p >= 1 ? tr.to : mixColor(v, tr.to, easeOf(tr.ease)(p));
    else v = tr.to;
  }
  return v;
}

export function propsAt(id: string, spec: NodeSpec, tracks: Tracks, t: number): Props {
  const base = {...DEFAULTS.common, ...DEFAULTS[spec.type], ...spec};
  const p: Props = {type: spec.type};
  for (const k of Object.keys(base)) if (k !== 'type') p[k] = valueAt(base[k], tracks[id]?.[k], t);
  return p;
}

// ---- 文字幅の見積もり（全角=1、半角=0.6） ----
export const textW = (s: string, size: number, mono = false) =>
  [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) < 0x2e80 ? (mono ? 0.6 : 0.58) : 1), 0) * size;

export const counterText = (p: Props) =>
  p.prefix + Number(p.value).toLocaleString('ja-JP', {minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals}) + p.suffix;

export const chipW = (p: Props) => textW(p.text, p.size, true) + 48;
export const codeH = (p: Props) => 70 + p.lines.length * p.size * 1.5;

// おおよその占有範囲 [x0,y0,x1,y1]（scale は 1 として計算）
export function bbox(p: Props): [number, number, number, number] | null {
  switch (p.type) {
    case 'box': return [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2];
    case 'chip': { const w = chipW(p); return [p.x - w / 2, p.y - (p.size + 30) / 2, p.x + w / 2, p.y + (p.size + 30) / 2]; }
    case 'counter': {
      const w = Math.max(textW(counterText(p), p.size, true), p.caption ? textW(p.caption, 34) : 0);
      const h = p.size * 1.1 + (p.caption ? 46 : 0);
      return [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
    }
    case 'bar': { const w = p.w + 20 + textW(p.text, 40, true); return [p.x, p.y - p.h / 2 - 48, p.x + Math.max(w, textW(p.label, 30)), p.y + p.h / 2]; }
    case 'text': { const w = textW(p.text, p.size); return [p.x - w / 2, p.y - p.size * 0.75, p.x + w / 2, p.y + p.size * 0.75]; }
    case 'dot': return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
    case 'code': { const h = codeH(p); return [p.x - p.w / 2, p.y - h / 2, p.x + p.w / 2, p.y + h / 2]; }
    default: return null; // line は重なり判定しない
  }
}
