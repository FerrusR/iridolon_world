#!/usr/bin/env python3
"""
token_frame.py — из RGBA-выреза собирает Foundry Dynamic-Ring subject.

Правило: разрыв рамки только СВЕРХУ и ПО БОКАМ; низ срезается ЧЁТКОЙ круговой
маской по линии кольца (стандартный приём подготовки токенов).

Маска allow = max(cap, disk):
  * cap  — всё выше y_cut оставляем как есть (голова/плечи выходят вверх и вбок);
  * disk — ниже y_cut оставляем только внутри окружности радиуса R (= линия кольца),
           край чёткий (лёгкий AA) → низ вписан ровно по кольцу, не торчит.

Превью рисует тонкое кольцо+подложку (subject поверх ring, как в Foundry),
кольцо совмещено с линией среза, чтобы видеть посадку.
"""
import argparse
import numpy as np
from PIL import Image, ImageDraw

RING_INNER = 0.70   # доля base: линия среза / внутренняя кромка кольца
RING_OUTER = 0.82   # доля base: внешняя кромка ободка (только для превью)


def content_bbox(rgba, thr=16):
    a = np.array(rgba)[:, :, 3]
    ys, xs = np.where(a > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(cut_path, canvas, height_frac, top_frac):
    im = Image.open(cut_path).convert("RGBA")
    l, t, r, b = content_bbox(im)
    c = im.crop((l, t, r, b))
    cw, ch = c.size
    f = (canvas * height_frac) / ch
    nw, nh = max(1, round(cw * f)), max(1, round(ch * f))
    c = c.resize((nw, nh), Image.LANCZOS)
    subj = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    subj.alpha_composite(c, (round(canvas / 2 - nw / 2), round(canvas * top_frac)))
    return subj


def cut_mask(canvas, ring_template, rc_frac, cap_frac, aa_disk=1.3, aa_cap=7.0):
    base = ring_template / 2.0
    cx = cy = canvas / 2.0
    R = rc_frac * base
    yy, xx = np.ogrid[:canvas, :canvas]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    disk = np.clip((R - dist) / aa_disk + 0.5, 0, 1)          # ЧЁТКАЯ окружность
    ycut = cap_frac * canvas
    Y = np.broadcast_to(np.arange(canvas)[:, None], (canvas, canvas))
    cap = np.clip((ycut - Y) / aa_cap + 0.5, 0, 1)            # мягкий переход у плеч
    return np.maximum(disk, cap)


def build(cut_path, out_subject, out_preview, canvas, ring_template,
          height_frac, top_frac, rc_frac, cap_frac):
    subj = place(cut_path, canvas, height_frac, top_frac)
    allow = cut_mask(canvas, ring_template, rc_frac, cap_frac)
    arr = np.array(subj).astype(np.float32)
    arr[:, :, 3] *= allow
    subj = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    subj.save(out_subject)

    # ---- превью ----
    base = ring_template / 2.0
    cx = cy = canvas / 2.0
    inner, outer = RING_INNER * base, RING_OUTER * base
    layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([cx - outer, cy - outer, cx + outer, cy + outer],
                                  fill=(28, 24, 20, 165))          # background disk
    ring = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=(150, 120, 66, 255))
    rd.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=(0, 0, 0, 0))
    layer = Image.alpha_composite(layer, ring)
    prev = Image.alpha_composite(layer, subj)
    bg = Image.new("RGBA", prev.size, (92, 94, 98, 255))
    Image.alpha_composite(bg, prev).convert("RGB").save(out_preview)
    print(f"{out_subject} | preview {out_preview} (R={rc_frac}*base, y_cut={cap_frac})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cutout"); ap.add_argument("out_subject"); ap.add_argument("out_preview")
    ap.add_argument("--canvas", type=int, default=512)
    ap.add_argument("--ring-template", type=int, default=None)
    ap.add_argument("--height-frac", type=float, default=0.82)
    ap.add_argument("--top-frac", type=float, default=0.05)
    ap.add_argument("--rc-frac", type=float, default=RING_INNER, help="радиус среза (доля base)")
    ap.add_argument("--cap-frac", type=float, default=0.52, help="выше этой доли холста — свободный разрыв")
    a = ap.parse_args()
    build(a.cutout, a.out_subject, a.out_preview, a.canvas,
          a.ring_template or a.canvas, a.height_frac, a.top_frac, a.rc_frac, a.cap_frac)
