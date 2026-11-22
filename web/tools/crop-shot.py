"""Вырезает из скриншота область «телефона» (iframe 390x844 при DPR 2).
    python tools/crop-shot.py in.png out.png
"""
import sys

from PIL import Image

LEFT, TOP = 20, 20
W, H = 390, 844
DPR = 2


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    box = (LEFT * DPR, TOP * DPR, (LEFT + W) * DPR, (TOP + H) * DPR)
    im.crop(box).save(dst)


if __name__ == "__main__":
    main()
