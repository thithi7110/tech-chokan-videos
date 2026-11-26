"""図解ショートを作る：シーンJSON → 音声（VOICEVOX）→ 配置チェック → Remotion で描画。

使い方: python3 build.py scene.json OUTDIR
出力（今の入口ショートと同じ名前）:
  OUTDIR/short.mp4, short_title.txt, short_desc.txt, short_frames/v00.png（サムネ）, short_frames/kNN.png（各ステップの終わり）,
  OUTDIR/check.png（全ステップを並べた確認用の1枚）
環境変数: VV_DIR（VOICEVOX）, LINT_ONLY=1（音声と配置チェックだけ）, STILLS_ONLY=1（動画を書き出さない）, FORCE=1（配置エラーでも描画）
シーンJSONの書き方は SCENE_GUIDE.md。
"""
import os, sys, json, wave, subprocess, glob
import numpy as np, pyopenjtalk
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

VV = os.environ.get("VV_DIR", "/home/claude/vv")
SPEAKER, SPEED, FPS, GAP, TAIL = 2, 1.15, 30, 0.35, 0.8  # 2 = 四国めたん ノーマル
ROOT = os.path.dirname(os.path.abspath(__file__))

src, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
scene = json.load(open(src, encoding="utf-8"))
name = "short"

# ---- 音声 ----
ort = Onnxruntime.load_once(filename=f"{VV}/voicevox_onnxruntime-linux-x64-1.17.3/lib/libvoicevox_onnxruntime.so.1.17.3")
syn = Synthesizer(ort, OpenJtalk(os.path.join(os.path.dirname(pyopenjtalk.__file__), "open_jtalk_dic_utf_8-1.11")))
with VoiceModelFile.open(f"{VV}/vvms/0.vvm") as m:
    syn.load_voice_model(m)

pcm, rate, t = [], 24000, 0.0
for s in scene["steps"]:
    q = syn.create_audio_query(s["narration"], SPEAKER)
    q.speed_scale = SPEED
    open("/tmp/_n.wav", "wb").write(syn.synthesis(q, SPEAKER))
    with wave.open("/tmp/_n.wav") as w:
        rate = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    s["start"], s["len"] = round(t, 3), round(len(a) / rate + GAP, 3)
    pcm += [a, np.zeros(int(GAP * rate), np.int16)]
    t += s["len"]
pcm.append(np.zeros(int(TAIL * rate), np.int16))
audio = np.concatenate(pcm)
os.makedirs(f"{ROOT}/public/audio", exist_ok=True)
with wave.open(f"{ROOT}/public/audio/{name}.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(audio.tobytes())

hop = rate // FPS
env = [float(np.sqrt(np.mean((audio[i:i + hop].astype(float) / 32768) ** 2))) for i in range(0, len(audio), hop)]
mx = max(env) or 1
moods = sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(f"{ROOT}/public/mike/*.png"))
resolved = {"fps": FPS, "total": round(len(audio) / rate, 3), "audio": f"audio/{name}.wav", "env": [round(e / mx, 3) for e in env],
            "nodes": scene["nodes"], "steps": scene["steps"], "moods": moods}
pj = os.path.join(OUT, "props.json")
json.dump({"scene": resolved}, open(pj, "w", encoding="utf-8"), ensure_ascii=False)
total = resolved["total"]
print(f"長さ {total:.1f}秒 / ステップ {len(scene['steps'])}")
for i, s in enumerate(scene["steps"]):
    print(f"  {i}: {s['start']:5.1f}s +{s['len']:.1f}s  {s['headline'].replace(chr(10), ' ')}")

# ---- 配置チェック ----
r = subprocess.run(["npx", "tsx", "src/lint.ts", pj], cwd=ROOT, capture_output=True, text=True)
print(r.stdout.strip())
if r.returncode != 0 and not os.environ.get("FORCE"):
    print("配置チェックでエラー。シーンJSONを直して再実行（FORCE=1 で強行）"); sys.exit(2)
if os.environ.get("LINT_ONLY"):
    sys.exit(0)

# ---- タイトル・概要欄 ----
meta = scene.get("meta", {})
if meta:
    open(f"{OUT}/short_title.txt", "w", encoding="utf-8").write(f"{meta['title']} #Shorts")
    k = meta.get("kaisetsu")
    desc = [meta.get("intro", ""), ""]
    if k:
        desc += [f"▶ {k['minutes']}分の{k['kind']}動画はこちら（{k['title']}）", "{MAIN_URL}", ""]
    desc += ["エンジニア向けのテックニュースを毎朝6時にまとめています。", "音声：VOICEVOX:四国めたん", "", meta.get("hashtags", "#テック朝刊")]
    open(f"{OUT}/short_desc.txt", "w", encoding="utf-8").write("\n".join(desc))

# ---- 描画 ----
subprocess.run(["node", "render.mjs", pj, os.path.abspath(OUT)], cwd=ROOT, check=True)
frames = sorted(glob.glob(f"{OUT}/short_frames/k*.png"))
cols = min(len(frames), 5)
rows = -(-len(frames) // cols)
args = sum([["-i", f] for f in frames], [])
subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex",
                "".join(f"[{i}]scale=324:-1[s{i}];" for i in range(len(frames))) + "".join(f"[s{i}]" for i in range(len(frames)))
                + f"xstack=inputs={len(frames)}:layout=" + "|".join(f"{(i % cols) * 324}_{(i // cols) * 576}" for i in range(len(frames)))
                + f":fill=black", f"{OUT}/check.png"] if len(frames) > 1 else ["true"], check=True)
if total < 45: print(f"WARN 短い（{total:.0f}秒）。目安は50〜65秒")
if total > 70: print(f"WARN 長い（{total:.0f}秒）。目安は50〜65秒")
print("done", OUT)
