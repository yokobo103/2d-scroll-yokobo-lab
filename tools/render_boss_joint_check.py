"""Render the boss shoulder at five fixed angles for seam inspection."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


ANGLES = (-60, -30, 0, 30, 60)
ZOOM = 4
JOINT_CROP_RADIUS = 132
LABEL_HEIGHT = 34


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    body = Image.open(args.runtime_dir / "body.png").convert("RGBA")
    arm = Image.open(args.runtime_dir / "forearm-right.png").convert("RGBA")
    meta = json.loads((args.runtime_dir / "pipeline-meta.json").read_text(encoding="utf-8"))
    pivot_data = meta["anchors"]["elbowRight"]
    pivot = (pivot_data["x"], pivot_data["y"])
    crop_box = (
        pivot[0] - JOINT_CROP_RADIUS, pivot[1] - JOINT_CROP_RADIUS,
        pivot[0] + JOINT_CROP_RADIUS, pivot[1] + JOINT_CROP_RADIUS,
    )
    panels = []
    for angle in ANGLES:
        rotated = arm.rotate(-angle, resample=Image.Resampling.BICUBIC, center=pivot)
        composite = Image.alpha_composite(body, rotated)
        crop = composite.crop(crop_box).resize(
            (JOINT_CROP_RADIUS * 2 * ZOOM, JOINT_CROP_RADIUS * 2 * ZOOM),
            Image.Resampling.NEAREST,
        )
        panel = Image.new("RGBA", (crop.width, crop.height + LABEL_HEIGHT), (17, 24, 35, 255))
        panel.alpha_composite(crop, (0, LABEL_HEIGHT))
        draw = ImageDraw.Draw(panel)
        draw.text((12, 9), f"{angle:+d} deg", fill=(231, 248, 255, 255))
        panels.append(panel)

    sheet = Image.new("RGBA", (sum(panel.width for panel in panels), panels[0].height), (17, 24, 35, 255))
    cursor = 0
    for panel in panels:
        sheet.alpha_composite(panel, (cursor, 0))
        cursor += panel.width
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)


if __name__ == "__main__":
    main()
