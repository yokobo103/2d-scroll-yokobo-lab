"""Validate stage image dimensions, alpha assets, JSON, and accepted sprite QC."""

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANVAS = (1536, 864)

for path in (ROOT / "data").glob("*.json"):
    json.loads(path.read_text(encoding="utf-8"))

canvas_images = [
    "assets/stage01_normal_lab/runtime/parallax/sky.webp",
    "assets/stage01_normal_lab/runtime/parallax/far.webp",
    "assets/stage01_normal_lab/runtime/parallax/mid.webp",
    "assets/stage01_normal_lab/runtime/parallax/near.webp",
    "assets/stage01_normal_lab/references/stage-reference.webp",
    "assets/stage01_normal_lab/preview/parallax-preview.webp",
]
for relative in canvas_images:
    image = Image.open(ROOT / relative)
    assert image.size == CANVAS, f"{relative}: expected {CANVAS}, got {image.size}"

alpha_images = [
    "assets/stage01_normal_lab/runtime/platforms/modular/cap_left.webp",
    "assets/stage01_normal_lab/runtime/platforms/modular/mid_a.webp",
    "assets/stage01_normal_lab/runtime/platforms/modular/mid_b.webp",
    "assets/stage01_normal_lab/runtime/platforms/modular/cap_right.webp",
    "assets/stage01_normal_lab/runtime/platforms/strip/cap_left.webp",
    "assets/stage01_normal_lab/runtime/platforms/strip/middle.webp",
    "assets/stage01_normal_lab/runtime/platforms/strip/cap_right.webp",
    "assets/stage01_normal_lab/runtime/props/energy-spill.webp",
    "assets/stage01_normal_lab/runtime/props/checkpoint.webp",
    "assets/stage01_normal_lab/runtime/props/exit-gate.webp",
]
for relative in alpha_images:
    image = Image.open(ROOT / relative).convert("RGBA")
    assert image.getchannel("A").getextrema()[0] < 255, f"{relative}: no transparent pixels"

accepted_meta = [
    "assets/stage01_normal_lab/platforms/processed/pipeline-meta.json",
    "assets/stage01_normal_lab/props/decor-pack/pipeline-meta.json",
    "assets/stage01_normal_lab/props/energy-vent/pipeline-meta.json",
    "assets/stage01_normal_lab/props/energy-spill/pipeline-meta.json",
    "assets/stage01_normal_lab/props/checkpoint/pipeline-meta.json",
    "assets/stage01_normal_lab/props/exit-gate/pipeline-meta.json",
]
for relative in accepted_meta:
    metadata = json.loads((ROOT / relative).read_text(encoding="utf-8"))
    assert not metadata["edge_touch_frames"], f"{relative}: edge touch {metadata['edge_touch_frames']}"

contract_path = ROOT / "assets/stage01_normal_lab/visual-contract.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
assert contract["stageCanvas"] == {"width": 1536, "height": 864}
assert contract["gameplayGeometryChanged"] is False

for family_name, family in contract["platformFamilies"].items():
    names = family["pieces"].keys()
    for name in names:
        path = ROOT / f"assets/stage01_normal_lab/runtime/platforms/{family_name}/{name}.webp"
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        tops = []
        for x in range(int(image.width * .12), int(image.width * .88)):
            for y in range(min(24, image.height)):
                if alpha.getpixel((x, y)) >= 128:
                    tops.append(y)
                    break
        assert tops and sorted(tops)[len(tops) // 2] == family["surfaceY"], path

runtime_bytes = sum(path.stat().st_size for path in (ROOT / "assets/stage01_normal_lab/runtime").rglob("*.webp"))
assert runtime_bytes < 3 * 1024 * 1024, f"runtime visual pack too large: {runtime_bytes} bytes"

print(
    f"Validated {len(canvas_images)} canvas images, {len(alpha_images)} alpha assets, "
    f"{len(accepted_meta)} accepted sprite runs, exact platform surfaces, and "
    f"{runtime_bytes / 1024:.1f} KiB of runtime WebP assets"
)
