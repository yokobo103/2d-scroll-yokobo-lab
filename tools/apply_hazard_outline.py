"""Apply an adjustable dark outline behind a transparent hazard sprite.

This is a review-iteration tool, not an aesthetic validator. It never changes
the source sprite's visible pixels; it only dilates the alpha mask and places a
parameterized navy-to-black outline behind the original RGBA image.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


BASE_NAVY = (28, 50, 78)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--thickness", type=int, required=True, help="Outline radius in pixels (1-16)")
    parser.add_argument("--darkness", type=float, required=True, help="0 keeps base navy; 1 approaches black")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 1 <= args.thickness <= 16:
        raise ValueError("--thickness must be between 1 and 16")
    if not 0 <= args.darkness <= 1:
        raise ValueError("--darkness must be between 0 and 1")

    source_path = Path(args.input)
    output_path = Path(args.output)
    source = Image.open(source_path).convert("RGBA")
    alpha = source.getchannel("A")
    filter_size = args.thickness * 2 + 1
    dilated = alpha.filter(ImageFilter.MaxFilter(filter_size))
    outline_alpha = ImageChops.subtract(dilated, alpha)
    color = tuple(round(channel * (1 - args.darkness)) for channel in BASE_NAVY)
    outline = Image.new("RGBA", source.size, (*color, 0))
    outline.putalpha(outline_alpha)
    result = Image.alpha_composite(outline, source)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path)
    print(
        f"Outline applied: thickness={args.thickness}px darkness={args.darkness:.2f} "
        f"color=#{color[0]:02x}{color[1]:02x}{color[2]:02x} -> {output_path}"
    )


if __name__ == "__main__":
    main()
