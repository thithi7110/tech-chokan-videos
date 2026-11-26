// 「1枚の図が育っていく」解説ショートの描画。
// シーンは「ノード（図の部品）の初期状態」と「ステップ（ナレーション1文ごと）の状態変化」だけで書く。
// 補間ロジックは engine.ts（lint と共通）。
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, Props, ResolvedScene, compile, propsAt, counterText, chipW, codeH} from './engine';

export type {ResolvedScene} from './engine';

const BG = '#10141f', PANEL = '#1a2030', BORDER = '#363e52';
const FONT = "'Noto Sans CJK JP','Noto Sans JP',sans-serif";
const MONO = "'DejaVu Sans Mono','Noto Sans Mono CJK JP',monospace";
const col = (v: any) => (typeof v === 'string' && C[v]) || v;

const Node: React.FC<{p: Props; fade: number}> = ({p, fade}) => {
  const c = col(p.color);
  const op = p.opacity * (1 - 0.7 * p.dim) * fade;
  if (op <= 0.001) return null;
  const wrap = (w: number, h: number, child: React.ReactNode) => (
    <div style={{position: 'absolute', left: p.x - w / 2, top: p.y - h / 2, width: w, height: h, opacity: op, transform: `scale(${p.scale})`}}>{child}</div>
  );
  switch (p.type) {
    case 'box':
      return wrap(p.w, p.h, (
        <div style={{width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 22, background: PANEL, border: `4px solid ${p.color === 'gray' ? BORDER : c}`,
          boxShadow: p.color === 'gray' ? 'none' : `0 0 36px ${c}55`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4}}>
          <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 50, color: C.white, whiteSpace: 'nowrap'}}>{p.label}</div>
          {p.sub ? <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.gray, whiteSpace: 'nowrap'}}>{p.sub}</div> : null}
        </div>));
    case 'chip':
      return wrap(chipW(p), p.size + 30, (
        <div style={{width: '100%', height: '100%', borderRadius: 999, background: c, color: '#0b0f17', fontFamily: MONO, fontWeight: 700, fontSize: p.size,
          display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap'}}>{p.text}</div>));
    case 'counter':
      return wrap(1000, p.size * 1.1 + (p.caption ? 46 : 0), (
        <div style={{textAlign: 'center'}}>
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: p.size, lineHeight: 1.1, color: c, whiteSpace: 'nowrap'}}>{counterText(p)}</div>
          {p.caption ? <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 34, color: C.gray}}>{p.caption}</div> : null}
        </div>));
    case 'bar':
      return (
        <div style={{position: 'absolute', left: p.x, top: p.y - p.h / 2 - 48, opacity: op}}>
          <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 30, color: C.gray, height: 44, whiteSpace: 'nowrap'}}>{p.label}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
            <div style={{width: Math.max(0, p.w), height: p.h, borderRadius: 10, background: c}} />
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 40, color: c, whiteSpace: 'nowrap'}}>{p.text}</div>
          </div>
        </div>);
    case 'text':
      return wrap(1000, p.size * 1.5, (
        <div style={{textAlign: 'center', fontFamily: FONT, fontWeight: p.weight, fontSize: p.size, lineHeight: 1.5, color: c, whiteSpace: 'nowrap'}}>{p.text}</div>));
    case 'dot':
      return wrap(p.r * 2, p.r * 2, <div style={{width: '100%', height: '100%', borderRadius: '50%', background: c, boxShadow: `0 0 24px ${c}`}} />);
    case 'code':
      return wrap(p.w, codeH(p), (
        <div style={{width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 18, background: '#0b0e16', border: `3px solid ${BORDER}`, overflow: 'hidden'}}>
          <div style={{height: 40, background: '#202738', display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 18}}>
            {['#ef4444', '#facc15', '#22c55e'].map((k) => <div key={k} style={{width: 14, height: 14, borderRadius: 7, background: k}} />)}
          </div>
          <div style={{padding: '12px 24px'}}>
            {p.lines.map((l: string, i: number) => (
              <div key={i} style={{fontFamily: MONO, fontSize: p.size, lineHeight: 1.5, whiteSpace: 'pre', color: i === Math.round(p.hl) ? C.yellow : C.white,
                background: i === Math.round(p.hl) ? '#facc1522' : 'transparent', borderRadius: 6}}>{l}</div>
            ))}
          </div>
        </div>));
    case 'line': {
      const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
      return (
        <svg style={{position: 'absolute', left: 0, top: 0, opacity: op}} width={1080} height={1920}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={c} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={p.dashed ? '14 14' : `${len} ${len}`} strokeDashoffset={p.dashed ? 0 : len * (1 - p.draw)} opacity={p.dashed ? p.draw : 1} />
          {p.text ? <text x={(p.x1 + p.x2) / 2} y={(p.y1 + p.y2) / 2 - 22} fill={C.gray} fontSize={30} fontWeight={700} fontFamily={FONT} textAnchor="middle" opacity={p.draw}>{p.text}</text> : null}
        </svg>);
    }
  }
  return null;
};

