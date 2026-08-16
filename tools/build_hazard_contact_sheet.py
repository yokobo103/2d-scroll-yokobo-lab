"""Build prototype-only hazard grammar contact sheets over runtime backdrops."""

from __future__ import annotations

import colorsys
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PROTO = ROOT / "assets/prototypes/hazard-grammar"
SHOTS = ROOT / "screenshots"
VARIANTS = ["base", "out-thin", "out-thick", "area-low", "area-high", "noshadow"]
DISPLAY_NAMES = {
    "base": "BASE / 標準",
    "out-thin": "OUT-THIN / 細輪郭",
    "out-thick": "OUT-THICK / 太輪郭",
    "area-low": "AREA-LOW / 色量・低",
    "area-high": "AREA-HIGH / 色量・高",
    "noshadow": "NOSHADOW / 接地影なし",
    "current-v1": "CURRENT / 現行",
}
VENT_SIZE = (180, 200)
REWARD_SIZE = 94
ALPHA_THRESHOLD = 128


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/meiryob.ttc" if bold else "C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothB.ttc" if bold else "C:/Windows/Fonts/YuGothR.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def metrics(path: Path, floor: str) -> dict[str, float]:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    visible = Image.new("L", image.size)
    visible_pixels = visible.load()
    opaque = danger = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < ALPHA_THRESHOLD:
                continue
            visible_pixels[x, y] = 255
            opaque += 1
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            degrees = hue * 360
            if floor == "1f":
                is_danger = saturation >= 0.35 and value >= 0.35 and (degrees <= 58 or degrees >= 345)
            else:
                is_danger = 178 <= degrees <= 235 and 0.10 <= saturation <= 0.78 and value >= 0.55
            danger += int(is_danger)

    eroded = visible.filter(ImageFilter.MinFilter(3))
    edge = 0
    dark_edge = 0
    eroded_pixels = eroded.load()
    for y in range(image.height):
        for x in range(image.width):
            if not visible_pixels[x, y] or eroded_pixels[x, y]:
                continue
            edge += 1
            red, green, blue, _ = pixels[x, y]
            dark_edge += int(max(red, green, blue) / 255 < 0.30)
    return {
        "dangerAreaRatio": danger / max(1, opaque),
        "darkOutlineRatio": dark_edge / max(1, edge),
    }


def load_sprite(path: Path, size: tuple[int, int]) -> Image.Image:
    return Image.open(path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)


