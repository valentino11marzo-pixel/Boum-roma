#!/usr/bin/env python3
"""
generate-pass-assets.py — BOOM PropPass V2 asset pipeline (Phase 1.5)

5 distinct passes mapped to 4 Apple Wallet types:
- Tenant Black     storeCard    (default)
- Tenant Silver    storeCard    (only when tenant.isPremium === true)
- Landlord         storeCard    (gold amex)
- Viewing          eventTicket  (relevantDate + locations geo-fence)
- Referral         coupon       (warm gold + voided lifecycle)

Strip dimensions per Apple spec:
- storeCard / coupon: 375×144 (1×), 750×288 (2×), 1125×432 (3×)
- eventTicket:        375×98  (1×), 750×196 (2×), 1125×294 (3×)

Algorithm: V3 aggressive brushed metal — multi-octave noise, explicit
horizontal brush lines, asymmetric specular highlight, secondary shadow,
edge vignette. scipy.ndimage for fast directional filtering.
"""

import os
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    from scipy import ndimage
except ImportError as e:
    print(f"ERROR: missing Python dep ({e}). Install with:")
    print("  pip3 install Pillow numpy scipy --break-system-packages")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_LOGOS = REPO_ROOT / "pass-assets" / "tenant"
DEST_ROOT = REPO_ROOT / "assets" / "passes"


