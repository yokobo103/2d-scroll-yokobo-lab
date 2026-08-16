"""Trim transparent padding from generated one-shot runtime objects."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    ROOT / "assets/objects/platform/processed/platform-1.png": ROOT / "assets/objects/platform/runtime.png",
    ROOT / "assets/objects/energy_spill/processed/hazard-1.png": ROOT / "assets/objects/energy_spill/runtime.png",
    ROOT / "assets/objects/checkpoint/processed/checkpoint-1.png": ROOT / "assets/objects/checkpoint/runtime.png",
    ROOT / "assets/objects/exit_gate/processed/gate-1.png": ROOT / "assets/objects/exit_gate/runtime.png",
}

for source, destination in ASSETS.items():
    image = Image.open(source).convert("RGBA")
    box = image.getchannel("A").getbbox()
    if not box:
        raise RuntimeError(f"No visible pixels in {source}")
    left, top, right, bottom = box
    margin = 4
    box = (max(0, left - margin), max(0, top - margin), min(image.width, right + margin), min(image.height, bottom + margin))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.crop(box).save(destination)
    print(f"{destination.relative_to(ROOT)} {image.crop(box).size}")
