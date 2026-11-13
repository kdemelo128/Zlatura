"""Invented scans of a tax bill, a utility bill and a unit mix (no text layer), drawn from facts-pages.json (written by
tests/tools/factsfiles.mjs), as a scanner would give them: a little blur and JPEG noise.   python3 make_facts_scans.py files"""
import io, json, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

d = sys.argv[1]
pages = json.load(open(f"{d}/facts-pages.json"))
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"

def draw(items, dpi=250):
    k = dpi / 72
    im = Image.new("L", (int(612 * k), int(792 * k)), 255); dr = ImageDraw.Draw(im)
    for it in items:
        f = ImageFont.truetype(FONT % ("-Bold" if it.get("bold") else ""), int(round(it.get("size", 8) * k)))
        w = dr.textlength(it["s"], font=f)
        x = it["x"] * k - (w if it.get("right") else w / 2 if it.get("center") else 0)
        dr.text((x, (792 - it["y"]) * k), it["s"], fill=0, font=f, anchor="ls")
    return im

for name, pgs in pages.items():
    rnd = random.Random(name)
    c = canvas.Canvas(f"{d}/{name}.pdf", pagesize=(612, 792))
    for items in pgs:
        im = draw(items).filter(ImageFilter.GaussianBlur(0.4))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=85); buf.seek(0)
        c.drawImage(ImageReader(buf), 0, 0, 612, 792); c.showPage()
    c.save()
print("ok")
