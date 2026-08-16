"""Export generate2dsprite crystal frames as lightweight runtime WebP files."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "assets/stage01_normal_lab/runtime/crystal"

GROUPS = {
    "nozzle": (ROOT / "assets/objects/crystal_floor_nozzle/processed", "nozzle", 4),
    "remote-switch": (ROOT / "assets/objects/crystal_remote_switch/processed", "remote-switch", 4),
    "horizontal": (ROOT / "assets/objects/crystal_growth_horizontal_segments/processed", "horizontal", 4),
    "vertical": (ROOT / "assets/objects/crystal_growth_vertical_segments/processed", "vertical", 4),
    "decay": (ROOT / "assets/objects/crystal_decay_fx/processed", "decay", 4),
    "hazard": (ROOT / "assets/objects/crystal_hazard_modules/processed", "hazard", 5),
    "cluster-h": (ROOT / "assets/objects/crystal_growth_platform_reference/processed", "platform-crystal", 5),
    "inverted-core-platform": (ROOT / "assets/objects/crystal_inverted_core_platform/processed", "inverted-core-platform", 1),
    "inverted-core-growth": (ROOT / "assets/objects/crystal_inverted_core_platform/growth/processed", "crystal-growth", 6),
    "inverted-core-collapse": (ROOT / "assets/objects/crystal_inverted_core_platform/collapse/processed", "crystal-collapse", 6),
    "cluster-v": (ROOT / "assets/objects/crystal_growth_vein_vertical/processed", "vein-v", 5),
    "hazard-massive": (ROOT / "assets/objects/crystal_hazard_massive_modules/processed", "hazard-massive", 5),
}


def export_frame(group: str, source: Path, index: int) -> dict[str, object]:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{source}: no opaque sprite pixels")
    output = RUNTIME_DIR / f"{group}-{index}.webp"
    image.save(output, "WEBP", lossless=True, method=6)
    return {
        "source": source.relative_to(ROOT).as_posix(),
        "runtime": output.relative_to(ROOT).as_posix(),
        "size": list(image.size),
        "alphaBounds": list(bbox),
    }


def main() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    metadata: dict[str, list[dict[str, object]]] = {}
    for group, (directory, prefix, count) in GROUPS.items():
        metadata[group] = [
            export_frame(group, directory / f"{prefix}-{index}.png", index)
            for index in range(1, count + 1)
        ]
    meta_path = ROOT / "assets/objects/crystal-runtime-meta.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