# ============================================================================
# CORE V3 — Aggressive brushed metal generator
# ============================================================================
def generate_aggressive_brushed_metal(
    width, height,
    color_top_left, color_bottom_right,
    highlight_color,
    brush_strength=0.18,
    specular_strength=0.28,
    line_density=4,
    seed=42,
):
    """
    V3 aggressive brushed metal. Layers:
    1. Linear gradient base (top-left → bottom-right)
    2. Explicit horizontal brush lines (visible directional pattern)
    3. Multi-octave horizontal noise (gaussian filtered for "satin" feel)
    4. Strong specular highlight (asymmetric upper-left)
    5. Secondary darker reflection (lower-right shadow)
    6. Edge vignette for depth
    """
    np.random.seed(seed)

    # 1. Linear gradient base — vectorized
    yy, xx = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")
    progress = (xx / max(1, width - 1) + yy / max(1, height - 1)) / 2.0
    progress = progress[..., None]
    tl = np.array(color_top_left, dtype=np.float32)
    br = np.array(color_bottom_right, dtype=np.float32)
    base = tl * (1.0 - progress) + br * progress  # (H, W, 3)

    # 2. Explicit horizontal brush lines — coarse row-level brightness variation
    n_lines = max(2, height // line_density)
    line_offsets = np.random.normal(0, 1, n_lines)
    line_positions = np.linspace(0, n_lines - 1, height)
    row_brightness = np.interp(line_positions, np.arange(n_lines), line_offsets)
    fine_rows = np.random.normal(0, 0.4, height)
    row_brightness = row_brightness + fine_rows
    row_brightness = ndimage.uniform_filter1d(row_brightness, size=2)
    line_layer = np.tile(row_brightness[:, np.newaxis], (1, width))

    # 3. Multi-octave horizontal noise — gaussian smoothed
    horizontal_noise = np.random.normal(0, 0.3, (height, width))
    horizontal_noise = ndimage.gaussian_filter1d(horizontal_noise, sigma=2.0, axis=1)
    horizontal_noise = ndimage.gaussian_filter1d(horizontal_noise, sigma=0.4, axis=0)

    combined_noise = line_layer + horizontal_noise * 0.5
    luminance_factor = 1.0 + combined_noise * brush_strength
    luminance_factor = np.clip(luminance_factor, 0.55, 1.55)
    base = base * luminance_factor[..., None]

    # 4. Specular highlight — asymmetric upper-left, elliptical falloff
    cx, cy = width * 0.20, height * 0.30
    sigma_x, sigma_y = width * 0.45, height * 0.80
    spec = np.exp(-((xx - cx) ** 2 / (2 * sigma_x ** 2) + (yy - cy) ** 2 / (2 * sigma_y ** 2)))
    spec = spec * specular_strength
    hl_color = np.array(highlight_color, dtype=np.float32)
    base = base + (hl_color - base) * spec[..., None]

    # 5. Secondary shadow — lower-right
    cx2, cy2 = width * 0.85, height * 0.75
    sigma_x2, sigma_y2 = width * 0.40, height * 0.60
    spec2 = np.exp(-((xx - cx2) ** 2 / (2 * sigma_x2 ** 2) + (yy - cy2) ** 2 / (2 * sigma_y2 ** 2)))
    spec2 = spec2 * 0.12
    base = base * (1.0 - spec2[..., None])

    # 6. Edge vignette
    cx_c, cy_c = width / 2.0, height / 2.0
    max_dist = np.sqrt(cx_c ** 2 + cy_c ** 2)
    dist = np.sqrt((xx - cx_c) ** 2 + (yy - cy_c) ** 2)
    vignette = 1.0 - (dist / max_dist) * 0.18
    base = base * vignette[..., None]

    base = np.clip(base, 0, 255).astype(np.uint8)
    return Image.fromarray(base, "RGB")


# ============================================================================
# Signature overlays per pass
# ============================================================================
def overlay_concentric_rings(img, radii, stroke_w_base, color_rgb, alpha):
    """5 concentric rings, right side. Used for Tenant + Silver signature."""
    w, h = img.size
    cx_factor = 1.05  # slightly off-screen right for asymmetric framing
    cx = int(w * cx_factor)
    cy = int(h * 0.50)
    rgba_img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    scale = w / 375.0  # base radii are in 1× units; scale to current strip width
    stroke_w = max(1, int(round(stroke_w_base * scale)))
    rgba = (*color_rgb, alpha)
    for r in radii:
        rs = int(r * scale)
        d.ellipse([cx - rs, cy - rs, cx + rs, cy + rs], outline=rgba, width=stroke_w)
    rgba_img.alpha_composite(overlay)
    return rgba_img.convert("RGB")


def overlay_emerging_sun(img, color_rgb, opacity_outer=0.65, opacity_inner=0.42):
    """Single 'sun emerging' for Viewing pass — 1 large outer + 1 inner, right side."""
    w, h = img.size
    cx = int(w * 0.78)
    cy = int(h * 0.50)
    radius_outer = int(h * 0.42)
    radius_inner = radius_outer // 2
    scale = w / 375.0
    stroke_w = max(2, int(round(2.5 * scale)))

    rgba_img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse(
        [cx - radius_outer, cy - radius_outer, cx + radius_outer, cy + radius_outer],
        outline=(*color_rgb, int(255 * opacity_outer)),
        width=stroke_w,
    )
    d.ellipse(
        [cx - radius_inner, cy - radius_inner, cx + radius_inner, cy + radius_inner],
        outline=(*color_rgb, int(255 * opacity_inner)),
        width=stroke_w,
    )
    rgba_img.alpha_composite(overlay)
    return rgba_img.convert("RGB")


def overlay_wax_seal(img, color_rgb):
    """Vertical wax-seal line + 3 concentric dots, bottom-right. For Referral."""
    w, h = img.size
    scale = w / 375.0
    rgba_img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Vertical line on right side
    line_w = int(round(10 * scale))
    line_x = int(w * 0.92)
    d.rectangle([line_x, int(h * 0.20), line_x + line_w, int(h * 0.80)],
                fill=(*color_rgb, int(255 * 0.55)))
    # 3 concentric dots, bottom-right
    cx = int(w * 0.85)
    cy = int(h * 0.78)
    for r_base, alpha in [(14, 0.45), (10, 0.60), (6, 0.85)]:
        r = int(r_base * scale)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color_rgb, int(255 * alpha)))
    rgba_img.alpha_composite(overlay)
    return rgba_img.convert("RGB")


