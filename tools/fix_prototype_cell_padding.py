"""Prototype-only grid alignment helper; never used by the game runtime.

Moves one generated sprite cell (plus a narrow overflow-capture band above it)
without redrawing or rescaling the generated art. This is deterministic layout
post-processing for generate2dsprite edge-containment QC.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


MAGENTA = (255, 0, 255, 255)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--cols", type=int, required=True)
    parser.add_argument("--row", type=int, required=True)
    parser.add_argument("--col", type=int, required=True)
    parser.add_argument("--shift-y", type=int, required=True)
    parser.add_argument("--capture-top", type=int, default=0)
    args = parser.parse_args()

    source_path = Path(args.input)
    output_path = Path(args.output)
    image = Image.open(source_path).convert("RGBA")
    cell_w = image.width // args.cols
    cell_h = image.height // args.rows
    x0 = args.col * cell_w
    x1 = x0 + cell_w
    y0 = args.row * cell_h
    y1 = y0 + cell_h
    capture_y0 = max(0, y0 - args.capture_top)

    cell = image.crop((x0, capture_y0, x1, y1))
    image.paste(Image.new("RGBA", (cell_w, y1 - capture_y0), MAGENTA), (x0, capture_y0))
    image.paste(cell, (x0, capture_y0 + args.shift_y), cell)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    print(
        f"Moved cell ({args.row}, {args.col}) down {args.shift_y}px "
        f"with {args.capture_top}px overflow capture -> {output_path}"
    )


if __name__ == "__main__":
    main()
