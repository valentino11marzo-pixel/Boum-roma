#!/usr/bin/env python3
"""
generate-pass-assets.py — BOOM PropPass asset pipeline (Phase 1)

Generates all Apple Wallet asset sizes for the 4 pass types (tenant, landlord,
viewing, referral), with the headline value: 4 distinct premium "satin / brushed
metal" strip images.

Usage:
    python3 scripts/generate-pass-assets.py

Outputs to assets/passes/{tenant,landlord,viewing,referral}/ and writes a
preview HTML at assets/passes/preview.html.

Notes on dependencies:
    Pillow + numpy only. SVG-to-PNG would require cairosvg/cairo (not available
    on the dev machine), so logo / icon / thumbnail are derived from the existing
    pre-rendered pass-assets/{tenant}/{logo,icon,thumbnail}.png. The new value-add
    in Phase 1 is the 4 distinct strip images, which are 100% procedural.
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
    import numpy as np
except ImportError as e:
    print(f"ERROR: missing Python dep ({e}). Install with:")
    print("  pip3 install Pillow numpy --break-system-packages")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_LOGOS = REPO_ROOT / "pass-assets" / "tenant"  # any of the 4 dirs has the same BOOM logo
DEST_ROOT = REPO_ROOT / "assets" / "passes"


# Strip image canonical dimensions (per brief).
# 1x = 375×123, 2x = 750×246, 3x = 1125×369
STRIP_SIZES = [(375, 123), (750, 246), (1125, 369)]
STRIP_SUFFIXES = ["", "@2x", "@3x"]


# ============================================================================
# CORE: satin / brushed-metal strip generator
# ============================================================================
def generate_satin_strip(width, height, color_top_left, color_bottom_right,
                          highlight_color, noise_intensity=0.04, with_circle=False,
                          seed=42, output_path=None):
    """
    Build a premium satin-finish strip image.

    Layers (bottom → top):
      1. Diagonal 135° linear gradient (color_top_left → color_bottom_right)
      2. Elliptical radial highlight on the left side (12% opacity)
      3. Per-pixel noise (±5 RGB, scaled by noise_intensity)
      4. Soft Gaussian blur (0.6 px) — turns granular noise into "brushed" feel
      5. Diagonal-line grain overlay at 3% opacity (brushed-metal striations)
      6. Optional gold circle stroke (Viewing pass only — evokes BOOM spiral)
    """
    rng = np.random.default_rng(seed)
    xx, yy = np.meshgrid(np.arange(width), np.arange(height))
    xxf = xx.astype(np.float32)
    yyf = yy.astype(np.float32)

    # 1. Diagonal 135° linear gradient
    progress = (xxf + yyf) / max(1.0, (width + height - 2))
    progress = np.clip(progress, 0.0, 1.0)
    tl = np.array(color_top_left, dtype=np.float32)
    br = np.array(color_bottom_right, dtype=np.float32)
    base = (1.0 - progress)[..., None] * tl + progress[..., None] * br

    # 2. Elliptical radial highlight, left side
    cx = width * 0.30
    cy = height * 0.50
    rx = width * 0.55
    ry = height * 0.95
    dist = np.sqrt(((xxf - cx) / rx) ** 2 + ((yyf - cy) / ry) ** 2)
    hl_strength = np.clip(1.0 - dist, 0.0, 1.0) ** 2
    hl_opacity = 0.12
    hl_color = np.array(highlight_color, dtype=np.float32)[None, None, :]
    h_alpha = (hl_strength * hl_opacity)[..., None]
    base = base * (1.0 - h_alpha) + hl_color * h_alpha

    # 3. Per-pixel noise
    noise = rng.integers(-5, 6, size=(height, width, 3)).astype(np.float32)
    base = base + noise * (noise_intensity * 5.0)

    # 4. Soft Gaussian blur on the composite (so the noise reads as "satin")
    base = np.clip(base, 0, 255).astype(np.uint8)
    img = Image.fromarray(base, "RGB").filter(ImageFilter.GaussianBlur(radius=0.6))

    # 5. Diagonal grain overlay (3% opacity, 1px lines, ~4px spacing)
    grain = Image.new("L", (width, height), 0)
    g = ImageDraw.Draw(grain)
    spacing = 4
    line_h = max(width, height) * 2
    for offset in range(-height, width + height, spacing):
        g.line([(offset, 0), (offset + line_h, line_h)], fill=255, width=1)
    grain_arr = (np.array(grain).astype(np.float32) / 255.0)[..., None]
    img_arr = np.array(img).astype(np.float32)
    grain_color = np.array([255, 255, 255], dtype=np.float32)[None, None, :]
    overlay_alpha = 0.03
    img_arr = img_arr * (1.0 - grain_arr * overlay_alpha) + grain_color * (grain_arr * overlay_alpha)

    # 6. Optional gold circle stroke (Viewing only)
    if with_circle:
        out = Image.fromarray(np.clip(img_arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        cx_c = int(width * 0.70)
        cy_c = int(height * 0.50)
        radius = int(height * 0.60)
        # Stroke at 15% opacity, gold (212,175,55)
        stroke_alpha = int(255 * 0.15)
        # Use a 2-px stroke for crispness on retina (the @2x/@3x assets get scaled-up width)
        stroke_w = max(1, int(round(width / 375 * 1.5)))
        d.ellipse(
            [cx_c - radius, cy_c - radius, cx_c + radius, cy_c + radius],
            outline=(212, 175, 55, stroke_alpha),
            width=stroke_w,
        )
        out.alpha_composite(overlay)
        out = out.convert("RGB")
    else:
        out = Image.fromarray(np.clip(img_arr, 0, 255).astype(np.uint8), "RGB")

    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        out.save(output_path, "PNG", optimize=True)
    return out


# ============================================================================
# Logo / icon / thumbnail derivation from existing source PNGs
# ============================================================================
def copy_resized(src_path, dest_path, target_size, mode="RGB"):
    """Open src, resize to target_size with Lanczos, save as PNG."""
    if not src_path.exists():
        print(f"  WARN: source missing: {src_path}")
        return False
    im = Image.open(src_path).convert(mode)
    im = im.resize(target_size, Image.LANCZOS)
    os.makedirs(dest_path.parent, exist_ok=True)
    im.save(dest_path, "PNG", optimize=True)
    return True


def invert_logo_for_landlord(src_path, dest_path):
    """Produce a black-on-transparent variant for use over the gold Landlord strip."""
    if not src_path.exists():
        print(f"  WARN: logo source missing: {src_path}")
        return False
    im = Image.open(src_path).convert("RGBA")
    pixels = np.array(im)
    # Convert gold spiral to dark — preserve alpha but invert luma
    rgb = pixels[..., :3].astype(np.float32)
    luma = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114)
    # Invert: bright pixels → dark, keep below-threshold pixels mostly transparent
    inv = 255 - luma
    # Map back to monochrome dark
    out = np.zeros_like(pixels)
    out[..., 0] = inv * 0.05  # near-black
    out[..., 1] = inv * 0.05
    out[..., 2] = inv * 0.06
    # Alpha based on original luma (gold pixels become opaque dark)
    out[..., 3] = np.clip(luma * 1.5, 0, 255)
    Image.fromarray(out.astype(np.uint8), "RGBA").save(dest_path, "PNG", optimize=True)
    return True


# ============================================================================
# Asset pipeline driver
# ============================================================================
def generate_passtype_dir(pass_type, strip_spec):
    """
    pass_type: 'tenant' | 'landlord' | 'viewing' | 'referral'
    strip_spec: dict with color_top_left, color_bottom_right, highlight_color,
                noise_intensity, with_circle
    """
    dest = DEST_ROOT / pass_type
    dest.mkdir(parents=True, exist_ok=True)

    # ------- ICON (29 / 58 / 87) -------
    src_icon = SRC_LOGOS / "icon@2x.png"  # use 2x as best-quality source
    for (size, suffix) in [(29, ""), (58, "@2x"), (87, "@3x")]:
        copy_resized(src_icon, dest / f"icon{suffix}.png", (size, size))

    # ------- LOGO (160×50 / 320×100 / 480×150) -------
    src_logo = SRC_LOGOS / "logo@2x.png"  # 320×100 best source we have
    for (w, h, suffix) in [(160, 50, ""), (320, 100, "@2x"), (480, 150, "@3x")]:
        copy_resized(src_logo, dest / f"logo{suffix}.png", (w, h))

    # Landlord strip is gold — needs black logo for contrast
    if pass_type == "landlord":
        for suffix in ["", "@2x", "@3x"]:
            invert_logo_for_landlord(dest / f"logo{suffix}.png", dest / f"logo{suffix}.png")

    # ------- THUMBNAIL (90 / 180 / 270) — Wallet uses for eventTicket only -------
    src_thumb = SRC_LOGOS / "thumbnail@2x.png"  # 180×180 source
    for (size, suffix) in [(90, ""), (180, "@2x"), (270, "@3x")]:
        copy_resized(src_thumb, dest / f"thumbnail{suffix}.png", (size, size))

    # ------- STRIP (375×123 / 750×246 / 1125×369) — the headline asset -------
    for (w, h), suffix in zip(STRIP_SIZES, STRIP_SUFFIXES):
        # Re-seed scaled up so the noise pattern is consistent across resolutions
        seed = 42 + hash(pass_type) % 1000
        out_path = dest / f"strip{suffix}.png"
        generate_satin_strip(
            width=w, height=h,
            color_top_left=strip_spec["color_top_left"],
            color_bottom_right=strip_spec["color_bottom_right"],
            highlight_color=strip_spec["highlight_color"],
            noise_intensity=strip_spec["noise_intensity"],
            with_circle=strip_spec.get("with_circle", False),
            seed=seed,
            output_path=str(out_path),
        )

    return dest


PASS_SPECS = {
    "tenant": {
        "color_top_left":     (8, 8, 10),       # #08080A
        "color_bottom_right": (26, 26, 28),     # #1A1A1C
        "highlight_color":    (212, 175, 55),   # #D4AF37 gold
        "noise_intensity":    0.03,
        "with_circle":        False,
        "description":        "Black BOOM card — subtle gold sheen left side, brushed-metal feel.",
    },
    "landlord": {
        "color_top_left":     (197, 165, 114),  # #C5A572 warm gold
        "color_bottom_right": (155, 126, 72),   # #9B7E48 bronze
        "highlight_color":    (229, 200, 126),  # #E5C87E softer gold highlight
        "noise_intensity":    0.05,
        "with_circle":        False,
        "description":        "Gold Amex aesthetic — warm gold to bronze diagonal, brighter highlight, more visible noise (premium tactile).",
    },
    "viewing": {
        "color_top_left":     (8, 8, 10),       # #08080A
        "color_bottom_right": (42, 42, 45),     # #2A2A2D
        "highlight_color":    (212, 175, 55),   # gold
        "noise_intensity":    0.03,
        "with_circle":        True,
        "description":        "Black with stronger gold highlight + ghosted gold circle right-side (echoes BOOM spiral, evokes event/moment).",
    },
    "referral": {
        "color_top_left":     (8, 8, 10),       # #08080A
        "color_bottom_right": (27, 61, 47),     # #1B3D2F deep green (subtle money cue)
        "highlight_color":    (212, 175, 55),   # gold
        "noise_intensity":    0.04,
        "with_circle":        False,
        "description":        "Black-to-deep-green diagonal — subtle 'money' cue without being on the nose, gold sheen left side.",
    },
}


# ============================================================================
# Preview HTML
# ============================================================================
PREVIEW_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BOOM PropPass — Strip Preview</title>
<style>
    body {
        background: #0a0a0a;
        color: #e8e8e8;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
        font-weight: 300;
        padding: 32px;
        margin: 0;
    }
    h1 {
        color: #D4AF37;
        font-weight: 300;
        letter-spacing: 4px;
        text-transform: uppercase;
        font-size: 18px;
        margin-bottom: 8px;
    }
    .lede {
        color: #888;
        font-size: 13px;
        margin-bottom: 36px;
        max-width: 640px;
        line-height: 1.6;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 28px;
        max-width: 800px;
    }
    .pass {
        background: #141414;
        border: 1px solid #222;
        border-radius: 14px;
        padding: 18px;
    }
    .pass h3 {
        margin: 0 0 10px;
        font-weight: 400;
        font-size: 14px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #D4AF37;
    }
    .pass .desc {
        font-size: 12px;
        color: #999;
        margin-bottom: 14px;
        line-height: 1.5;
    }
    .strips {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .strip-row {
        display: flex;
        align-items: center;
        gap: 14px;
    }
    .strip-row .label {
        font-size: 10px;
        color: #555;
        letter-spacing: 1px;
        text-transform: uppercase;
        width: 38px;
        flex-shrink: 0;
    }
    .strip-row img {
        display: block;
        border-radius: 4px;
        max-width: 100%;
        height: auto;
    }
    .strip-row.x1 img { width: 375px; }
    .strip-row.x2 img { width: 375px; opacity: 0.6; }
    .strip-row.x3 img { width: 375px; opacity: 0.4; }
    .footnote {
        margin-top: 40px;
        font-size: 11px;
        color: #444;
        line-height: 1.6;
        padding-top: 20px;
        border-top: 1px solid #1f1f1f;
    }
</style>
</head>
<body>
<h1>BOOM PropPass — Strip Preview</h1>
<p class="lede">
    Phase 1 deliverable: 4 procedural satin / brushed-metal strip images, one per pass type.
    Strip is the dominant visual real estate on Wallet cards. Each variant is rendered at 1×, 2× and 3×
    so you can spot artifacts on retina before Phase 2 wires them into <code>api/generate-pass.js</code>.
</p>
<div class="grid">
    <div class="pass">
        <h3>Tenant</h3>
        <div class="desc">Black BOOM card — subtle gold sheen left, brushed-metal feel. Speaks "this is your home, premium."</div>
        <div class="strips">
            <div class="strip-row x1"><div class="label">1×</div><img src="tenant/strip.png" alt="Tenant 1x"></div>
            <div class="strip-row x2"><div class="label">2×</div><img src="tenant/strip@2x.png" alt="Tenant 2x"></div>
            <div class="strip-row x3"><div class="label">3×</div><img src="tenant/strip@3x.png" alt="Tenant 3x"></div>
        </div>
    </div>
    <div class="pass">
        <h3>Landlord — Gold Amex</h3>
        <div class="desc">Warm gold to bronze diagonal, brighter highlight, more visible noise. The status card.</div>
        <div class="strips">
            <div class="strip-row x1"><div class="label">1×</div><img src="landlord/strip.png" alt="Landlord 1x"></div>
            <div class="strip-row x2"><div class="label">2×</div><img src="landlord/strip@2x.png" alt="Landlord 2x"></div>
            <div class="strip-row x3"><div class="label">3×</div><img src="landlord/strip@3x.png" alt="Landlord 3x"></div>
        </div>
    </div>
    <div class="pass">
        <h3>Viewing — Event Ticket</h3>
        <div class="desc">Black with stronger gold highlight + ghosted gold circle on the right (echoes BOOM spiral). Evokes a moment.</div>
        <div class="strips">
            <div class="strip-row x1"><div class="label">1×</div><img src="viewing/strip.png" alt="Viewing 1x"></div>
            <div class="strip-row x2"><div class="label">2×</div><img src="viewing/strip@2x.png" alt="Viewing 2x"></div>
            <div class="strip-row x3"><div class="label">3×</div><img src="viewing/strip@3x.png" alt="Viewing 3x"></div>
        </div>
    </div>
    <div class="pass">
        <h3>Referral</h3>
        <div class="desc">Black-to-deep-green diagonal — subtle "money" cue without being on the nose. Gold sheen.</div>
        <div class="strips">
            <div class="strip-row x1"><div class="label">1×</div><img src="referral/strip.png" alt="Referral 1x"></div>
            <div class="strip-row x2"><div class="label">2×</div><img src="referral/strip@2x.png" alt="Referral 2x"></div>
            <div class="strip-row x3"><div class="label">3×</div><img src="referral/strip@3x.png" alt="Referral 3x"></div>
        </div>
    </div>
</div>
<p class="footnote">
    Generated by <code>scripts/generate-pass-assets.py</code>. Re-run any time to regenerate with seed=42 (deterministic). Strip dim: 375×123 (1×) — non-standard for Apple Wallet which uses 375×144 (storeCard) or 375×98 (eventTicket). Verify on a real device before Phase 2 deploy.
</p>
</body>
</html>
"""


