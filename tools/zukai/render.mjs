// node render.mjs <props.json> <outdir> : 動画・サムネ・ステップごとの確認画像を書き出す
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import fs from 'fs'; import path from 'path';
const [propsPath, outDir] = process.argv.slice(2);
const inputProps = JSON.parse(fs.readFileSync(propsPath, 'utf-8'));
fs.mkdirSync(path.join(outDir, 'short_frames'), {recursive: true});
const browserExecutable = process.env.CHROME || '/usr/bin/google-chrome';  // setup.sh が見つけたパスを CHROME で渡せる
const common = {browserExecutable, chromeMode: 'chrome-for-testing', logLevel: 'error'};
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps, ...common});
const {fps, steps} = inputProps.scene;
// サムネ（最初のフレーム）と、各ステップの終わり直前
const stills = [['v00', 0], ...steps.map((s, i) => [`k${String(i).padStart(2, '0')}`, Math.floor((s.start + s.len - 0.1) * fps)])];
for (const [name, frame] of stills)
  await renderStill({serveUrl, composition, inputProps, frame, output: path.join(outDir, 'short_frames', `${name}.png`), ...common});
if (!process.env.STILLS_ONLY)
  await renderMedia({serveUrl, composition, inputProps, codec: 'h264', crf: 20, x264Preset: 'veryfast', outputLocation: path.join(outDir, 'short.mp4'), ...common});
console.log('rendered', outDir);
