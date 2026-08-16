"""Prepare accepted generated prefab art for the project runtime."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PLATFORM_ROOT = ROOT / "assets/objects/lab_platform_strip"
ALPHA_THRESHOLD = 128
SURFACE_Y = 6
DISPLAY_HEIGHT = 150
PIECES = {
    "cap_left": (PLATFORM_ROOT / "processed/lab-platform-1.png", 120),
    "middle": (PLATFORM_ROOT / "processed/lab-platform-2.png", 200),
    "cap_right": (PLATFORM_ROOT / "processed/lab-platform-3.png", 120),
}


def opaque_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    mask = image.getchannel("A").point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("Generated asset contains no visible pixels")
    return bbox


def first_opaque_surface(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    tops = []
    for x in range(int(image.width * 0.14), int(image.width * 0.86)):
        for y in range(image.height):
            if alpha.getpixel((x, y)) >= ALPHA_THRESHOLD:
                tops.append(y)
                break
    if not tops:
        raise RuntimeError("Platform has no measurable surface")
    tops.sort()
    return tops[len(tops) // 2]


def normalize_piece(source: Path, target_width: int) -> tuple[Image.Image, dict]:
    image = Image.open(source).convert("RGBA")
    image = image.crop(opaque_bbox(image))
    scale = min((target_width - 4) / image.width, (DISPLAY_HEIGHT - SURFACE_Y - 4) / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    resized = image.resize(size, Image.Resampling.LANCZOS)
    source_surface = first_opaque_surface(resized)
    output = Image.new("RGBA", (target_width, DISPLAY_HEIGHT), (0, 0, 0, 0))
    paste_x = (target_width - resized.width) // 2
    paste_y = SURFACE_Y - source_surface
    output.alpha_composite(resized, (paste_x, paste_y))
    return output, {
        "source": source.relative_to(ROOT).as_posix(),
        "size": [target_width, DISPLAY_HEIGHT],
        "scale": scale,
        "runtimeSurfaceY": first_opaque_surface(output),
    }


def main() -> None:
    output_dir = PLATFORM_ROOT / "normalized"
    output_dir.mkdir(parents=True, exist_ok=True)
    images = {}
    metadata = {}
    for name, (source, width) in PIECES.items():
        image, info = normalize_piece(source, width)
        path = output_dir / f"{name}.png"
        image.save(path, optimize=True)
        images[name] = image
        metadata[name] = {"runtime": path.relative_to(ROOT).as_posix(), **info}

    spec = {
        "version": 1,
        "displayHeight": DISPLAY_HEIGHT,
        "capWidth": 120,
        "middleWidth": 200,
        "jointOverlap": 10,
        "surfaceY": SURFACE_Y,
        "pieceDefinitions": metadata,
        "acceptedSourceFrames": [1, 2, 3],
        "rejectedSourceFrames": [{"frame": 4, "reason": "edge_touch"}],
    }
    (PLATFORM_ROOT / "module-spec.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    order = ["cap_left", "middle", "middle", "cap_right"]
    width = sum(images[name].width for name in order) - spec["jointOverlap"] * (len(order) - 1)
    preview = Image.new("RGBA", (width + 48, DISPLAY_HEIGHT + 72), (4, 12, 30, 255))
    cursor = 24
    for name in order:
        preview.alpha_composite(images[name], (cursor, 24))
        cursor += images[name].width - spec["jointOverlap"]
    line_y = 24 + SURFACE_Y
    for x in range(16, preview.width - 16):
        preview.putpixel((x, line_y), (67, 255, 147, 255))
    preview.save(PLATFORM_ROOT / "assembly-contact-preview.png", optimize=True)
    print(f"Prepared {len(images)} platform pieces at surface y={SURFACE_Y}")


if __name__ == "__main__":
    main()
