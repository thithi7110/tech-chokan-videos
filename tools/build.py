"""テック朝刊の動画を script.json から作る。

使い方: python3 tools/build.py script.json OUTDIR
出力: OUTDIR/video.mp4, OUTDIR/title.txt, OUTDIR/desc.txt, OUTDIR/frames/*.png

script.json の形:
{
  "date": "2026/11/03（火）",
  "subtitle": "表紙に出す一言の総括",
  "title": "YouTubeのタイトル（100字以内、< > を含めない）",
  "intro": "概要欄の冒頭（1〜3行）",
  "slides": [
    {"cat": "opening", "head": "テック朝刊", "lines": [], "src": "", "narration": "..."},
    {"cat": "🔥 今日の注目", "head": "見出し", "lines": ["要点", "→ 自分ごとの一言"], "src": "出典名", "narration": "読み上げ原稿"},
    ...
    {"cat": "ending", "head": "今日のまとめ", "lines": [...], "src": "", "narration": "..."}
  ],
  "sources": [{"label": "記事名", "url": "https://..."}],
  "hashtags": "#テックニュース #エンジニア"
}
narration は英単語をカタカナ読みに、バージョン番号は「1点13点0」のように書く。
"""
import os, sys, html, json, glob, wave, subprocess
import pyopenjtalk
from playwright.sync_api import sync_playwright
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

VV = os.environ.get("VV_DIR", "/home/claude/vv")
SPEAKER = 2  # 四国めたん ノーマル
SPEED = 1.1

spec = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
FR = os.path.join(OUT, "frames"); os.makedirs(FR, exist_ok=True)
DATE = spec["date"]; SLIDES = spec["slides"]

FONT = "'Noto Sans CJK JP','Noto Sans JP',sans-serif"
CSS = f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1920px;height:1080px;font-family:{FONT};background:#0f172a;color:#e2e8f0;overflow:hidden}}
.wrap{{position:absolute;inset:0;padding:90px 120px}}
.bar{{position:absolute;left:0;top:0;width:16px;height:100%;background:#38bdf8}}
.cat{{font-size:40px;color:#38bdf8;font-weight:700;letter-spacing:2px}}
h1{{font-size:72px;line-height:1.25;margin:28px 0 56px;font-weight:900;color:#f8fafc}}
ul{{list-style:none}}
li{{font-size:44px;line-height:1.5;margin-bottom:22px;padding-left:44px;position:relative}}
li:before{{content:'';position:absolute;left:0;top:26px;width:16px;height:16px;border-radius:50%;background:#64748b}}
li.arrow{{color:#fde68a}} li.arrow:before{{background:#fbbf24}}
.foot{{position:absolute;left:120px;right:120px;bottom:60px;display:flex;justify-content:space-between;font-size:30px;color:#94a3b8}}
.cover{{display:flex;flex-direction:column;justify-content:center;height:100%}}
.cover .t{{font-size:150px;font-weight:900;color:#f8fafc}}
.cover .d{{font-size:56px;color:#38bdf8;margin:20px 0 40px}}
.cover .s{{font-size:52px;line-height:1.4;color:#e2e8f0}}
"""
e = html.escape

def slide_html(i, s):
    if s["cat"] == "opening":
        body = (f"<div class='bar'></div><div class='wrap'><div class='cover'><div class='t'>テック朝刊</div>"
                f"<div class='d'>{e(DATE)}　エンジニア向けテックニュース</div><div class='s'>{e(spec.get('subtitle',''))}</div></div></div>")
    else:
        lis = "".join(f"<li class='arrow'>{e(l)}</li>" if l.startswith("→") else f"<li>{e(l)}</li>" for l in s.get("lines", []))
        cat = "📝 まとめ" if s["cat"] == "ending" else s["cat"]
        src = s.get("src", "")
        body = (f"<div class='bar'></div><div class='wrap'><div class='cat'>{e(cat)}</div><h1>{e(s['head'])}</h1><ul>{lis}</ul></div>"
                f"<div class='foot'><span>{('出典：' + e(src)) if src else ''}</span><span>テック朝刊 {e(DATE)}　{i}/{len(SLIDES)-1}</span></div>")
    return f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"

# 1) スライド画像
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1920, "height": 1080})
    for i, s in enumerate(SLIDES):
        pg.set_content(slide_html(i, s)); pg.wait_for_timeout(120)
        pg.screenshot(path=f"{FR}/s{i:02d}.png")
    b.close()

# 2) 音声
ort = Onnxruntime.load_once(filename=f"{VV}/voicevox_onnxruntime-linux-x64-1.17.3/lib/libvoicevox_onnxruntime.so.1.17.3")
syn = Synthesizer(ort, OpenJtalk(os.path.join(os.path.dirname(pyopenjtalk.__file__), "open_jtalk_dic_utf_8-1.11")))
with VoiceModelFile.open(f"{VV}/vvms/0.vvm") as m: syn.load_voice_model(m)

files, starts, t = [], [], 0.0
for i, s in enumerate(SLIDES):
    wav = f"{FR}/a{i:02d}.wav"
    q = syn.create_audio_query(s["narration"], SPEAKER); q.speed_scale = SPEED
    open(wav, "wb").write(syn.synthesis(q, SPEAKER))
    with wave.open(wav) as w: dur = w.getnframes() / w.getframerate() + 1.0
    fn, tmp = f"{FR}/scene{i:02d}.mp4", f"{FR}/tmp{i:02d}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", f"{FR}/s{i:02d}.png", "-i", wav,
        "-vf", f"loop=-1:1,trim=duration={dur:.2f},fade=in:st=0:d=0.3,fade=out:st={dur-0.3:.2f}:d=0.3,format=yuv420p",
        "-af", f"adelay=400|400,apad,atrim=duration={dur:.2f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-t", f"{dur:.2f}", tmp], check=True)
    os.rename(tmp, fn); files.append(fn)
    real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fn],
                                capture_output=True, text=True).stdout)
    starts.append(t); t += real
    print(i, f"{real:.1f}s", flush=True)

with open(f"{FR}/list.txt", "w") as f: f.writelines(f"file '{x}'\n" for x in files)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{FR}/list.txt",
                "-c", "copy", "-movflags", "+faststart", f"{OUT}/video.mp4"], check=True)

# 3) タイトルと概要欄
def mmss(x): x = int(x); return f"{x//60:02d}:{x%60:02d}"
chap = []
for st, s in zip(starts, SLIDES):
    label = "オープニング" if s["cat"] == "opening" else s["head"]
    chap.append(f"{mmss(st)} {label}")
src = "\n".join(f"{x['label']}：{x['url']}" for x in spec.get("sources", []))
desc = (f"{spec.get('intro','').strip()}\n\n" + "\n".join(chap) + "\n\n■ 出典\n" + src +
        "\n\n※ 内容は各記事の要約です。最新情報・正確な対応手順は必ず各公式情報をご確認ください。\n"
        "音声：VOICEVOX:四国めたん\n\n" + spec.get("hashtags", "#テックニュース #エンジニア")).replace("<", "＜").replace(">", "＞")
title = spec["title"].replace("<", "＜").replace(">", "＞")[:100]
open(f"{OUT}/title.txt", "w", encoding="utf-8").write(title)
open(f"{OUT}/desc.txt", "w", encoding="utf-8").write(desc[:4900])
print(f"done {t:.1f}s  title={len(title)} desc={len(desc)}")
