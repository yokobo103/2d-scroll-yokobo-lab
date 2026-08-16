"""Normalize generated art to the stage canvas and build QA composites."""

from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "assets" / "map"
CANVAS = (1536, 864)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    ratio = max(size[0] / image.width, size[1] / image.height)
    scaled = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    left = (scaled.width - size[0]) // 2
    top = (scaled.height - size[1]) // 2
    return scaled.crop((left, top, left + size[0], top + size[1]))


def normalize_layers() -> None:
    sources = {
        "sky": "crystal-lab-sky-raw.png",
        "far-bg": "crystal-lab-far-bg-keyed.png",
        "mid-bg": "crystal-lab-mid-bg-keyed.png",
        "near-bg": "crystal-lab-near-bg-keyed.png",
    }
    for name, source in sources.items():
        image = Image.open(MAP / source).convert("RGBA")
        cover(image, CANVAS).save(MAP / f"crystal-lab-{name}.png")


def composite_background() -> None:
    result = Image.open(MAP / "crystal-lab-sky.png").convert("RGBA")
    for name, alpha in (("far-bg", 120), ("mid-bg", 180), ("near-bg", 228)):
        layer = Image.open(MAP / f"crystal-lab-{name}.png").convert("RGBA")
        layer.putalpha(layer.getchannel("A").point(lambda value: value * alpha // 255))
        result.alpha_composite(layer)
    glow = result.filter(ImageFilter.GaussianBlur(18))
    glow.putalpha(22)
    result = Image.alpha_composite(result, glow)
    result = ImageEnhance.Contrast(result).enhance(1.04)
    result.save(MAP / "crystal-lab-background-preview.png")


if __name__ == "__main__":
    normalize_layers()
    composite_background()
    print(f"Prepared stage canvas {CANVAS[0]}x{CANVAS[1]}")
