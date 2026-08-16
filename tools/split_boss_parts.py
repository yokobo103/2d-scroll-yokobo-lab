"""Split the socket-joint Nyabi Drone Core while preserving source coordinates."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


SOURCE_SIZE = (1536, 1024)
RIGHT_BALL = (1042, 500)
LEFT_BALL = (SOURCE_SIZE[0] - RIGHT_BALL[0], RIGHT_BALL[1])
BALL_RADIUS = 76
SOCKET_RADIUS = 111
MUZZLE_RIGHT = (1483, 568)
SECOND_JOINT_RIGHT = (1138, 536)
SECOND_JOINT_RADIUS = 58
CANNON_HALF_WIDTH = 78
ANCHORS = {
    "bodyTopOpaque": {"y": 134},
    "weakPoint": {"x": 666, "y": 134, "w": 204, "h": 115},
    "elbowLeft": {"x": LEFT_BALL[0], "y": LEFT_BALL[1]},
    "elbowRight": {"x": RIGHT_BALL[0], "y": RIGHT_BALL[1]},
    "muzzleFromElbow": {
        "dx": MUZZLE_RIGHT[0] - RIGHT_BALL[0],
        "dy": MUZZLE_RIGHT[1] - RIGHT_BALL[1],
    },
    "forearmAngleLimit": {"min": -60, "max": 60},
    "ballRadius": BALL_RADIUS,
    "socketRadius": SOCKET_RADIUS,
}


def circle(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int, fill: int) -> None:
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def arm_capsule_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    circle(draw, RIGHT_BALL, BALL_RADIUS, 255)
    draw.line((RIGHT_BALL, SECOND_JOINT_RIGHT), fill=255, width=64)
    circle(draw, SECOND_JOINT_RIGHT, SECOND_JOINT_RADIUS, 255)
    draw.line((SECOND_JOINT_RIGHT, MUZZLE_RIGHT), fill=255, width=CANNON_HALF_WIDTH * 2)
    circle(draw, MUZZLE_RIGHT, CANNON_HALF_WIDTH, 255)
    return mask


def socket_annulus_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for center in (LEFT_BALL, RIGHT_BALL):
        circle(draw, center, SOCKET_RADIUS, 255)
        circle(draw, center, BALL_RADIUS + 5, 0)
    return mask


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--pipeline-meta", type=Path, required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    if source.size != SOURCE_SIZE:
        raise ValueError(f"expected source size {SOURCE_SIZE}, got {source.size}")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    source_alpha = source.getchannel("A")
    right_forearm_mask = ImageChops.multiply(source_alpha, arm_capsule_mask(source.size))
    forearm = Image.new("RGBA", source.size)
    forearm.paste(source, mask=right_forearm_mask)

    left_forearm_mask = right_forearm_mask.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    moving_mask = ImageChops.lighter(right_forearm_mask, left_forearm_mask)
    body = source.copy()
    body.putalpha(ImageChops.subtract(source_alpha, moving_mask))

    # Restore only the fixed socket rims after removing the rotating balls/arms.
    # This keeps the receiving cups attached to the torso at every arm angle.
    annulus = ImageChops.multiply(source_alpha, socket_annulus_mask(source.size))
    body.alpha_composite(Image.composite(source, Image.new("RGBA", source.size), annulus))

    body.save(args.output_dir / "body.png")
    forearm.save(args.output_dir / "forearm-right.png")

    meta = json.loads(args.pipeline_meta.read_text(encoding="utf-8"))
    meta.update({
        "assetType": "creature",
        "bundle": "single_asset",
        "cameraView": "orthographic-side",
        "mount": "air",
        "depthRole": "gameplay",
        "semanticRole": "actor",
        "gameplaySignal": "damage",
        "anchor": "center",
        "sourceCanvas": {"w": source.width, "h": source.height},
        "sourceOpaqueBounds": list(source_alpha.getbbox() or ()),
        "partsPreserveSourceCanvas": True,
        "splitMethod": "measured-ball-and-arm-capsule-mask",
        "jointMeasurement": {
            "rightBallCenter": list(RIGHT_BALL),
            "leftBallCenter": list(LEFT_BALL),
            "ballRadius": BALL_RADIUS,
            "socketRadius": SOCKET_RADIUS,
            "muzzleCenter": list(MUZZLE_RIGHT),
            "secondJointCenter": list(SECOND_JOINT_RIGHT),
            "secondJointRadius": SECOND_JOINT_RADIUS,
        },
        "anchors": ANCHORS,
    })
    (args.output_dir / "pipeline-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