# ============================================================================
# Logo / icon / thumbnail derivation
# ============================================================================
def copy_resized(src, dest, size, mode="RGBA"):
    if not src.exists():
        return False
    im = Image.open(src).convert(mode)
    im = im.resize(size, Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    return True


def make_logo_black_variant(src, dest):
    """Invert luma: gold pixels → near-black, alpha based on original luma."""
    if not src.exists():
        return False
    im = Image.open(src).convert("RGBA")
    px = np.array(im)
    rgb = px[..., :3].astype(np.float32)
    luma = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    out = np.zeros_like(px)
    out[..., 0] = luma * 0.05
    out[..., 1] = luma * 0.05
    out[..., 2] = luma * 0.06
    out[..., 3] = np.clip(luma * 1.5, 0, 255)
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out.astype(np.uint8), "RGBA").save(dest, "PNG", optimize=True)
    return True


# ============================================================================
# Pass specs
# ============================================================================
PASS_SPECS = {
    "tenant": {
        "apple_type": "storeCard",
        "params": {
            "color_top_left": (8, 8, 10),
            "color_bottom_right": (28, 28, 32),
            "highlight_color": (212, 175, 55),
            "brush_strength": 0.16,
            "specular_strength": 0.26,
            "line_density": 4,
            "seed": 101,
        },
        "logo_variant": "gold",
        "overlay": ("rings", {"radii": [120, 165, 210, 255, 300], "stroke_w_base": 2,
                              "color_rgb": (212, 175, 55), "alpha": 90}),
        "description": "Black BOOM card — concentric gold rings right side, brushed-metal sheen.",
    },
    "silver": {
        "apple_type": "storeCard",
        "params": {
            "color_top_left": (195, 195, 200),
            "color_bottom_right": (140, 140, 145),
            "highlight_color": (230, 230, 235),
            "brush_strength": 0.18,
            "specular_strength": 0.30,
            "line_density": 4,
            "seed": 505,
        },
        "logo_variant": "gold",
        "overlay": ("rings", {"radii": [120, 165, 210, 255, 300], "stroke_w_base": 2,
                              "color_rgb": (180, 180, 185), "alpha": 90}),
        "description": "Silver brushed metal — VIP tier. Concentric silver rings echo the BOOM signature.",
    },
    "landlord": {
        "apple_type": "storeCard",
        "params": {
            "color_top_left": (190, 158, 102),
            "color_bottom_right": (140, 110, 60),
            "highlight_color": (240, 215, 145),
            "brush_strength": 0.20,
            "specular_strength": 0.32,
            "line_density": 4,
            "seed": 202,
        },
        "logo_variant": "black",
        "overlay": None,  # gold brushed speaks for itself
        "description": "Gold-Amex aesthetic — warm gold→bronze, brighter highlight, no overlay (the metal IS the signature).",
    },
    "viewing": {
        "apple_type": "eventTicket",
        "params": {
            "color_top_left": (8, 8, 10),
            "color_bottom_right": (42, 42, 48),
            "highlight_color": (225, 195, 90),
            "brush_strength": 0.14,
            "specular_strength": 0.28,
            "line_density": 3,
            "seed": 303,
        },
        "logo_variant": "gold",
        "overlay": ("emerging_sun", {"color_rgb": (212, 175, 55)}),
        "description": "Black with stronger gold glow + 'emerging sun' (large + small concentric circle right). Evokes a moment.",
    },
    "referral": {
        "apple_type": "coupon",
        "params": {
            "color_top_left": (8, 8, 10),
            "color_bottom_right": (22, 20, 24),
            "highlight_color": (201, 169, 110),
            "brush_strength": 0.15,
            "specular_strength": 0.25,
            "line_density": 4,
            "seed": 404,
        },
        "logo_variant": "gold",
        "overlay": ("wax_seal", {"color_rgb": (201, 169, 110)}),
        "description": "Black with subtle gradient + warm gold wax-seal line + concentric dots bottom-right.",
    },
}


