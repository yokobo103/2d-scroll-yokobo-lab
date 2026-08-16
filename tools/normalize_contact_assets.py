"""Normalize generated character/platform art to a shared runtime contact contract."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PLAYER_SOURCE_SPEC_PATH = ROOT / "assets/sprites/dr_yokobo/contact-source-spec.json"
PLAYER_SOURCE_SPEC = json.loads(PLAYER_SOURCE_SPEC_PATH.read_text(encoding="utf-8"))
ALPHA_THRESHOLD = PLAYER_SOURCE_SPEC["alphaThreshold"]
PLAYER_CANVAS = tuple(PLAYER_SOURCE_SPEC["canvasSize"])
PLAYER_FOOT_BASELINE = PLAYER_SOURCE_SPEC["footBaseline"]
PLATFORM_SURFACE_Y = 6


def opaque_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("Asset has no opaque pixels at the contact threshold")
    return bbox


def platform_surface_y(image: Image.Image) -> int:
    """Measure the continuous top rail, ignoring isolated cap/clamp pixels."""
    alpha = image.getchannel("A")
    left = int(image.width * 0.12)
    right = int(image.width * 0.88)
    column_tops = []
    for x in range(left, right):
        for y in range(min(24, image.height)):
            if alpha.getpixel((x, y)) >= ALPHA_THRESHOLD:
                column_tops.append(y)
                break
    if not column_tops:
        raise RuntimeError("Platform has no measurable top rail")
    column_tops.sort()
    return column_tops[len(column_tops) // 2]


def shifted_canvas(image: Image.Image, size: tuple[int, int], shift_y: int) -> Image.Image:
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output.alpha_composite(image, (0, shift_y))
    return output


def normalize_player() -> dict:
    runtime_root = ROOT / "assets/sprites/dr_yokobo/runtime"
    action_meta = {}
    for action, action_source in PLAYER_SOURCE_SPEC["actions"].items():
        source_dir = ROOT / action_source["sourceDir"]
        output_dir = runtime_root / action
        output_dir.mkdir(parents=True, exist_ok=True)
        frames = []
        runtime_images = []
        for source_path in sorted(source_dir.glob(action_source["framePattern"])):
            image = Image.open(source_path).convert("RGBA")
            if image.size != PLAYER_CANVAS:
                raise RuntimeError(f"Unexpected player canvas {image.size}: {source_path}")
            source_baseline = opaque_bbox(image)[3]
            shift_y = PLAYER_FOOT_BASELINE - source_baseline
            normalized = shifted_canvas(image, PLAYER_CANVAS, shift_y)
            output_path = output_dir / source_path.name
            normalized.save(output_path, optimize=True)
            runtime_images.append(normalized)
            frames.append({
                "source": source_path.relative_to(ROOT).as_posix(),
                "runtime": output_path.relative_to(ROOT).as_posix(),
                "sourceFootBaseline": source_baseline,
                "shiftY": shift_y,
                "runtimeFootBaseline": opaque_bbox(normalized)[3],
            })

        sheet = Image.new("RGBA", (PLAYER_CANVAS[0] * 2, PLAYER_CANVAS[1] * 2), (0, 0, 0, 0))
        for index, image in enumerate(runtime_images):
            sheet.alpha_composite(image, ((index % 2) * PLAYER_CANVAS[0], (index // 2) * PLAYER_CANVAS[1]))
        sheet.save(output_dir / "sheet-transparent.png", optimize=True)
        runtime_images[0].save(
            output_dir / "animation.gif",
            save_all=True,
            append_images=runtime_images[1:],
            duration=action_source["durationMs"],
            loop=0,
            disposal=2,
            transparency=0,
        )
        action_meta[action] = {"frames": frames}

    contract = {
        "version": 1,
        "alphaThreshold": ALPHA_THRESHOLD,
        "canvasSize": list(PLAYER_CANVAS),
        "centerX": PLAYER_CANVAS[0] // 2,
        "footBaseline": PLAYER_FOOT_BASELINE,
        "baselineConvention": "exclusive opaque-pixel boundary",
        "sourceSpec": PLAYER_SOURCE_SPEC_PATH.relative_to(ROOT).as_posix(),
        "actions": action_meta,
    }
    (runtime_root / "contact-spec.json").write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return contract


def normalize_platform() -> dict:
    modular_root = ROOT / "assets/objects/platform_modular"
    spec_path = modular_root / "module-spec.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    output_dir = modular_root / "normalized"
    output_dir.mkdir(parents=True, exist_ok=True)
    pieces = {}
    normalized_images = {}
    for name, definition in spec["pieceDefinitions"].items():
        width = definition.get("width", spec[definition["widthKey"]])
        height = definition.get("height", spec["displayHeight"])
        size = (width, height)
        source_path = ROOT / definition["source"]
        image = Image.open(source_path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        source_surface = platform_surface_y(image)
        shift_y = PLATFORM_SURFACE_Y - source_surface
        normalized = shifted_canvas(image, size, shift_y)
        output_path = output_dir / f"{name}.png"
        normalized.save(output_path, optimize=True)
        normalized_images[name] = normalized
        pieces[name] = {
            "runtime": output_path.relative_to(ROOT).as_posix(),
            "size": list(size),
            "sourceSurfaceYAfterResize": source_surface,
            "shiftY": shift_y,
            "runtimeSurfaceY": platform_surface_y(normalized),
        }

    spec.pop("topY", None)
    spec.pop("collisionInsetTop", None)
    spec["surfaceY"] = PLATFORM_SURFACE_Y
    spec["alphaThreshold"] = ALPHA_THRESHOLD
    spec["surfaceConvention"] = "median first-opaque row across central 76%; data platform.y is the world contact line"
    spec["normalizedPieces"] = pieces
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    preview_pieces = ["cap_left", "mid_a", "mid_b", "cap_right"]
    preview_width = (
        spec["capWidth"] * 2 + spec["middleWidth"] * 2
        - spec["jointOverlap"] * (len(preview_pieces) - 1)
    )
    preview = Image.new("RGBA", (preview_width + 48, spec["displayHeight"] + 72), (4, 12, 30, 255))
    cursor = 24
    asset_y = 24
    for name in preview_pieces:
        preview.alpha_composite(normalized_images[name], (cursor, asset_y))
        cursor += normalized_images[name].width - spec["jointOverlap"]
    line_y = asset_y + PLATFORM_SURFACE_Y
    for x in range(16, preview.width - 16):
        preview.putpixel((x, line_y), (67, 255, 147, 255))
    preview.save(output_dir / "assembly-contact-preview.png", optimize=True)
    return spec


def main() -> None:
    player = normalize_player()
    platform = normalize_platform()
    print(f"Player actions normalized to foot baseline y={player['footBaseline']}")
    print(f"Platform pieces normalized to surface y={platform['surfaceY']}")


if __name__ == "__main__":
    main()
