"""Generate the Komorebi app icon set.

Clean modern monogram: a stylized "K" carved from light against a warm
sunset-purple gradient. Evokes 木漏れ日 (komorebi — sunlight through
trees) without literal leaves: the negative space *is* the light.

Renders crisp at every Tauri-required size (16 -> 1024).
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
ROOT.mkdir(parents=True, exist_ok=True)

MASTER_SIZE = 1024


def lerp_rgb(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=radius, fill=255
    )
    return m


def gradient_background(size: int) -> Image.Image:
    """Diagonal gradient: deep indigo (top-left) -> warm magenta-pink (bottom-right)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    top_left = (38, 28, 78)
    middle = (110, 55, 130)
    bottom_right = (235, 110, 130)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            if t < 0.5:
                col = lerp_rgb(top_left, middle, t * 2)
            else:
                col = lerp_rgb(middle, bottom_right, (t - 0.5) * 2)
            px[x, y] = col
    return img


def warm_glow(size: int) -> Image.Image:
    """Soft golden bloom in the upper-right -- the 'sunlight'."""
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = glow.load()
    cx, cy = size * 0.78, size * 0.22
    radius = size * 0.55
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / radius
            if d >= 1.2:
                continue
            falloff = max(0.0, 1.0 - d)
            falloff = falloff * falloff
            a = int(180 * falloff)
            px[x, y] = (255, 215, 165, a)
    return glow.filter(ImageFilter.GaussianBlur(size * 0.03))


def thick_line(p1, p2, width, draw, fill):
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    ox, oy = nx * width / 2, ny * width / 2
    draw.polygon(
        [
            (p1[0] + ox, p1[1] + oy),
            (p2[0] + ox, p2[1] + oy),
            (p2[0] - ox, p2[1] - oy),
            (p1[0] - ox, p1[1] - oy),
        ],
        fill=fill,
    )
    r = width / 2
    draw.ellipse([p2[0] - r, p2[1] - r, p2[0] + r, p2[1] + r], fill=fill)
    draw.ellipse([p1[0] - r, p1[1] - r, p1[0] + r, p1[1] + r], fill=fill)


def k_glyph(size: int) -> Image.Image:
    """Bold geometric K -- vertical stem plus two diagonals meeting mid-height."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    fill = (255, 250, 240, 255)

    left = size * 0.30
    top = size * 0.20
    bottom = size * 0.80
    stem_w = size * 0.115
    stem_right = left + stem_w

    # Vertical stem
    d.rectangle([left, top, stem_right, bottom], fill=fill)

    junction = (stem_right, (top + bottom) / 2)
    arm_w = size * 0.115
    upper_tip = (size * 0.72, top)
    lower_tip = (size * 0.74, bottom)

    thick_line(junction, upper_tip, arm_w, d, fill)
    thick_line(junction, lower_tip, arm_w, d, fill)

    # Soft drop-shadow underneath
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    off = int(size * 0.012)
    sd.rectangle(
        [left + off, top + off, stem_right + off, bottom + off],
        fill=(0, 0, 0, 90),
    )
    thick_line(
        (junction[0] + off, junction[1] + off),
        (upper_tip[0] + off, upper_tip[1] + off),
        arm_w, sd, (0, 0, 0, 90),
    )
    thick_line(
        (junction[0] + off, junction[1] + off),
        (lower_tip[0] + off, lower_tip[1] + off),
        arm_w, sd, (0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.018))

    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base = Image.alpha_composite(base, shadow)
    base = Image.alpha_composite(base, layer)
    return base


def sparkle(size: int, cx: float, cy: float, scale: float = 1.0) -> Image.Image:
    """A 4-point sparkle to break negative space."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    s_long = size * 0.05 * scale
    s_short = size * 0.012 * scale
    color = (255, 245, 220, 230)
    d.polygon(
        [
            (cx, cy - s_long),
            (cx + s_short, cy),
            (cx, cy + s_long),
            (cx - s_short, cy),
        ],
        fill=color,
    )
    d.polygon(
        [
            (cx - s_long, cy),
            (cx, cy - s_short),
            (cx + s_long, cy),
            (cx, cy + s_short),
        ],
        fill=color,
    )
    return layer.filter(ImageFilter.GaussianBlur(size * 0.003))


def vignette(size: int) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = layer.load()
    cx, cy = size / 2, size / 2
    max_r = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / max_r
            if d < 0.55:
                continue
            a = int(min(90, (d - 0.55) * 220))
            px[x, y] = (0, 0, 0, a)
    return layer


def build_master() -> Image.Image:
    s = MASTER_SIZE
    bg = gradient_background(s).convert("RGBA")
    out = Image.alpha_composite(bg, warm_glow(s))
    out = Image.alpha_composite(out, sparkle(s, s * 0.80, s * 0.68, 1.0))
    out = Image.alpha_composite(out, sparkle(s, s * 0.20, s * 0.30, 0.55))
    out = Image.alpha_composite(out, k_glyph(s))
    out = Image.alpha_composite(out, vignette(s))

    mask = rounded_rect_mask(s, int(s * 0.22))
    final = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    final.paste(out, (0, 0), mask)
    return final


def save_png(img: Image.Image, path: Path, size: int) -> None:
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(path, "PNG", optimize=True)
    print(f"  wrote {path.relative_to(ROOT.parent.parent)} ({size}x{size})")


def save_ico(img: Image.Image, path: Path) -> None:
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(path, format="ICO", sizes=sizes)
    print(f"  wrote {path.relative_to(ROOT.parent.parent)} (multi-res ICO)")


def save_icns(img: Image.Image, path: Path) -> None:
    sizes = [
        (16, 16), (32, 32), (64, 64),
        (128, 128), (256, 256), (512, 512), (1024, 1024),
    ]
    img.save(path, format="ICNS", sizes=sizes)
    print(f"  wrote {path.relative_to(ROOT.parent.parent)} (multi-res ICNS)")


def main() -> None:
    print("Generating Komorebi icon set...")
    master = build_master()

    save_png(master, ROOT / "32x32.png", 32)
    save_png(master, ROOT / "128x128.png", 128)
    save_png(master, ROOT / "128x128@2x.png", 256)
    save_png(master, ROOT / "icon.png", 512)
    save_ico(master, ROOT / "icon.ico")
    try:
        save_icns(master, ROOT / "icon.icns")
    except Exception as e:
        print(f"  (icns skipped: {e})")
    save_png(master, ROOT / "icon-1024.png", 1024)
    print("Done.")


if __name__ == "__main__":
    main()