def strip_dims_for(apple_type):
    """Apple's strip dimensions vary by passType."""
    if apple_type == "eventTicket":
        return [(375, 98), (750, 196), (1125, 294)]
    return [(375, 144), (750, 288), (1125, 432)]


def apply_overlay(img, overlay_spec):
    if not overlay_spec:
        return img
    kind, kwargs = overlay_spec
    if kind == "rings":
        return overlay_concentric_rings(img, **kwargs)
    if kind == "emerging_sun":
        return overlay_emerging_sun(img, **kwargs)
    if kind == "wax_seal":
        return overlay_wax_seal(img, **kwargs)
    return img


def generate_pass_dir(pass_type, spec):
    dest = DEST_ROOT / pass_type
    dest.mkdir(parents=True, exist_ok=True)

    # ICON 29 / 58 / 87
    src_icon = SRC_LOGOS / "icon@2x.png"
    for size, suffix in [(29, ""), (58, "@2x"), (87, "@3x")]:
        copy_resized(src_icon, dest / f"icon{suffix}.png", (size, size))

    # LOGO 160×50 / 320×100 / 480×150
    src_logo = SRC_LOGOS / "logo@2x.png"
    for w, h, suffix in [(160, 50, ""), (320, 100, "@2x"), (480, 150, "@3x")]:
        copy_resized(src_logo, dest / f"logo{suffix}.png", (w, h))

    # Landlord wants a black variant (luma-inverted) for contrast on gold strip
    if spec["logo_variant"] == "black":
        for suffix in ["", "@2x", "@3x"]:
            make_logo_black_variant(dest / f"logo{suffix}.png", dest / f"logo{suffix}.png")

    # THUMBNAIL 90 / 180 / 270 (eventTicket uses it; harmless for others)
    src_thumb = SRC_LOGOS / "thumbnail@2x.png"
    for size, suffix in [(90, ""), (180, "@2x"), (270, "@3x")]:
        copy_resized(src_thumb, dest / f"thumbnail{suffix}.png", (size, size))

    # STRIP — dim depends on Apple type
    sizes = strip_dims_for(spec["apple_type"])
    suffixes = ["", "@2x", "@3x"]
    for (w, h), sfx in zip(sizes, suffixes):
        seed = spec["params"]["seed"]
        # Scale brush_strength/specular slightly for retina to keep visual parity
        params = dict(spec["params"])
        params["seed"] = seed  # deterministic
        img = generate_aggressive_brushed_metal(width=w, height=h, **params)
        img = apply_overlay(img, spec.get("overlay"))
        out_path = dest / f"strip{sfx}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path, "PNG", optimize=True)


# ============================================================================
# Preview HTML
# ============================================================================
def write_preview_html():
    out = DEST_ROOT / "preview.html"
    blocks = []
    for pass_type, spec in PASS_SPECS.items():
        atype = spec["apple_type"]
        sizes = strip_dims_for(atype)
        # Show 1× rendered at native size, 2× and 3× scaled to fit container width
        blocks.append(
            f"""
    <div class="pass">
        <h3>{pass_type.title()} <span class="atype">— {atype}</span></h3>
        <div class="desc">{spec['description']}</div>
        <div class="strips">
            <div class="strip-row x1"><div class="label">1×<br>{sizes[0][0]}×{sizes[0][1]}</div><img src="{pass_type}/strip.png" alt="{pass_type} 1x"></div>
            <div class="strip-row x2"><div class="label">2×<br>{sizes[1][0]}×{sizes[1][1]}</div><img src="{pass_type}/strip@2x.png" alt="{pass_type} 2x"></div>
            <div class="strip-row x3"><div class="label">3×<br>{sizes[2][0]}×{sizes[2][1]}</div><img src="{pass_type}/strip@3x.png" alt="{pass_type} 3x"></div>
        </div>
    </div>"""
        )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BOOM PropPass V2 — Strip Preview</title>
