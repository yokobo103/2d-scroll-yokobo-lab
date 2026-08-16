"""Compose the PC opening viewport from runtime layers and modular objects for QA."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
with (ROOT / "data/crystal-lab-objects.json").open(encoding="utf-8") as handle:
    stage = json.load(handle)
with (ROOT / "assets/objects/platform_modular/module-spec.json").open(encoding="utf-8") as handle:
    spec = json.load(handle)
with (ROOT / "data/prefab-registry.json").open(encoding="utf-8") as handle:
    registry = json.load(handle)
with (ROOT / "data/crystal-lab-scene-hooks.json").open(encoding="utf-8") as handle:
    hooks = json.load(handle)

preview = Image.open(ROOT / "assets/map/crystal-lab-background-preview.png").convert("RGBA")
pieces = {
    "cap_left": Image.open(ROOT / "assets/objects/platform_modular/normalized/cap_left.png").convert("RGBA"),
    "cap_right": Image.open(ROOT / "assets/objects/platform_modular/normalized/cap_right.png").convert("RGBA"),
    "A": Image.open(ROOT / "assets/objects/platform_modular/normalized/mid_a.png").convert("RGBA"),
    "B": Image.open(ROOT / "assets/objects/platform_modular/normalized/mid_b.png").convert("RGBA"),
}
strip_pieces = {
    "cap_left": Image.open(ROOT / "assets/objects/lab_platform_strip/normalized/cap_left.png").convert("RGBA"),
    "cap_right": Image.open(ROOT / "assets/objects/lab_platform_strip/normalized/cap_right.png").convert("RGBA"),
    "A": Image.open(ROOT / "assets/objects/lab_platform_strip/normalized/middle.png").convert("RGBA"),
    "B": Image.open(ROOT / "assets/objects/lab_platform_strip/normalized/middle.png").convert("RGBA"),
}
pickup = Image.open(ROOT / "assets/objects/data_crystal/processed/pickup-1.png").convert("RGBA")


def paste_scaled(source: Image.Image, box: tuple[int, int, int, int]) -> None:
    x, y, width, height = box
    scaled = source.resize((max(1, width), max(1, height)), Image.Resampling.LANCZOS)
    preview.alpha_composite(scaled, (x, y))


def platform_width(item: dict, layout: dict) -> int:
    return (
        layout["capWidth"] * 2
        + layout["middleWidth"] * item["modules"]
        - layout["jointOverlap"] * (item["modules"] + 1)
    )


for item in stage["platforms"]:
    prefab = registry["prefabs"][item["prefab"]]
    layout = prefab.get("layout", spec)
    active_pieces = strip_pieces if prefab.get("visualSet") == "lab-strip" else pieces
    width = platform_width(item, layout)
    if item["x"] >= preview.width or item["x"] + width <= 0:
        continue
    cursor = item["x"]
    asset_y = item["y"] - layout["surfaceY"]
    paste_scaled(active_pieces["cap_left"], (cursor, asset_y, layout["capWidth"], layout["displayHeight"]))
    cursor += layout["capWidth"] - layout["jointOverlap"]
    for index in range(item["modules"]):
        key = item["pattern"][index % len(item["pattern"])]
        paste_scaled(active_pieces[key], (cursor, asset_y, layout["middleWidth"], layout["displayHeight"]))
        cursor += layout["middleWidth"] - layout["jointOverlap"]
    paste_scaled(active_pieces["cap_right"], (cursor, asset_y, layout["capWidth"], layout["displayHeight"]))

for item in stage["pickups"]:
    if 0 <= item["x"] < preview.width:
        size = 94 if item.get("reward") else 84
        paste_scaled(pickup, (item["x"] - size // 2, item["y"] - size // 2, size, size))

runtime_objects = {
    "hazard": ROOT / "assets/objects/energy_spill/runtime.png",
    "checkpoint": ROOT / "assets/objects/checkpoint/runtime.png",
    "exit": ROOT / "assets/objects/exit_gate/runtime.png",
}
prefab_objects = {
    "energy-vent-v1": ROOT / "assets/objects/energy_vent/processed/energy-vent-3.png",
    "lab-warning-lamp-v1": ROOT / "assets/objects/lab_decor_pack/processed/lab-decor-1.png",
    "lab-bottle-rack-v1": ROOT / "assets/objects/lab_decor_pack/processed/lab-decor-2.png",
    "lab-wall-panel-v1": ROOT / "assets/objects/lab_decor_pack/processed/lab-decor-3.png",
    "lab-cable-coil-v1": ROOT / "assets/objects/lab_decor_pack/processed/lab-decor-4.png",
}
for item in stage["objects"]:
    if item["x"] >= preview.width or item["x"] + item["w"] <= 0:
        continue
    source_path = prefab_objects.get(item["prefab"], runtime_objects.get(item["type"]))
    if source_path is None:
        continue
    source = Image.open(source_path).convert("RGBA")
    paste_scaled(source, (item["x"], item["y"], item["w"], item["h"]))

enemy_assets = {
    "slime-robot-v1": ROOT / "assets/sprites/slime_robot/patrol/processed/patrol-1.png",
    "nyabi-clean-v1": ROOT / "assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-1.png",
    "neji-nyabi-v1": ROOT / "assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-1.png",
    "nyabi-drone-v1": ROOT / "assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-1.png",
}
for actor in hooks.get("actorSpawnMarkers", []):
    if actor["x"] >= preview.width or actor["x"] + actor["w"] <= 0:
        continue
    source_path = enemy_assets.get(actor.get("prefab"))
    if source_path is None:
        continue
    enemy_image = Image.open(source_path).convert("RGBA")
    render = registry["prefabs"][actor["prefab"]].get("render", {})
    draw_size = render.get("drawSize", 172)
    baseline = render.get("baseline", 0.9125)
    draw_x = round(actor["x"] + actor["w"] / 2 - draw_size / 2)
    draw_y = round(actor["y"] + actor["h"] - draw_size * baseline)
    paste_scaled(enemy_image, (draw_x, draw_y, draw_size, draw_size))

output = ROOT / "assets/map/crystal-lab-stage-preview.png"
preview.convert("RGB").save(output, quality=95)
print(f"Wrote {output.relative_to(ROOT)} {preview.size}")
