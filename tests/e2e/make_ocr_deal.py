"""Invented fixtures for OCR on the deal page (ocrdeal-flow): an OM whose rent roll page is a scanned picture while the other
pages have text, and a one-page scan of a lone tax bill-like page is made by make_readers.py. Needs files/pages.json.
  python3 make_ocr_deal.py files"""
import io, json, re, sys
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader

d = sys.argv[1]
pages = json.load(open(f"{d}/pages.json"))["om_retail"]
CW = 0.6 * 7.5

def text_page(c, t):
    y = 760
    for line in t.split("\n"):
        for m in re.finditer(r"\S+(?: \S+)*", line):
            c.setFont("Courier", 7.5)
            c.drawString(30 + m.start() * CW, y, m.group(0))
        y -= 11

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf"
specs = json.load(open(f"{d}/pages.json"))["rr_specs"]

def scan_page(items, dpi=250):
    """A picture of positioned text (the invented rent roll page of tests/rr-fixtures.js), as a scanner would give it."""
    k = dpi / 72
    im = Image.new("L", (int(612 * k), int(792 * k)), 255); dr = ImageDraw.Draw(im)
    for it in items:
        f = ImageFont.truetype(FONT % ("-Bold" if it.get("bold") else ""), int(round(it.get("size", 8) * k)))
        w = dr.textlength(it["s"], font=f)
        x = it["x"] * k - (w if it.get("right") else w / 2 if it.get("center") else 0)
        dr.text((x, (792 - it["y"]) * k), it["s"], fill=0, font=f, anchor="ls")
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90); buf.seek(0)
    return buf

# the retail OM with its rent roll page (index 4) replaced by a picture of the same page
c = canvas.Canvas(f"{d}/om-mixed-scan.pdf", pagesize=letter)
for i, t in enumerate(pages):
    if i == 4:
        c.drawImage(ImageReader(scan_page(specs["rr-dd"][0])), 0, 0, 612, 792)
    else:
        text_page(c, t)
    c.showPage()
c.save()
print("ok")