// ミケ：public/mike/<mood>_open.png と <mood>_close.png（片方しかなければそれを使う）
const Mike: React.FC<{mood: string; open: boolean; frame: number; moods: string[]; big: boolean}> = ({mood, open, frame, moods, big}) => {
  const bob = Math.sin(frame / 9) * 5;
  const has = (n: string) => moods.includes(n);
  const name = has(`${mood}_${open ? 'open' : 'close'}`) ? `${mood}_${open ? 'open' : 'close'}` : has(`${mood}_open`) ? `${mood}_open` : has(mood) ? mood : moods[0];
  // 画像の縦横比が違っても右下の枠（engine.ts の MIKE）に収まるよう、高さと幅の上限で合わせる
  return (
    <div style={{position: 'absolute', right: big ? 280 : 30, bottom: (big ? 240 : 60) + bob, width: big ? 520 : 360, height: big ? 600 : 400,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end'}}>
      <Img src={staticFile(`mike/${name}.png`)} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}} />
    </div>);
};

const Headline: React.FC<{text: string; hook: boolean; cta: boolean; opacity: number; dy: number}> = ({text, hook, cta, opacity, dy}) => (
  <div style={{position: 'absolute', left: 64, right: 64, top: cta ? 560 : hook ? 210 : 230, transform: `translateY(${dy}px)`, opacity,
    fontFamily: FONT, fontWeight: 900, fontSize: hook || cta ? 88 : 66, lineHeight: 1.3, color: C.white, textAlign: hook ? 'left' : 'center', whiteSpace: 'pre-line'}}>
    {text}
  </div>
);

export const Explainer: React.FC<{scene: ResolvedScene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const t = frame / scene.fps;
  const tracks = React.useMemo(() => compile(scene), [scene]);
  const moods = scene.moods || ['talk_open', 'talk_close'];

  const si = Math.max(0, scene.steps.findIndex((s, i) => t >= s.start && (i === scene.steps.length - 1 || t < scene.steps[i + 1].start)));
  const step = scene.steps[si];
  const since = step ? t - step.start : 0;
  const prev = si > 0 ? scene.steps[si - 1] : null;
  const fadeOut = interpolate(since, [0, 0.15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // 最初のステップは0フレーム目から見出しを出す（サムネになる）
  const fadeIn = si === 0 ? 1 : interpolate(since, [0.15, 0.4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // CTA ステップでは図を薄くする
  const ctaFade = step?.cta ? interpolate(since, [0, 0.4], [1, 0], {extrapolateRight: 'clamp'}) : 1;

  const env = scene.env[frame] || 0;
  const mouthOpen = env > 0.08 && Math.floor(frame / 3) % 2 === 0;

  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 30% 35%, #1b2a4a 0%, ${BG} 55%)`}}>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      <div style={{position: 'absolute', left: 64, top: 70, fontFamily: FONT, fontWeight: 900, fontSize: 34, color: C.white, letterSpacing: 2}}>
        TECH<span style={{color: C.red}}>朝刊</span><span style={{color: C.gray, fontSize: 28, marginLeft: 18, fontWeight: 700}}>ミケの図解</span>
      </div>
      <div style={{position: 'absolute', left: 64, top: 128, width: 72, height: 8, borderRadius: 4, background: C.blue}} />

      {prev && fadeOut < 1 ? <Headline text={prev.headline} hook={si - 1 === 0} cta={!!prev.cta} opacity={1 - fadeOut} dy={-16 * fadeOut} /> : null}
      {step ? <Headline text={step.headline} hook={si === 0} cta={!!step.cta} opacity={fadeIn} dy={20 * (1 - fadeIn)} /> : null}

      {Object.entries(scene.nodes).map(([id, spec]) => <Node key={id} p={propsAt(id, spec, tracks, t)} fade={ctaFade} />)}

      {step ? <Mike mood={step.mike || 'talk'} open={mouthOpen} frame={frame} moods={moods} big={!!step.cta} /> : null}
    </AbsoluteFill>
  );
};
