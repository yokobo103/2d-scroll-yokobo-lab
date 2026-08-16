"""Build prototype-only 1F/3F judgment backdrops; never used by runtime.

The 1F PNG is a format-preserving copy of the current Stage 01 near layer.
The 3F PNG is a temporary hue-rotated cold plate for hazard-grammar review,
not production Stage 03 artwork.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/stage01_normal_lab/runtime/parallax/near.webp"
OUTPUT = ROOT / "assets/prototypes/hazard-grammar"


def rotate_hue(image: Image.Image, shift: int) -> Image.Image:
    alpha = image.getchannel("A")
    hsv = image.convert("RGB").convert("HSV")
    hue, saturation, value = hsv.split()
    hue = hue.point(lambda channel: (channel + shift) % 256)
    cold = Image.merge("HSV", (hue, saturation, value)).convert("RGBA")
    cold.putalpha(alpha)
    cold = ImageEnhance.Color(cold).enhance(0.84)
    veil = Image.new("RGBA", cold.size, (205, 239, 255, 24))
    return Image.alpha_composite(cold, veil)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    source.save(OUTPUT / "backdrop-1f.png")
    rotate_hue(source, 18).save(OUTPUT / "backdrop-3f.png")
    print(f"Prototype backdrops: {source.width}x{source.height}")


if __name__ == "__main__":
    main()
