"""Invented scanned PDFs (no text layer) for the on-device OCR path: the invented rent roll and statement pages of
pages.json drawn as images, then made to look like a scan: blur, a 1-3 degree skew, JPEG noise, at 150 and 300 dpi.
  python3 make_scans.py files     (after make_pdfs.py has written files/pages.json; deterministic: a fixed random seed) """
import io, json, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

d = sys.argv[1]
pages = json.load(open(f"{d}/pages.json"))
specs = {**pages["rr_specs"], **pages.get("stmt_specs", {})}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"

def draw(items, dpi):
    k = dpi / 72
    im = Image.new("L", (int(612 * k), int(792 * k)), 255); dr = ImageDraw.Draw(im)
    for it in items:
        f = ImageFont.truetype(FONT % ("-Bold" if it.get("bold") else ""), int(round(it.get("size", 8) * k)))
        w = dr.textlength(it["s"], font=f)
        x = it["x"] * k - (w if it.get("right") else w / 2 if it.get("center") else 0)
        dr.text((x, (792 - it["y"]) * k), it["s"], fill=0, font=f, anchor="ls")
    return im

def degrade(im, blur, skew, noise, quality, rnd):
    if skew:
        im = im.rotate(skew, resample=Image.BICUBIC, expand=False, fillcolor=255)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        px = im.load(); w, h = im.size
        for _ in range(int(w * h * noise)):
            px[rnd.randrange(w), rnd.randrange(h)] = rnd.choice((0, 255))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality); buf.seek(0)
    return buf

# name, source, dpi, blur, skew degrees, speckle noise, jpeg quality
VARIANTS = [
    ("scan-rr-300", "rr-dd", 300, 0, 0, 0, 90),
    ("scan-rr-150-skew", "rr-dd", 150, 0.6, 2, 0.0005, 70),
    ("scan-rr-pm-300-skew", "rr-pm", 300, 0.8, 1, 0.0005, 75),
    ("scan-rr-3page", "rr-continued", 150, 0.4, 1, 0, 80),
    ("scan-stmt-300", "stmt-doc", 300, 0, 0, 0, 90),
    ("scan-stmt-150-skew", "stmt-doc", 150, 0.6, 3, 0.0005, 70),
]
for name, src, dpi, blur, skew, noise, q in VARIANTS:
    rnd = random.Random(name)
    c = canvas.Canvas(f"{d}/{name}.pdf", pagesize=(612, 792))
    for pg in specs[src]:
        c.drawImage(ImageReader(degrade(draw(pg, dpi), blur, skew, noise, q, rnd)), 0, 0, 612, 792)
        c.showPage()
    c.save()
print("ok")
