#!/usr/bin/env python3
"""Generate PWA + Apple touch icons + favicons from BOOM logo source."""
from PIL import Image, ImageDraw
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "pass-assets" / "tenant" / "logo@2x.png"  # 320x100 BOOM gold logo
DEST = REPO_ROOT / "assets" / "icons"
DEST.mkdir(parents=True, exist_ok=True)


def make_icon(size, output_name, with_bg=True, maskable=False):
    """Generate icon with BOOM logo centered on dark background."""
    img = Image.new("RGBA", (size, size), (8, 8, 10, 255))
    if SRC.exists():
        logo = Image.open(SRC).convert("RGBA")
        # Maskable icons need ~80% safe area; regular icons ~75%
        target = int(size * (0.65 if maskable else 0.78))
        # The logo is wider than tall (~3.2:1). Fit by width.
        ratio = target / logo.width
        new_w = target
        new_h = max(1, int(logo.height * ratio))
        logo = logo.resize((new_w, new_h), Image.LANCZOS)
        offset = ((size - new_w) // 2, (size - new_h) // 2)
        img.paste(logo, offset, logo)
    else:
        # Fallback: gold "B" placeholder
        from PIL import ImageFont
        d = ImageDraw.Draw(img)
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size // 2)
        except Exception:
            f = ImageFont.load_default()
        d.text((size // 2, size // 2), "B", fill=(212, 175, 55, 255), font=f, anchor="mm")
    img.save(DEST / output_name, "PNG", optimize=True)
    print(f"  ✓ {output_name}: {size}×{size}  ({(DEST / output_name).stat().st_size}b)")


def main():
    if not SRC.exists():
        print(f"WARN: source logo not found at {SRC} — using fallback 'B' placeholder")
    print(f"Source: {SRC}")
    print(f"Output: {DEST}\n")

    # PWA standard icons
    for s in [192, 512]:
        make_icon(s, f"icon-{s}.png")
    make_icon(512, "icon-512-maskable.png", maskable=True)

    # Apple touch icons
    for s in [120, 152, 180]:
        make_icon(s, f"apple-touch-icon-{s}.png")

    # Favicons (small — logo would not fit, use fallback layer)
    for s in [16, 32]:
        make_icon(s, f"favicon-{s}.png", maskable=False)

    print(f"\nDone. {len(list(DEST.glob('*.png')))} files in {DEST}")


if __name__ == "__main__":
    main()
