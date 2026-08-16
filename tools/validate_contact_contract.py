"""Fail when a runtime sprite violates the shared contact contract."""

import json
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def opaque_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    return alpha.point(lambda value: 255 if value >= threshold else 0).getbbox()


def platform_surface_y(image: Image.Image, threshold: int) -> int | None:
    alpha = image.convert("RGBA").getchannel("A")
    column_tops = []
    for x in range(int(image.width * 0.12), int(image.width * 0.88)):
        for y in range(min(24, image.height)):
            if alpha.getpixel((x, y)) >= threshold:
                column_tops.append(y)
                break
    if not column_tops:
        return None
    column_tops.sort()
    return column_tops[len(column_tops) // 2]


def main() -> int:
    failures = []
    player_path = ROOT / "assets/sprites/dr_yokobo/runtime/contact-spec.json"
    platform_path = ROOT / "assets/objects/platform_modular/module-spec.json"
    player = json.loads(player_path.read_text(encoding="utf-8"))
    platform = json.loads(platform_path.read_text(encoding="utf-8"))

    for action, action_data in player["actions"].items():
        for frame in action_data["frames"]:
            path = ROOT / frame["runtime"]
            image = Image.open(path).convert("RGBA")
            bbox = opaque_bbox(image, player["alphaThreshold"])
            if image.size != tuple(player["canvasSize"]):
                failures.append(f"{path}: size {image.size} != {tuple(player['canvasSize'])}")
            if not bbox or bbox[3] != player["footBaseline"]:
                failures.append(f"{path}: foot baseline {bbox[3] if bbox else None} != {player['footBaseline']}")
        print(f"PASS player/{action}: {len(action_data['frames'])} frames")

    for name, piece in platform["normalizedPieces"].items():
        path = ROOT / piece["runtime"]
        image = Image.open(path).convert("RGBA")
        surface_y = platform_surface_y(image, platform["alphaThreshold"])
        if image.size != tuple(piece["size"]):
            failures.append(f"{path}: size {image.size} != {tuple(piece['size'])}")
        if surface_y != platform["surfaceY"]:
            failures.append(f"{path}: surface {surface_y} != {platform['surfaceY']}")
        print(f"PASS platform/{name}: surface y={surface_y}")

    if failures:
        print("\nCONTACT CONTRACT FAILED", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("\nCONTACT CONTRACT PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
