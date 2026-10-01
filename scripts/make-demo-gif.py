"""Build the 64-second demo GIF from real Phase 2 run screenshots.

Usage: python scripts/make-demo-gif.py
Output: docs/assets/real-model-demo.gif
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'docs' / 'assets'

FRAMES = [
    ('real-run-baseline.webp', 8000,
     '① 在真实 DSH Web 打开「API 接口验收台」，登记 3 个端点',
     'Open the workbench in the real DSH Web GUI and register 3 endpoints'),
    ('real-run-baseline.webp', 14000,
     '② 一键快照基线：3/3 接口均 200，同时存档后端源码快照',
     'Snapshot the baseline: 3/3 endpoints returned 200, backend sources archived'),
    ('real-run-model-edit.webp', 14000,
     '③ 请求发到当前会话，真实 DeepSeek V4-Flash 修改后端代码（未 mock）',
     'The request reaches the live session; real DeepSeek V4-Flash edits the backend'),
    ('real-run-diff.webp', 16000,
     '④ 重跑对比：结构化字段级差异 $.price 299 → 29900（差值 29601）',
     'Rerun & compare: structured field-level diff with old and new values'),
    ('real-run-accepted.webp', 12000,
     '⑤ 逐项接受 → 完成本轮验收 → 导出 HTML / Markdown 报告',
     'Accept every item, finish the round, export the HTML / Markdown report'),
]

WIDTH = 1024
CAPTION_H = 78
BG = (16, 15, 22)
FG = (238, 234, 245)
ACCENT = (167, 155, 208)


def load_font(size: int, bold: bool = False):
    candidates = [
        r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        r'C:\Windows\Fonts\arial.ttf',
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


zh_font = load_font(22, bold=True)
en_font = load_font(16)

frames = []
for name, duration, zh, en in FRAMES:
    shot = Image.open(ASSETS / name).convert('RGB')
    ratio = WIDTH / shot.width
    shot = shot.resize((WIDTH, int(shot.height * ratio)), Image.LANCZOS)
    canvas = Image.new('RGB', (WIDTH, shot.height + CAPTION_H), BG)
    canvas.paste(shot, (0, 0))
    draw = ImageDraw.Draw(canvas)
    y = shot.height + 12
    draw.text((20, y), zh, font=zh_font, fill=FG)
    draw.text((20, y + 40), en, font=en_font, fill=ACCENT)
    frames.append(canvas)

out = ASSETS / 'real-model-demo.gif'
frames[0].save(
    out, save_all=True, append_images=frames[1:],
    duration=[f[1] for f in FRAMES], loop=0, optimize=True, disposal=2,
)
total = sum(f[1] for f in FRAMES) / 1000
print(f'wrote {out} ({out.stat().st_size // 1024} KB, {len(frames)} frames, {total:.0f}s)')
