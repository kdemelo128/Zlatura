"""Invented documents for Ask Monal's document search (tests/doc-fixtures.js): an OM of 24 pages, a lease and a T-12 as
text PDFs, and one scanned page (an image of text, no text layer) for the on-device OCR.
  python3 make_docqa.py files     (after dump-docqa.mjs has written files/docqa.json) """
import json, re, sys, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from PIL import Image, ImageDraw, ImageFont, ImageFilter
d = sys.argv[1]
src = json.load(open(f"{d}/docqa.json"))
CW = 0.6 * 9

def render(name, pages):
    c = canvas.Canvas(f"{d}/{name}.pdf", pagesize=letter)
    for t in pages:
        y = 740
        # long prose lines are wrapped to the page, as a designer's text box would; table lines (with column gaps) are left
        lines = [w for line in t.split("\n") for w in ([line] if "  " in line or len(line) <= 80 else textwrap.wrap(line, 80))]
        for line in lines:
            if line.strip():
                c.setFont("Courier", 9)
                # a run of two or more spaces is a column gap: drawn at its own x, as a table's cells are
                for m in re.finditer(r"\S+(?: \S+)*", line):
                    c.drawString(40 + m.start() * CW, y, m.group(0))
            y -= 13
            if y < 40:
                c.showPage(); y = 740
        c.showPage()
    c.save()

render("docqa-om", src["om"])
render("docqa-lease", src["lease"])
render("docqa-t12", src["t12"])

# a scanned page: the text as an image, slightly soft, no text layer
dpi = 200; k = dpi / 72
im = Image.new("L", (int(612 * k), int(792 * k)), 255); dr = ImageDraw.Draw(im)
f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", int(round(14 * k)))
y = 80 * k
for line in src["scan"][0].split("\n"):
    dr.text((60 * k, y), line, fill=0, font=f, anchor="ls"); y += 24 * k
im = im.filter(ImageFilter.GaussianBlur(0.5))
im.save(f"{d}/docqa-scan.png")
c = canvas.Canvas(f"{d}/docqa-scan.pdf", pagesize=letter); c.drawImage(f"{d}/docqa-scan.png", 0, 0, 612, 792); c.showPage(); c.save()
