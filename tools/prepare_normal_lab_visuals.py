"""Normalize generated Stage 01 art without changing gameplay geometry."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets" / "stage01_normal_lab"
RAW = ART / "parallax" / "raw"
RUNTIME = ART / "runtime"
CANVAS = (1536, 864)
ALPHA_THRESHOLD = 128


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    ratio = max(size[0] / image.width, size[1] / image.height)
    scaled = image.resize(
        (round(image.width * ratio), round(image.height * ratio)),
        Image.Resampling.LANCZOS,
    )
    left = (scaled.width - size[0]) // 2
    top = (scaled.height - size[1]) // 2
    return scaled.crop((left, top, left + size[0], top + size[1]))


def alpha_bbox(image: Image.Image, margin: int = 6) -> tuple[int, int, int, int]:
    box = image.getchannel("A").point(
        lambda value: 255 if value >= ALPHA_THRESHOLD else 0
    ).getbbox()
    if not box:
        raise RuntimeError("Generated asset contains no visible pixels")
    left, top, right, bottom = box
    return (
        max(0, left - margin),
        max(0, top - margin),
        min(image.width, right + margin),
        min(image.height, bottom + margin),
    )


def save_webp(image: Image.Image, path: Path, *, lossless: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if lossless:
        image.save(path, "WEBP", lossless=True, method=6)
    else:
        image.save(path, "WEBP", quality=82, method=6)


def normalize_parallax() -> dict:
    layers = {
        "sky": RAW / "sky.png",
        "far": RAW / "far-alpha.png",
        "mid": RAW / "mid-alpha.png",
        "near": RAW / "near-alpha.png",
    }
    normalized = {}
    for name, source in layers.items():
        image = cover(Image.open(source).convert("RGBA"), CANVAS)
        if name != "sky":
            image = recolor_purple_to_cyan(image)
        output = RUNTIME / "parallax" / f"{name}.webp"
        save_webp(image, output, lossless=name != "sky")
        normalized[name] = image

    preview = normalized["sky"].copy()
    for name in ("far", "mid", "near"):
        preview.alpha_composite(normalized[name])
    save_webp(preview, ART / "preview" / "parallax-preview.webp", lossless=False)

    reference = cover(
        Image.open(ART / "references" / "stage-reference-raw.png").convert("RGBA"),
        CANVAS,
    )
    save_webp(reference, ART / "references" / "stage-reference.webp", lossless=False)
    return {
        name: {
            "src": f"/assets/stage01_normal_lab/runtime/parallax/{name}.webp",
            "sourceSize": list(CANVAS),
            "displaySize": list(CANVAS),
            "anchor": "top-left",
            "repeatX": True,
        }
        for name in layers
    }


def first_surface(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    tops = []
    for x in range(int(image.width * 0.12), int(image.width * 0.88)):
        for y in range(image.height):
            if alpha.getpixel((x, y)) >= ALPHA_THRESHOLD:
                tops.append(y)
                break
    if not tops:
        raise RuntimeError("Platform has no measurable surface")
    tops.sort()
    return tops[len(tops) // 2]


def platform_piece(source: Path, width: int, height: int, surface_y: int) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    image = image.crop(alpha_bbox(image, margin=2))
    scale = min((width - 2) / image.width, (height - surface_y - 2) / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    output.alpha_composite(
        resized,
        ((width - resized.width) // 2, surface_y - first_surface(resized)),
    )
    measured = first_surface(output)
    if measured != surface_y:
        raise RuntimeError(f"Platform surface mismatch: {measured} != {surface_y}")
    return output


def normalize_platforms() -> dict:
    processed = ART / "platforms" / "processed"
    families = {
        "modular": {
            "displayHeight": 136,
            "capWidth": 92,
            "middleWidth": 216,
            "jointOverlap": 12,
            "surfaceY": 6,
            "pieces": {
                "cap_left": ("platform-1.png", 92),
                "mid_a": ("platform-2.png", 216),
                "cap_right": ("platform-3.png", 92),
                "mid_b": ("platform-4.png", 216),
            },
        },
        "strip": {
            "displayHeight": 150,
            "capWidth": 120,
            "middleWidth": 200,
            "jointOverlap": 10,
            "surfaceY": 6,
            "pieces": {
                "cap_left": ("platform-1.png", 120),
                "middle": ("platform-2.png", 200),
                "cap_right": ("platform-3.png", 120),
            },
        },
    }
    for family, spec in families.items():
        for name, (filename, width) in spec["pieces"].items():
            image = platform_piece(
                processed / filename,
                width,
                spec["displayHeight"],
                spec["surfaceY"],
            )
            save_webp(image, RUNTIME / "platforms" / family / f"{name}.webp")
    modular_spec = {
        "version": 1,
        "displayHeight": families["modular"]["displayHeight"],
        "capWidth": families["modular"]["capWidth"],
        "middleWidth": families["modular"]["middleWidth"],
        "jointOverlap": families["modular"]["jointOverlap"],
        "surfaceY": families["modular"]["surfaceY"],
        "visualOnly": True,
    }
    (RUNTIME / "platforms" / "modular" / "module-spec.json").write_text(
        json.dumps(modular_spec, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return families


def recolor_purple_to_cyan(image: Image.Image) -> Image.Image:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if (
                alpha >= 64
                and blue > 170
                and red > 70
                and blue > red * 1.2
                and blue > green * 1.25
                and red > green * 0.8
            ):
                pixels[x, y] = (min(red, 80), max(green, 190), max(blue, 230), alpha)
    return image


def crop_shared(images: list[Image.Image], margin: int = 8) -> list[Image.Image]:
    boxes = [alpha_bbox(image, margin=0) for image in images]
    left = max(0, min(box[0] for box in boxes) - margin)
    top = max(0, min(box[1] for box in boxes) - margin)
    right = min(images[0].width, max(box[2] for box in boxes) + margin)
    bottom = min(images[0].height, max(box[3] for box in boxes) + margin)
    return [image.crop((left, top, right, bottom)) for image in images]


def normalize_props() -> dict:
    props_root = RUNTIME / "props"
    decor_sources = [
        ART / "props" / "decor-pack" / f"decor-{index}.png" for index in range(1, 5)
    ]
    for index, source in enumerate(decor_sources, start=1):
        image = Image.open(source).convert("RGBA")
        save_webp(image.crop(alpha_bbox(image)), props_root / f"decor-{index}.webp")

    vent_images = [
        Image.open(
            ROOT / "assets" / "objects" / "energy_vent" / "processed" / f"energy-vent-{index}.png"
        ).convert("RGBA")
        for index in range(1, 5)
    ]
    for index, image in enumerate(crop_shared(vent_images), start=1):
        save_webp(image, props_root / f"vent-{index}.webp")

    interaction_sets = {
        "lab-switch": ROOT / "assets" / "objects" / "lab_switch" / "processed",
        "lab-lift": ROOT / "assets" / "objects" / "lab_lift" / "processed",
    }
    interaction_names = {
        "lab-switch": ("off", "on"),
        "lab-lift": ("idle", "active"),
    }
    for prefix, source_dir in interaction_sets.items():
        frames = [
            Image.open(source_dir / f"{prefix}-{index}.png").convert("RGBA")
            for index in range(1, 3)
        ]
        for state, image in zip(interaction_names[prefix], crop_shared(frames), strict=True):
            save_webp(image, props_root / f"{prefix}-{state}.webp")

    info_frames = [
        Image.open(
            ROOT / "assets" / "objects" / "lab_info_panels" / "processed" / f"lab-info-panel-{index}.png"
        ).convert("RGBA")
        for index in range(1, 4)
    ]
    for state, image in zip(("guide", "caution", "tutorial"), crop_shared(info_frames), strict=True):
        save_webp(image, props_root / f"lab-info-{state}.webp")

    singles = {
        "energy-spill.webp": ROOT / "assets" / "objects" / "energy_spill" / "processed" / "hazard-1.png",
        "checkpoint.webp": ART / "props" / "checkpoint" / "checkpoint-1.png",
        "exit-gate.webp": ART / "props" / "exit-gate" / "gate-1.png",
    }
    for name, source in singles.items():
        image = Image.open(source).convert("RGBA")
        save_webp(image.crop(alpha_bbox(image)), props_root / name)

    return {
        # Legacy catch-all decor remains available only for migration. Keeping
        # it out of the runtime contract prevents ambiguous foreground use.
        "decor": [],
        "vent": [f"/assets/stage01_normal_lab/runtime/props/vent-{i}.webp" for i in range(1, 5)],
        "energySpill": "/assets/stage01_normal_lab/runtime/props/energy-spill.webp",
        "checkpoint": "/assets/stage01_normal_lab/runtime/props/checkpoint.webp",
        "exitGate": "/assets/stage01_normal_lab/runtime/props/exit-gate.webp",
        "labSwitch": [
            "/assets/stage01_normal_lab/runtime/props/lab-switch-off.webp",
            "/assets/stage01_normal_lab/runtime/props/lab-switch-on.webp",
        ],
        "labLift": [
            "/assets/stage01_normal_lab/runtime/props/lab-lift-idle.webp",
            "/assets/stage01_normal_lab/runtime/props/lab-lift-active.webp",
        ],
        "labInfoPanels": [
            "/assets/stage01_normal_lab/runtime/props/lab-info-guide.webp",
            "/assets/stage01_normal_lab/runtime/props/lab-info-caution.webp",
            "/assets/stage01_normal_lab/runtime/props/lab-info-tutorial.webp",
        ],
    }


def main() -> None:
    parallax = normalize_parallax()
    parallax["sky"]["scrollFactor"] = 0.02
    parallax["far"]["scrollFactor"] = 0.08
    parallax["mid"]["scrollFactor"] = 0.16
    parallax["near"]["scrollFactor"] = 0.27
    for order, name in enumerate(("sky", "far", "mid", "near")):
        parallax[name]["renderOrder"] = order

    contract = {
        "version": 1,
        "stageId": "crystal-lab-stage-01",
        "visualTheme": "stage01-normal-lab",
        "stageCanvas": {"width": CANVAS[0], "height": CANVAS[1]},
        "parallax": parallax,
        "platformFamilies": normalize_platforms(),
        "props": normalize_props(),
        "gameplayGeometryChanged": False,
    }
    (ART / "visual-contract.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Prepared Normal Lab visual pack at {CANVAS[0]}x{CANVAS[1]}")


if __name__ == "__main__":
    main()
