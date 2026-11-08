"""Optional export QA: render through LibreOffice and inspect its imported animation tree.

Run the browser fixture first:
PPTX_QA_DIR=/absolute/output npx playwright test tests/browser/pptx-export.spec.ts
Then: python scripts/verify-pptx.py /absolute/output
Requires LibreOffice, pdftoppm, Pillow and lxml; not needed by the application.
"""
import json
from pathlib import Path
import subprocess
import sys
from collections import Counter
from zipfile import ZipFile
from PIL import Image, ImageChops, ImageEnhance, ImageDraw
from lxml import etree

root = Path(sys.argv[1]).resolve()
report = {}
for mode in ["faithful", "editable"] + (["baseline"] if (root / "baseline.pptx").exists() else []):
    target = root / mode
    target.mkdir(exist_ok=True)
    source = root / (mode + ".pptx")
    for extension in ["pdf", "odp"]:
        subprocess.run(["soffice", "--headless", "--convert-to", extension, "--outdir", str(target), str(source)], check=True, capture_output=True, timeout=60)
    subprocess.run(["pdftoppm", "-png", "-scale-to-x", "1280", "-scale-to-y", "720", str(target / (mode + ".pdf")), str(target / "slide")], check=True, capture_output=True, timeout=60)
    pages = []
    for index, rendered in enumerate(sorted(target.glob("slide-*.png")), 1):
        reference = Image.open(root / f"reference-{index}.png").convert("RGB")
        actual = Image.open(rendered).convert("RGB")
        diff = ImageChops.difference(reference, actual)
        histogram = diff.histogram()
        mean_error = sum((i % 256) * count for i, count in enumerate(histogram)) / (reference.width * reference.height * 3)
        pages.append({"slide": index, "mean_channel_error": round(mean_error, 4)})
        comparison = Image.new("RGB", (1280 * 3, 750), "white")
        comparison.paste(reference, (0, 30)); comparison.paste(actual, (1280, 30)); comparison.paste(ImageEnhance.Contrast(diff).enhance(4), (2560, 30))
        draw = ImageDraw.Draw(comparison)
        draw.text((10, 8), "Browser", fill="black"); draw.text((1290, 8), f"PPTX / LibreOffice ({mode})", fill="black"); draw.text((2570, 8), "Difference x4", fill="black")
        comparison.save(target / f"comparison-{index}.png")
    with ZipFile(target / (mode + ".odp")) as z:
        dom = etree.fromstring(z.read("content.xml"))
    ns = {"a": "urn:oasis:names:tc:opendocument:xmlns:animation:1.0", "p": "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0", "s": "urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0"}
    node_types = Counter(dom.xpath("//@p:node-type", namespaces=ns))
    attributes = Counter(dom.xpath("//a:animate/@s:attributeName", namespaces=ns))
    report[mode] = {"pages": pages, "imported_animation_types": dict(node_types), "imported_animated_attributes": dict(attributes)}
    if mode != "baseline" and node_types["on-click"] != 3:
        raise SystemExit(f"{mode}: expected exactly three nonzero click stages across the fixture")
    if mode != "baseline" and not all(attributes[a] for a in ["x", "y", "width", "height"]):
        raise SystemExit(f"{mode}: native movement/scaling animation did not survive import")
(root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
