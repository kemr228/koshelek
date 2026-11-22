"""Генератор иконок для PWA. Запуск:
    python tools/make-icons.py
Создаёт icons/icon-1024.png, icon-512.png, icon-192.png, icon-180.png,
icon-maskable-512.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)

SIZE = 1024
C1 = (10, 132, 255)    # #0A84FF
C2 = (94, 92, 230)     # #5E5CE6


def gradient(size: int) -> Image.Image:
    """Диагональный градиент без numpy-зависимостей от версии."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / (size - 1) + y / (size - 1)) / 2
            px[x, y] = (
                int(C1[0] * (1 - t) + C2[0] * t),
                int(C1[1] * (1 - t) + C2[1] * t),
                int(C1[2] * (1 - t) + C2[2] * t),
            )
    return img.convert("RGBA")


def bars(size: int, scale: float = 1.0) -> Image.Image:
    """Три белые «столбика» — узнаваемый знак финансов/статистики."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    bar_w, gap, bottom = 110, 60, 740
    heights = (280, 430, 580)
    total = len(heights) * bar_w + (len(heights) - 1) * gap
    x0 = (size - total) // 2

    for i, h in enumerate(heights):
        x = x0 + i * (bar_w + gap)
        d.rounded_rectangle(
            [x, bottom - h, x + bar_w, bottom],
            radius=bar_w // 2,
            fill=(255, 255, 255, 255),
        )

    if scale != 1.0:
        small = layer.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        off = (size - small.width) // 2
        canvas.paste(small, (off, off), small)
        layer = canvas

    return layer


def build(scale: float) -> Image.Image:
    img = gradient(SIZE)
    img.alpha_composite(bars(SIZE, scale))
    return img


def main() -> None:
    full = build(1.0)
    full.save(ICONS / "icon-1024.png")

    for s in (512, 192, 180):
        full.resize((s, s), Image.LANCZOS).save(ICONS / f"icon-{s}.png")

    # maskable: содержимое в безопасной зоне 80%
    build(0.76).resize((512, 512), Image.LANCZOS).save(ICONS / "icon-maskable-512.png")

    print("Готово:")
    for p in sorted(ICONS.glob("*.png")):
        print(f"  {p.name:26} {p.stat().st_size // 1024:>4} КБ")


if __name__ == "__main__":
    main()
