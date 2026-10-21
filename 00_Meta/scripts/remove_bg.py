#!/usr/bin/env python3
"""
remove_bg.py — прозрачный фон для портретов токенов NPC без ComfyUI.

Два режима:
  check  — проверить картинку, которая УЖЕ пришла с прозрачностью (напр. из ChatGPT / GPT Image):
           есть ли альфа, прозрачны ли углы, сколько фона вырезано; пишет превью на пурпуре.
  cut    — вырезать плоский белый фон моделью BiRefNet-ToonOut (ONNX, CPU), как раньше делал ComfyUI.

Примеры:
  python3 00_Meta/scripts/remove_bg.py check portrait.png
  python3 00_Meta/scripts/remove_bg.py cut   portrait.png cutout.png

Зависимости: numpy, Pillow; для `cut` ещё onnxruntime  (pip install --user onnxruntime).
Модель: _models/birefnet-toonout.onnx (или -fp16.onnx) в корне волта, в гит не идёт.
Нет файла — скрипт скачает его с Hugging Face (sprited/birefnet-toonout-onnx) или скажет, как.
"""
import argparse, os, sys, urllib.request
import numpy as np
from PIL import Image

VAULT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(VAULT, "_models")
HF_REPO = "https://huggingface.co/sprited/birefnet-toonout-onnx/resolve/main/"
MODEL_FILES = ["birefnet-toonout.onnx", "birefnet-toonout-fp16.onnx"]   # fp32 первым: на CPU он надёжнее
SIZE = 1024
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ── check ──────────────────────────────────────────────────────────────────────
def magenta_preview(im, path):
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
    Image.alpha_composite(bg, im.convert("RGBA")).convert("RGB").save(path)


def report(im, label):
    """Печатает сводку по альфе. Возвращает True, если прозрачность похожа на настоящую."""
    if "A" not in im.getbands():
        print(f"{label}: альфа-канала НЕТ (режим {im.mode}) — прозрачность только нарисована "
              f"(шахматка/белый). Нужен `cut`.")
        return False
    a = np.asarray(im.getchannel("A"))
    h, w = a.shape
    k = max(4, min(h, w) // 50)
    # только верхние углы: у поясного кадра фигура уходит за нижний край, там альфа законно 255
    corners = [a[:k, :k], a[:k, -k:]]
    corner_max = max(int(c.max()) for c in corners)
    clear = float((a == 0).mean())
    partial = float(((a > 0) & (a < 255)).mean())
    ys, xs = np.nonzero(a > 16)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
    print(f"{label}: {w}x{h}, прозрачно {clear:.0%}, полупрозрачная кромка {partial:.1%}, "
          f"max альфа в верхних углах {corner_max}, bbox фигуры {bbox}")
    ok = corner_max <= 8 and clear > 0.05
    if not ok:
        print("  ⚠ верхние углы не прозрачны или фон почти не вырезан — прозрачность ненастоящая/неполная.")
    body = a[a > 16]
    if body.size and float((body == 255).mean()) < 0.5 and float((body >= 240).mean()) > 0.5:
        # GPT Image (ChatGPT/Codex) отдаёт тело с альфой ~253: на глаз не видно, token_frame.py дотянет до 255
        print("  ℹ тело фигуры почти, но не полностью непрозрачно (альфа ~240–254) — "
              "token_frame.py поднимет его до 255 (--opaque-from).")
    return ok


# ── cut ────────────────────────────────────────────────────────────────────────
def find_model(explicit):
    if explicit:
        if not os.path.isfile(explicit):
            sys.exit(f"Нет файла модели: {explicit}")
        return explicit
    for name in MODEL_FILES:
        p = os.path.join(MODEL_DIR, name)
        if os.path.isfile(p):
            return p
    name = MODEL_FILES[0]
    dest = os.path.join(MODEL_DIR, name)
    print(f"Модели нет — качаю {name} (~1 ГБ, один раз) в {MODEL_DIR} …", file=sys.stderr)
    os.makedirs(MODEL_DIR, exist_ok=True)
    try:
        urllib.request.urlretrieve(HF_REPO + name, dest + ".part")
        os.replace(dest + ".part", dest)
    except Exception as e:
        if os.path.exists(dest + ".part"):
            os.remove(dest + ".part")
        sys.exit(f"Не удалось скачать модель ({e}).\nСкачай вручную и положи в {MODEL_DIR}/:\n"
                 f"  {HF_REPO}{name}\n  (или лёгкую {HF_REPO}{MODEL_FILES[1]})")
    return dest


def predict_mask(model_path, rgb):
    try:
        import onnxruntime as ort
    except ImportError:
        sys.exit("Нужен onnxruntime: pip install --user onnxruntime")
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    x = np.asarray(rgb.resize((SIZE, SIZE), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    inp = sess.get_inputs()[0].name
    out = sess.run(None, {inp: x})[0]                       # [1,1,1024,1024], уже после sigmoid
    m = np.clip(np.squeeze(out), 0.0, 1.0)
    return Image.fromarray((m * 255).round().astype(np.uint8), "L").resize(rgb.size, Image.BILINEAR)


def cmd_cut(a):
    src = Image.open(a.input)
    rgb = src.convert("RGB")
    mask = predict_mask(find_model(a.model), rgb)
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    out.save(a.output)
    prev = os.path.splitext(a.output)[0] + "_check.png"
    magenta_preview(out, prev)
    report(out, a.output)
    print(f"превью на пурпуре: {prev}")


def cmd_check(a):
    im = Image.open(a.input)
    ok = report(im, a.input)
    if "A" in im.getbands():
        prev = os.path.splitext(a.input)[0] + "_check.png"
        magenta_preview(im, prev)
        print(f"превью на пурпуре: {prev}")
    sys.exit(0 if ok else 1)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="проверить готовую прозрачность (из ChatGPT)")
    c.add_argument("input")
    c.set_defaults(fn=cmd_check)
    k = sub.add_parser("cut", help="вырезать плоский белый фон BiRefNet-ToonOut (ONNX)")
    k.add_argument("input")
    k.add_argument("output", help="RGBA .png")
    k.add_argument("--model", help="путь к .onnx (по умолчанию _models/ в корне волта)")
    k.set_defaults(fn=cmd_cut)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