def reward_layer() -> Image.Image:
    layer = Image.new("RGBA", (132, 132))
    draw = ImageDraw.Draw(layer)
    draw.ellipse((9, 9, 123, 123), fill=(255, 221, 100, 22), outline=(255, 222, 111, 235), width=4)
    draw.ellipse((17, 17, 115, 115), outline=(255, 246, 184, 105), width=2)
    crystal_path = ROOT / "assets/objects/data_crystal/processed/pickup-1.png"
    crystal = load_sprite(crystal_path, (REWARD_SIZE, REWARD_SIZE))
    layer.alpha_composite(crystal, ((132 - REWARD_SIZE) // 2, (132 - REWARD_SIZE) // 2))
    return layer


def backdrop_crop(backdrop: Image.Image, size: tuple[int, int], offset: float) -> Image.Image:
    width, height = backdrop.size
    crop_w = min(width, int(height * size[0] / size[1]))
    left = int((width - crop_w) * offset)
    crop = backdrop.crop((left, 0, left + crop_w, height))
    return ImageOps.fit(crop, size, Image.Resampling.LANCZOS, centering=(0.5, 0.58))


def draw_card(
    sheet: Image.Image,
    position: tuple[int, int],
    size: tuple[int, int],
    floor: str,
    variant: str,
    sprite_path: Path,
    backdrop: Image.Image,
    offset: float,
) -> dict[str, float]:
    x, y = position
    width, height = size
    scene_box = (x + 8, y + 54, width - 16, 254)
    draw = ImageDraw.Draw(sheet)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=18, fill=(4, 20, 38, 238), outline=(112, 224, 244, 155), width=2)

    sx, sy, sw, sh = scene_box
    scene = backdrop_crop(backdrop, (sw, sh), offset)
    baseline = sh - 18
    vent_x = 20
    vent_y = baseline - VENT_SIZE[1]
    if variant != "noshadow":
        shadow = Image.new("RGBA", scene.size)
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.ellipse((vent_x + 18, baseline - 17, vent_x + 164, baseline + 7), fill=(3, 11, 25, 125))
        shadow = shadow.filter(ImageFilter.GaussianBlur(7))
        scene = Image.alpha_composite(scene, shadow)
    scene.alpha_composite(load_sprite(sprite_path, VENT_SIZE), (vent_x, vent_y))
    reward = reward_layer()
    scene.alpha_composite(reward, (sw - 138, baseline - 126))
    sheet.alpha_composite(scene, (sx, sy))

    result = metrics(sprite_path, floor)
    metric_y = y + 320
    draw.text(
        (x + 16, metric_y),
        f"危険色面積  {result['dangerAreaRatio'] * 100:5.1f}%",
        font=font(17, True),
        fill=(255, 196, 102, 255) if floor == "1f" else (164, 233, 255, 255),
    )
    draw.text(
        (x + 16, metric_y + 30),
        f"暗色輪郭率  {result['darkOutlineRatio'] * 100:5.1f}%",
        font=font(17),
        fill=(205, 230, 241, 255),
    )
    draw.text((x + 16, metric_y + 60), "描画 180×200 / 報酬 94px", font=font(14), fill=(145, 185, 205, 255))
    # Draw the decision label last so a busy backdrop can never weaken it.
    draw.rounded_rectangle((x + 10, y + 8, x + width - 10, y + 46), radius=9, fill=(3, 17, 33, 230))
    draw.text((x + 16, y + 14), DISPLAY_NAMES[variant], font=font(19, True), fill=(241, 253, 255, 255))
    return result


def build_pc(floor: str, output_name: str, metrics_log: dict[str, dict[str, float]]) -> None:
    width = 1536
    margin = 24
    gap = 16
    header = 100
    cols = 4
    card_w = (width - margin * 2 - gap * (cols - 1)) // cols
    card_h = 410
    height = margin + header + card_h * 2 + gap + margin
    sheet = Image.new("RGBA", (width, height), (3, 13, 28, 255))
    draw = ImageDraw.Draw(sheet)
    title = "1F 通常ラボ — 熱・圧力" if floor == "1f" else "3F 冷凍室 — 冷気・破断"
    accent = (255, 175, 64, 255) if floor == "1f" else (135, 226, 255, 255)
    draw.text((margin, 20), "HAZARD GRAMMAR PROTOTYPE", font=font(18, True), fill=accent)
    draw.text((margin, 48), title, font=font(30, True), fill=(245, 253, 255, 255))
    draw.text((800, 50), "暗色輪郭 + 面固定 + 漏出 + 接地影 / 金輪郭の報酬を併置", font=font(16), fill=(173, 210, 226, 255))

    backdrop = Image.open(PROTO / f"backdrop-{floor}.png").convert("RGBA")
    items = [(variant, PROTO / floor / f"{variant}.png") for variant in VARIANTS]
    current = ROOT / "assets/objects/energy_vent/processed/energy-vent-3.png"
    items.append(("current-v1", current))
    for index, (variant, sprite_path) in enumerate(items):
        col = index % cols
        row = index // cols
        pos = (margin + col * (card_w + gap), margin + header + row * (card_h + gap))
        metrics_log[f"{floor}/{variant}"] = draw_card(
            sheet, pos, (card_w, card_h), floor, variant, sprite_path, backdrop, 0.08 + index * 0.12
        )
    sheet.convert("RGB").save(SHOTS / output_name, quality=95)


def build_mobile(metrics_log: dict[str, dict[str, float]]) -> None:
    width = 390
    margin = 12
    gap = 12
    header = 92
    card_w = width - margin * 2
    card_h = 410
    items = []
    for floor in ("1f", "3f"):
        for variant in ("base", "noshadow", "current-v1"):
            path = (
                ROOT / "assets/objects/energy_vent/processed/energy-vent-3.png"
                if variant == "current-v1"
                else PROTO / floor / f"{variant}.png"
            )
            items.append((floor, variant, path))
    height = margin + header + len(items) * card_h + (len(items) - 1) * gap + margin
    sheet = Image.new("RGBA", (width, height), (3, 13, 28, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 16), "390px VERTICAL CHECK", font=font(17, True), fill=(142, 236, 255, 255))
    draw.text((margin, 44), "BASE / SHADOW / CURRENT", font=font(24, True), fill=(245, 253, 255, 255))
    backdrops = {floor: Image.open(PROTO / f"backdrop-{floor}.png").convert("RGBA") for floor in ("1f", "3f")}
    for index, (floor, variant, sprite_path) in enumerate(items):
        y = margin + header + index * (card_h + gap)
        floor_label = "1F" if floor == "1f" else "3F"
        key = f"mobile/{floor}/{variant}"
        metrics_log[key] = draw_card(sheet, (margin, y), (card_w, card_h), floor, variant, sprite_path, backdrops[floor], 0.20 + index * 0.1)
        draw.text((width - 58, y + 16), floor_label, font=font(18, True), fill=(255, 181, 69, 255) if floor == "1f" else (145, 229, 255, 255))
    sheet.convert("RGB").save(SHOTS / "hazard-grammar-sheet-mobile.png", quality=95)


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    metrics_log: dict[str, dict[str, float]] = {}
    build_pc("1f", "hazard-grammar-sheet-1f.png", metrics_log)
    build_pc("3f", "hazard-grammar-sheet-3f.png", metrics_log)
    build_mobile(metrics_log)
    (PROTO / "measured-metrics.json").write_text(
        json.dumps({"schemaVersion": 1, "prototypeOnly": True, "measurements": metrics_log}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Hazard grammar sheets: 3 / measurements: {len(metrics_log)}")


if __name__ == "__main__":
    main()
