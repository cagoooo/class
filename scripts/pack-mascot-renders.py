"""把安靜挑戰小幫手的 Blender 渲染（每格一張 PNG）打包成「一個心情一條」的 WebP 動作條。

所有格子用同一個裁切框（全部格子的聯集＋留白），確保換心情時角色位置與大小不跳動。
需要 Pillow。輸出 assets/quiet-mascot/<animal>-<mood>.webp，並印出單格尺寸供前端使用。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art/quiet-mascot/renders'
OUT = ROOT / 'assets/quiet-mascot'
ANIMALS = ['owl', 'cat', 'bear', 'bunny', 'panda']
MOODS = {'off': 4, 'calm': 3, 'sleep': 3, 'doze': 3, 'warn': 3, 'loud': 2, 'storm': 3, 'party': 3}
MARGIN = 8
FRAME_W = 360          # 輸出單格寬度（投影全螢幕約 360px，再大只是浪費流量）

frames = {(a, m, i): Image.open(SRC / f'{a}-{m}-{i}.png').convert('RGBA') for a in ANIMALS for m in MOODS for i in range(MOODS[m])}
box = None
for im in frames.values():
    b = im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    if b:
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
w0, h0 = next(iter(frames.values())).size
box = (max(0, box[0] - MARGIN), max(0, box[1] - MARGIN), min(w0, box[2] + MARGIN), min(h0, box[3] + MARGIN))
cw, ch = box[2] - box[0], box[3] - box[1]
fw = min(FRAME_W, cw); fh = round(ch * fw / cw)
OUT.mkdir(parents=True, exist_ok=True)
total = 0
for a in ANIMALS:
    for m, n in MOODS.items():
        strip = Image.new('RGBA', (fw * n, fh), (0, 0, 0, 0))
        for i in range(n):
            cell = frames[(a, m, i)].crop(box).resize((fw, fh), Image.LANCZOS)
            strip.alpha_composite(cell, (fw * i, 0))
        dest = OUT / f'{a}-{m}.webp'
        strip.save(dest, 'WEBP', quality=84, method=6, alpha_quality=90)
        total += dest.stat().st_size
print(f'crop={box} frame={fw}x{fh} files={len(ANIMALS) * len(MOODS)} total={total / 1024:.0f}KB')
