#!/usr/bin/env python3
"""Generate PWA + Apple touch icons + favicons from BOOM logo source."""
from PIL import Image
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
# Sorgente: l'icona quadrata della radice (il marchio pieno, 512x512), la stessa del
# sito pubblico. Fino al 10/11/2026 la sorgente era pass-assets/tenant/logo@2x.png,
# una striscia 320x100 RGB su nero pieno: incollata su #08080A lasciava un rettangolo
# nero visibile con il marchio minuscolo al centro, su tutte le icone di assets/icons
# (schermata Home del portal, apple-touch e favicon delle pagine servizio).
SRC = REPO_ROOT / "android-chrome-512x512.png"
# Sotto i 48px gli anelli non reggono un ridimensionamento: si usano i favicon della radice.
SMALL = {16: REPO_ROOT / "favicon-16x16.png", 32: REPO_ROOT / "favicon-32x32.png"}
DEST = REPO_ROOT / "assets" / "icons"
DEST.mkdir(parents=True, exist_ok=True)


def make_icon(size, output_name, with_bg=True, maskable=False):
    """Generate a square icon from the root BOOM mark.

    The mark sits inside the central ~61% of the source, so the same image is
    already inside the maskable safe zone (central 80%): no extra padding.
    """
    if size in SMALL and SMALL[size].exists():
        img = Image.open(SMALL[size]).convert("RGB")
    else:
        img = Image.open(SRC).convert("RGB").resize((size, size), Image.LANCZOS)
    img.save(DEST / output_name, "PNG", optimize=True)
    print(f"  ✓ {output_name}: {size}×{size}  ({(DEST / output_name).stat().st_size}b)")


def main():
    if not SRC.exists():
        sys.exit(f"ERROR: source icon not found at {SRC}")
    print(f"Source: {SRC}")
    print(f"Output: {DEST}\n")

    # PWA standard icons
    for s in [192, 512]:
        make_icon(s, f"icon-{s}.png")
    make_icon(512, "icon-512-maskable.png", maskable=True)

    # Apple touch icons
    for s in [120, 152, 180]:
        make_icon(s, f"apple-touch-icon-{s}.png")

    # Favicons (small — copied from the root favicons)
    for s in [16, 32]:
        make_icon(s, f"favicon-{s}.png", maskable=False)

    print(f"\nDone. {len(list(DEST.glob('*.png')))} files in {DEST}")


if __name__ == "__main__":
    main()
