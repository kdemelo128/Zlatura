"""The invented scanned lease for the lease reader's browser flow (tests/e2e/leaseread-flow.mjs): F1 (tests/lease-fixtures.js, written by
tests/tools/leasepdfs.mjs as lease-f1.json) drawn as page images, then put in a PDF with no text layer, one picture a page. Like a scanner:
a half to one and a half degrees of tilt, specks, one page blurred, one at 300 dpi in one bit, the rest 200 dpi in colour or grey, and a
signature page with little on it. Invented text only; the noise is seeded, so the files are the same every run.

    python3 make_lease_scans.py <dir>     # reads <dir>/lease-f1.json, writes <dir>/lease-f5-scan.pdf and the page PNGs
"""
import json
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

d = sys.argv[1] if len(sys.argv) > 1 else "."
pages = json.load(open(f"{d}/lease-f1.json"))["pages"]
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SIZE = 9.5  # points; 103 characters of the longest line fit a Letter page


def draw_page(items, dpi, mode, tilt, blur, specks, seed):
    rnd = random.Random(seed)
    k = dpi / 72
    im = Image.new("L", (int(612 * k), int(792 * k)), 255)
    dr = ImageDraw.Draw(im)
    f = ImageFont.truetype(MONO, int(round(SIZE * k)))
    for i, it in enumerate(items):
        if it["s"].strip():
            dr.text((40 * k, (750 - 11.8 * i) * k), it["s"], fill=20, font=f, anchor="ls")
    for _ in range(specks):  # a scanner's dust
        x, y, r = rnd.randrange(im.width), rnd.randrange(im.height), rnd.choice([1, 1, 2, 3])
        dr.ellipse([x - r, y - r, x + r, y + r], fill=rnd.choice([60, 110]))
    if tilt:
        im = im.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=255)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if mode == "1":
        im = im.point(lambda v: 255 if v > 150 else 0).convert("1")
    elif mode == "RGB":  # a faint paper tone, so it is a colour scan
        im = Image.merge("RGB", [im.point(lambda v, a=a: min(255, int(v * a))) for a in (1.0, 0.98, 0.93)])
    return im


# page 1: colour, 200 dpi, tilted; page 2: one bit, 300 dpi; page 3 (the rent table): grey, blurred; page 4 (signatures): little text
specs = [(200, "RGB", 0.8, 0, 220), (300, "1", -1.2, 0, 160), (200, "L", 0.5, 1.7, 120), (200, "RGB", -0.6, 0, 140)]
c = canvas.Canvas(f"{d}/lease-f5-scan.pdf", pagesize=letter)
for n, (items, (dpi, mode, tilt, blur, specks)) in enumerate(zip(pages, specs), 1):
    im = draw_page(items, dpi, mode, tilt, blur, specks, 40 + n)
    path = f"{d}/lease-f5-scan{n}.png"
    im.save(path)
    c.drawImage(path, 0, 0, 612, 792)
    c.showPage()
c.save()
print("ok")
