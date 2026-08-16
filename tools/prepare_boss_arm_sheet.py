from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


MAGENTA = (255, 0, 255, 255)


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove generated cell dividers and add safe magenta padding.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--cols", type=int, default=3)
    parser.add_argument("--inset", type=int, default=8)
    parser.add_argument("--padding", type=int, default=12)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    cell_w = source.width // args.cols
    cell_h = source.height // args.rows
    sheet = Image.new("RGBA", (source.width, source.height), MAGENTA)
    for row in range(args.rows):
        for col in range(args.cols):
            x0, y0 = col * cell_w, row * cell_h
            crop = source.crop((x0 + args.inset, y0 + args.inset, x0 + cell_w - args.inset, y0 + cell_h - args.inset))
            target_w = cell_w - args.padding * 2
            target_h = cell_h - args.padding * 2
            crop.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
            x = x0 + (cell_w - crop.width) // 2
            y = y0 + (cell_h - crop.height) // 2
            sheet.alpha_composite(crop, (x, y))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.output)


if __name__ == "__main__":
    main()