<style>
    body {{
        background: #0a0a0a; color: #e8e8e8;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
        font-weight: 300; padding: 32px; margin: 0;
    }}
    h1 {{ color: #D4AF37; font-weight: 300; letter-spacing: 4px;
          text-transform: uppercase; font-size: 18px; margin-bottom: 8px; }}
    .lede {{ color: #888; font-size: 13px; margin-bottom: 36px; max-width: 680px; line-height: 1.6; }}
    .grid {{ display: grid; grid-template-columns: 1fr; gap: 28px; max-width: 820px; }}
    .pass {{ background: #141414; border: 1px solid #222; border-radius: 14px; padding: 18px; }}
    .pass h3 {{ margin: 0 0 4px; font-weight: 400; font-size: 16px;
                letter-spacing: 1.2px; text-transform: uppercase; color: #D4AF37; }}
    .pass .atype {{ font-size: 11px; color: #888; letter-spacing: 1px; text-transform: lowercase; }}
    .pass .desc {{ font-size: 12px; color: #999; margin: 8px 0 14px; line-height: 1.5; }}
    .strips {{ display: flex; flex-direction: column; gap: 10px; }}
    .strip-row {{ display: flex; align-items: center; gap: 14px; }}
    .strip-row .label {{ font-size: 9.5px; color: #555; letter-spacing: 0.5px;
                          text-transform: uppercase; width: 70px; flex-shrink: 0; line-height: 1.4; }}
    .strip-row img {{ display: block; border-radius: 4px; max-width: 100%; height: auto; }}
    .strip-row.x1 img {{ width: 375px; }}
    .strip-row.x2 img {{ width: 375px; opacity: 0.7; }}
    .strip-row.x3 img {{ width: 375px; opacity: 0.5; }}
    .footnote {{ margin-top: 40px; font-size: 11px; color: #444;
                  line-height: 1.6; padding-top: 20px; border-top: 1px solid #1f1f1f; }}
</style>
</head>
<body>
<h1>BOOM PropPass V2 — Strip Preview</h1>
<p class="lede">
    Phase 1.5 deliverable: 5 procedural brushed-metal strips, V3 algorithm.
    Multi-octave noise + horizontal brush lines + asymmetric specular highlight + signature overlays.
    Strip is the dominant visual real estate on Apple Wallet cards.
</p>
<div class="grid">{''.join(blocks)}
</div>
<p class="footnote">
    Generated by <code>scripts/generate-pass-assets.py</code> (V3 aggressive brushed metal).
    storeCard / coupon strips: 375×144. eventTicket strip: 375×98.
    Re-run any time — seeded deterministic.
</p>
</body>
</html>
"""
    out.write_text(html, encoding="utf-8")
    return out


def main():
    print("BOOM PropPass V2 — Asset pipeline (V3 brushed metal)")
    print(f"  source logos: {SRC_LOGOS}")
    print(f"  output dir:   {DEST_ROOT}")
    print()

    if not SRC_LOGOS.exists():
        print(f"FATAL: source dir missing: {SRC_LOGOS}")
        sys.exit(1)

    DEST_ROOT.mkdir(parents=True, exist_ok=True)

    for pass_type, spec in PASS_SPECS.items():
        print(f"  → {pass_type} [{spec['apple_type']}]: {spec['description']}")
        generate_pass_dir(pass_type, spec)

    preview = write_preview_html()
    print(f"\n  Preview: {preview}")

    # Inventory
    print("\n=== Generated files ===")
    total = 0
    file_count = 0
    for pass_type in PASS_SPECS.keys():
        d = DEST_ROOT / pass_type
        for f in sorted(d.glob("*.png")):
            file_count += 1
            size = f.stat().st_size
            total += size
            try:
                im = Image.open(f)
                dim = f"{im.size[0]}×{im.size[1]}"
            except Exception:
                dim = "?"
            print(f"  {f.relative_to(REPO_ROOT)}  {dim}  {size:>7} b")
    print(f"\n  Total: {file_count} files, {total/1024:.1f} KB")


if __name__ == "__main__":
    main()
