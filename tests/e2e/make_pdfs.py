import json, re, sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
d = sys.argv[1]
pages = json.load(open(f"{d}/pages.json"))
CW = 0.6 * 7.5  # courier char width at 7.5pt
def render(name, texts, encrypt=None):
    c = canvas.Canvas(f"{d}/{name}.pdf", pagesize=letter, encrypt=encrypt)
    for t in texts:
        y = 760
        for line in t.split("\n"):
            for m in re.finditer(r"\S+(?: \S+)*", line):
                c.setFont("Courier", 7.5)
                c.drawString(30 + m.start() * CW, y, m.group(0))
            y -= 11
            if y < 30:
                c.showPage(); y = 760
        c.showPage()
    c.save()
render("om-retail", pages["om_retail"])
render("om-netlease", pages["om_netlease"])
render("om-multifamily", pages["om_multifamily"])
render("costar-comps", pages["costar_set"])
render("om-encrypted", pages["om_retail"], encrypt="secret")
# a long OM: 120 pages of filler around the real pages
filler = ["Market Overview\n\n" + "\n".join(f"  Paragraph {i} about the submarket and its tenants, traffic, and demographics." for i in range(40))] * 115
render("om-large", pages["om_retail"][:2] + filler + pages["om_retail"][2:])
# scanned: an image only, no text
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
img = Image.new("RGB", (1200, 1600), "white"); dr = ImageDraw.Draw(img); dr.text((100,100), "Asking Price $5,000,000  Cap Rate 6.5%", fill="black")
img.save(f"{d}/scan.png")
c = canvas.Canvas(f"{d}/om-scanned.pdf", pagesize=letter); c.drawImage(f"{d}/scan.png", 0, 0, 612, 792); c.showPage(); c.drawImage(f"{d}/scan.png", 0, 0, 612, 792); c.save()
# invented rent rolls as an OM's designer sets them (tests/rr-fixtures.js): Helvetica, figures
# right-aligned, a name on two lines; a page given as {"scan": ...} is a picture of its text, no text layer
from PIL import ImageFont
def scan_image(items, path, dpi=200):
    k = dpi / 72
    im = Image.new("L", (int(612 * k), int(792 * k)), 255); dr = ImageDraw.Draw(im)
    for it in items:
        size = it.get("size", 8) * k
        try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if it.get("bold") else ""), int(round(size)))
        except OSError: f = ImageFont.load_default(size=int(round(size)))
        x = it["x"] * k - (dr.textlength(it["s"], font=f) if it.get("right") else 0)
        dr.text((x, (792 - it["y"]) * k), it["s"], fill=0, font=f, anchor="ls")
    im.save(path)
# and invented operating statements (tests/om-statement-fixtures.js): headings centred over their columns
for name, spec in {**pages["rr_specs"], **pages.get("stmt_specs", {})}.items():
    c = canvas.Canvas(f"{d}/{name}.pdf", pagesize=letter)
    for i, pg in enumerate(spec):
        if isinstance(pg, dict):
            img = f"{d}/{name}-scan{i + 1}.png"; scan_image(pg["scan"], img)
            c.drawImage(img, 0, 0, 612, 792)
        else:
            for it in pg:
                c.setFont("Helvetica-Bold" if it.get("bold") else "Helvetica", it.get("size", 8))
                (c.drawCentredString if it.get("center") else c.drawRightString if it.get("right") else c.drawString)(it["x"], it["y"], it["s"])
        c.showPage()
    c.save()
open(f"{d}/corrupt.pdf", "wb").write(b"%PDF-1.7\n1 0 obj << /Type /Catalog >> garbage garbage\n")
open(f"{d}/empty.pdf", "wb").write(b"")
open(f"{d}/notes.txt", "w").write("hello")
# photos
for i, (w, h) in enumerate([(4032, 3024), (800, 600), (3024, 4032)]):
    Image.new("RGB", (w, h), (40 + i*60, 120, 160)).save(f"{d}/photo{i}.jpg", quality=90)
print("ok")
