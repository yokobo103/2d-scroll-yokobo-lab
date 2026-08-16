from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "objects" / "platform_modular"
SOURCES = {
    "cap_left": ASSETS / "cap_left" / "processed" / "platform-cap-left-1.png",
    "mid_a": ASSETS / "mid_a" / "processed" / "platform-mid-a-1.png",
    "mid_b": ASSETS / "mid_b" / "processed" / "platform-mid-b-1.png",
}


def trimmed(path: Path, padding: int = 4) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"No visible pixels in {path}")
    left, top, right, bottom = bbox
    return image.crop((max(0, left - padding), max(0, top - padding), min(image.width, right + padding), min(image.height, bottom + padding)))


def save_runtime(name: str, image: Image.Image) -> Path:
    out_dir = ASSETS / name
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "runtime.png"
    image.save(out_path, optimize=True)
    return out_path


def main() -> None:
    cap = trimmed(SOURCES["cap_left"])
    mid_a = trimmed(SOURCES["mid_a"])
    mid_b = trimmed(SOURCES["mid_b"])

    save_runtime("cap_left", cap)
    save_runtime("cap_right", ImageOps.mirror(cap))
    save_runtime("mid_a", mid_a)
    save_runtime("mid_b", mid_b)

    height = 136
    cap_width = 92
    middle_width = 216
    overlap = 12
    pieces = [
        (cap, cap_width),
        (mid_a, middle_width),
        (mid_b, middle_width),
        (ImageOps.mirror(cap), cap_width),
    ]
    width = sum(piece_width for _, piece_width in pieces) - overlap * (len(pieces) - 1)
    preview = Image.new("RGBA", (width + 48, height + 84), (4, 12, 30, 255))
    x = 24
    for image, piece_width in pieces:
        fitted = image.resize((piece_width, height), Image.Resampling.LANCZOS)
        preview.alpha_composite(fitted, (x, 24))
        x += piece_width - overlap
    preview.save(ASSETS / "assembly-preview.png", optimize=True)


if __name__ == "__main__":
    main()