def main():
    print(f"BOOM PropPass asset pipeline (Phase 1)")
    print(f"  source logos: {SRC_LOGOS}")
    print(f"  output dir:   {DEST_ROOT}")
    print()

    if not SRC_LOGOS.exists():
        print(f"FATAL: source dir missing: {SRC_LOGOS}")
        sys.exit(1)

    DEST_ROOT.mkdir(parents=True, exist_ok=True)

    for pass_type, spec in PASS_SPECS.items():
        print(f"  → {pass_type}: {spec['description']}")
        out_dir = generate_passtype_dir(pass_type, spec)

    # Preview HTML
    preview_path = DEST_ROOT / "preview.html"
    preview_path.write_text(PREVIEW_HTML, encoding="utf-8")
    print(f"\n  Preview: {preview_path}")

    # Inventory
    print("\n=== Generated files ===")
    total = 0
    for pass_type in PASS_SPECS.keys():
        d = DEST_ROOT / pass_type
        for f in sorted(d.glob("*.png")):
            size = f.stat().st_size
            total += size
            try:
                im = Image.open(f)
                dim = f"{im.size[0]}×{im.size[1]}"
            except Exception:
                dim = "?"
            print(f"  {f.relative_to(REPO_ROOT)}  {dim}  {size:>7} b")
    print(f"\n  Total: {total/1024:.1f} KB")


if __name__ == "__main__":
    main()
