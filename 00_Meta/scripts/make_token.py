#!/usr/bin/env python3
"""
make_token.py — превращает сырой бюст-рендер (квадрат) в готовый VTT-токен:
круглая обрезка + прозрачность за кругом (anti-aliased), опционально рамка-кольцо.

Часть пайплайна «Токены NPC» (см. 00_Meta/Пайплайн — токены NPC.md).
Зависит только от Pillow.

Примеры:
    python make_token.py in.png out.png                 # чистый круглый вырез, 1024px
    python make_token.py in.png out.png --size 512       # ресайз до 512
    python make_token.py in.png out.png --ring "#b8860b" # тонкое золотое кольцо по краю

Заметки:
  * Вход обрезается по центру до квадрата, поэтому важно, чтобы лицо было
    примерно в центре кадра (наш промпт это обеспечивает: three-quarter/front bust).
  * Anti-aliasing делается через supersample (рендер маски x4, потом downscale).
"""
import argparse
from PIL import Image, ImageDraw


def center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return img.crop((left, top, left + s, top + s))


def circular_token(src_path: str, out_path: str, size: int = 1024,
                   ring_color: str | None = None, ring_frac: float = 0.02) -> None:
    ss = 4  # supersample factor for smooth edges
    img = Image.open(src_path).convert("RGBA")
    img = center_square(img).resize((size * ss, size * ss), Image.LANCZOS)

    # круглая альфа-маска
    mask = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    img.putalpha(mask)

    # опциональное кольцо по краю
    if ring_color:
        ring = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        width = max(2, int(size * ss * ring_frac))
        rd.ellipse((width // 2, width // 2,
                    size * ss - 1 - width // 2, size * ss - 1 - width // 2),
                   outline=ring_color, width=width)
        img = Image.alpha_composite(img, ring)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(out_path)
    print(f"saved {out_path} ({size}x{size}, transparent circle"
          + (f", ring {ring_color}" if ring_color else "") + ")")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Raw bust render -> round transparent VTT token")
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--size", type=int, default=1024, help="output px (default 1024)")
    ap.add_argument("--ring", default=None, help="ring color, e.g. '#b8860b' (default: none)")
    ap.add_argument("--ring-frac", type=float, default=0.02, help="ring width as frac of size")
    a = ap.parse_args()
    circular_token(a.src, a.out, a.size, a.ring, a.ring_frac)
