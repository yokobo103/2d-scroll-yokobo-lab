"""Build static floor asset catalog PNGs from data/asset-catalog.json.

The catalog is a chat-facing decision artifact, not a browser UI. Backgrounds
must be composited from the full runtime parallax stack so visual decisions are
made against the same bright scene as the game.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data/asset-catalog.json"
SCREENSHOTS = ROOT / "screenshots"
PLATE_DIR = ROOT / "assets/prototypes/floor-catalog"
PARALLAX = {
    "1f": [
        ROOT / "assets/stage01_normal_lab/runtime/parallax/sky.webp",
        ROOT / "assets/stage01_normal_lab/runtime/parallax/far.webp",
        ROOT / "assets/stage01_normal_lab/runtime/parallax/mid.webp",
        ROOT / "assets/stage01_normal_lab/runtime/parallax/near.webp",
    ]
}
REWARD_PATH = ROOT / "assets/objects/data_crystal/processed/pickup-1.png"
REWARD_SIZE = 94


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/meiryob.ttc" if bold else "C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothB.ttc" if bold else "C:/Windows/Fonts/YuGothR.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def alpha_coverage(image: Image.Image) -> float:
    alpha = image.convert("RGBA").getchannel("A")
    histogram = alpha.histogram()
    visible = sum(histogram[1:])
    return visible / (image.width * image.height)


def composite_backdrop(floor: str) -> tuple[Image.Image, dict[str, float]]:
    paths = PARALLAX.get(floor)
    if not paths:
        raise ValueError(f"No four-layer parallax recipe is registered for floor {floor}")
    layers = [Image.open(path).convert("RGBA") for path in paths]
    size = layers[0].size
    if any(layer.size != size for layer in layers):
        raise ValueError(f"Parallax layer sizes differ for floor {floor}")
    result = Image.new("RGBA", size)
    report: dict[str, float] = {}
    for path, layer in zip(paths, layers, strict=True):
        report[path.stem] = alpha_coverage(layer)
        result = Image.alpha_composite(result, layer)
    report["composite"] = alpha_coverage(result)
    PLATE_DIR.mkdir(parents=True, exist_ok=True)
    result.save(PLATE_DIR / f"backdrop-{floor}-composite.png")
    return result, report


def load_asset(path_value: str, size: tuple[int, int]) -> Image.Image:
    path = ROOT / path_value.lstrip("/")
    if not path.is_file():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)


def reward_layer() -> Image.Image:
    layer = Image.new("RGBA", (132, 132))
    draw = ImageDraw.Draw(layer)
    draw.ellipse((7, 7, 125, 125), fill=(255, 222, 111, 24), outline=(255, 222, 111, 245), width=4)
    draw.ellipse((16, 16, 116, 116), outline=(255, 248, 192, 125), width=2)
    crystal = Image.open(REWARD_PATH).convert("RGBA").resize((REWARD_SIZE, REWARD_SIZE), Image.Resampling.LANCZOS)
    layer.alpha_composite(crystal, ((132 - REWARD_SIZE) // 2, (132 - REWARD_SIZE) // 2))
    return layer


def scene_crop(backdrop: Image.Image, size: tuple[int, int], offset: float) -> Image.Image:
    width, height = backdrop.size
    crop_width = min(width, round(height * size[0] / size[1]))
    left = round((width - crop_width) * max(0, min(1, offset)))
    crop = backdrop.crop((left, 0, left + crop_width, height))
    return ImageOps.fit(crop, size, Image.Resampling.LANCZOS, centering=(0.5, 0.60))


def wrap_chars(draw: ImageDraw.ImageDraw, text: str, selected_font: ImageFont.ImageFont, max_width: int, max_lines: int = 2) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        proposed = current + char
        if current and draw.textlength(proposed, font=selected_font) > max_width:
            lines.append(current)
            current = char
            if len(lines) == max_lines - 1:
                break
        else:
            current = proposed
    consumed = sum(len(line) for line in lines)
    remaining = text[consumed:]
    if len(lines) < max_lines and remaining:
        tail = ""
        for char in remaining:
            candidate = tail + char
            suffix = "…" if len(tail) + consumed + 1 < len(text) else ""
            if tail and draw.textlength(candidate + suffix, font=selected_font) > max_width:
                tail = tail.rstrip("、。") + "…"
                break
            tail = candidate
        lines.append(tail)
    return lines[:max_lines]


def draw_card(
    sheet: Image.Image,
    entry: dict,
    backdrop: Image.Image,
    position: tuple[int, int],
    card_size: tuple[int, int],
    offset: float,
    show_number: bool,
) -> None:
    x, y = position
    width, height = card_size
    draw = ImageDraw.Draw(sheet)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=18, fill=(248, 253, 252, 247), outline=(19, 86, 120, 230), width=2)

    title = entry["id"].replace(f"{entry['floor']}-{entry['kind']}-", "")
    draw.text((x + 18, y + 16), title.upper(), font=font(19, True), fill=(8, 41, 68, 255))
    status_label = "候補" if entry["status"] == "candidate" else "採用中"
    status_color = (255, 151, 48, 255) if entry["status"] == "candidate" else (22, 155, 126, 255)
    draw.rounded_rectangle((x + width - 92, y + 13, x + width - 14, y + 45), radius=12, fill=status_color)
    draw.text((x + width - 78, y + 18), status_label, font=font(15, True), fill=(255, 255, 255, 255))

    scene_x, scene_y = x + 10, y + 58
    scene_w, scene_h = width - 20, 264
    scene = scene_crop(backdrop, (scene_w, scene_h), offset)
    baseline = scene_h - 20
    draw_w, draw_h = entry.get("drawSize", [180, 200])
    vent_x = 20
    vent_y = baseline - draw_h
    if entry.get("sheetShadow", True):
        shadow = Image.new("RGBA", scene.size)
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.ellipse((vent_x + 12, baseline - 18, vent_x + draw_w - 8, baseline + 7), fill=(3, 14, 30, 115))
        shadow = shadow.filter(ImageFilter.GaussianBlur(7))
        scene = Image.alpha_composite(scene, shadow)
    scene.alpha_composite(load_asset(entry["file"], (draw_w, draw_h)), (vent_x, vent_y))
    scene.alpha_composite(reward_layer(), (scene_w - 138, baseline - 126))
    sheet.alpha_composite(scene, (scene_x, scene_y))

    badge_text = str(entry.get("number", "?")) if show_number and entry["status"] == "candidate" else "現"
    badge_fill = (255, 145, 36, 255) if entry["status"] == "candidate" else (18, 134, 111, 255)
    draw.ellipse((scene_x + 10, scene_y + 10, scene_x + 78, scene_y + 78), fill=badge_fill, outline=(255, 255, 255, 245), width=4)
    badge_font = font(40 if badge_text != "現" else 32, True)
    box = draw.textbbox((0, 0), badge_text, font=badge_font)
    draw.text((scene_x + 44 - (box[2] - box[0]) / 2, scene_y + 42 - (box[3] - box[1]) / 2 - 3), badge_text, font=badge_font, fill=(255, 255, 255, 255))

    intent_font = font(16)
    draw.text((x + 18, y + 336), "INTENT", font=font(13, True), fill=(22, 122, 156, 255))
    for index, line in enumerate(wrap_chars(draw, entry["intent"], intent_font, width - 36, 2)):
        draw.text((x + 18, y + 360 + index * 25), line, font=intent_font, fill=(19, 55, 76, 255))
    draw.text((x + 18, y + height - 28), f"{draw_w}×{draw_h} / reward 94", font=font(13), fill=(90, 122, 136, 255))


def build_sheet(
    floor: str,
    kind: str,
    mode: str,
    mobile: bool,
    entries: list[dict],
    backdrop: Image.Image,
) -> Path:
    width = 390 if mobile else 1536
    margin = 12 if mobile else 24
    gap = 12 if mobile else 16
    cols = 1 if mobile else 4
    header = 116
    card_h = 440
    card_w = width - margin * 2 if mobile else (width - margin * 2 - gap * (cols - 1)) // cols
    rows = max(1, (len(entries) + cols - 1) // cols)
    height = margin + header + rows * card_h + (rows - 1) * gap + margin
    sheet = Image.new("RGBA", (width, height), (232, 246, 249, 255))
    draw = ImageDraw.Draw(sheet)
    mode_label = "CANDIDATES / 番号で採否" if mode == "candidates" else "CANON / 採用済み"
    draw.text((margin, 18), f"{floor.upper()} {kind.upper()} ASSET CATALOG", font=font(18, True), fill=(17, 107, 140, 255))
    draw.text((margin, 48), mode_label, font=font(29 if not mobile else 24, True), fill=(7, 39, 66, 255))
    draw.text((margin, 88), "4-layer runtime backdrop / reward reference / game draw size", font=font(14), fill=(70, 108, 124, 255))

    for index, entry in enumerate(entries):
        col = index % cols
        row = index // cols
        position = (margin + col * (card_w + gap), margin + header + row * (card_h + gap))
        draw_card(sheet, entry, backdrop, position, (card_w, card_h), 0.04 + (index * 0.13) % 0.85, mode == "candidates")

    mobile_suffix = "-mobile" if mobile else ""
    output = SCREENSHOTS / f"catalog-{floor}-{kind}-{mode}{mobile_suffix}.png"
    sheet.convert("RGB").save(output, quality=95)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor", default="1f")
    parser.add_argument("--kind", default="hazard")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    selected = [entry for entry in catalog["entries"] if entry["floor"] == args.floor and entry["kind"] == args.kind]
    candidates = sorted((entry for entry in selected if entry["status"] == "candidate"), key=lambda entry: entry["number"])
    adopted = sorted((entry for entry in selected if entry["status"] == "adopted"), key=lambda entry: entry.get("number", 9999))
    if not candidates:
        raise ValueError(f"No candidates for {args.floor}/{args.kind}")
    backdrop, coverage = composite_backdrop(args.floor)
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)

    candidate_entries = [*candidates, *adopted[:1]]
    outputs = [
        build_sheet(args.floor, args.kind, "candidates", False, candidate_entries, backdrop),
        build_sheet(args.floor, args.kind, "candidates", True, candidate_entries, backdrop),
        build_sheet(args.floor, args.kind, "canon", False, adopted, backdrop),
        build_sheet(args.floor, args.kind, "canon", True, adopted, backdrop),
    ]
    manifest = {
        "schemaVersion": 1,
        "floor": args.floor,
        "kind": args.kind,
        "layerOrder": [path.stem for path in PARALLAX[args.floor]],
        "alphaCoverage": coverage,
        "candidateIds": [entry["id"] for entry in candidates],
        "adoptedIds": [entry["id"] for entry in adopted],
        "outputs": [str(path.relative_to(ROOT)).replace("\\", "/") for path in outputs],
    }
    (PLATE_DIR / f"catalog-{args.floor}-{args.kind}-build.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
