"""Build the 1F stage-device silhouette review sheets.

This is intentionally a pre-sprite workflow. Existing forms come from runtime
alpha channels; proposals are plain geometry. No generated art is used here.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT_DIR = ROOT / "assets/prototypes/floor-silhouettes/1f"
DECISION_MANIFEST = OUT_DIR / "decision-manifest.json"
SCREENSHOTS = ROOT / "screenshots"
SCALE = 0.72
PLAYER_SIZE = (194, 194)
PLAYER_PATH = ROOT / "assets/sprites/dr_yokobo/runtime/idle/idle-1.png"
CLASS_ORDER = ["L", "M", "S", "XS", "enemy", "sign"]
CLASS_LABELS = {
    "L": "L / 舞台装置",
    "M": "M / 操作ギミック・現行大型ハザード",
    "S": "S / 妨害装置",
    "XS": "XS / 収集・小物",
    "enemy": "敵 / 動く障害",
    "sign": "掲示・中景什器",
}


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/meiryob.ttc" if bold else "C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothB.ttc" if bold else "C:/Windows/Fonts/YuGothR.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def alpha_mask(path: str, size: tuple[int, int]) -> Image.Image:
    image = Image.open(ROOT / path.lstrip("/")).convert("RGBA")
    alpha = image.getchannel("A")
    return ImageOps.fit(alpha, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def platform_mask(strip: bool, size: tuple[int, int]) -> Image.Image:
    branch = "strip" if strip else "modular"
    names = ["cap_left.webp", "middle.webp", "cap_right.webp"] if strip else ["cap_left.webp", "mid_a.webp", "cap_right.webp"]
    paths = [ROOT / f"assets/stage01_normal_lab/runtime/platforms/{branch}/{name}" for name in names]
    pieces = [Image.open(path).convert("RGBA") for path in paths]
    overlap = 10 if strip else 12
    width = sum(piece.width for piece in pieces) - overlap * 2
    height = max(piece.height for piece in pieces)
    assembly = Image.new("RGBA", (width, height))
    cursor = 0
    for piece in pieces:
        assembly.alpha_composite(piece, (cursor, 0))
        cursor += piece.width - overlap
    return ImageOps.fit(assembly.getchannel("A"), size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def geometric_mask(shape: str, size: tuple[int, int]) -> Image.Image:
    w, h = size
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    white = 255
    if shape == "vent-short":
        draw.rounded_rectangle((w * .24, h * .72, w * .76, h - 1), radius=max(3, w // 10), fill=white)
        draw.polygon([(w * .42, h * .72), (w * .50, h * .05), (w * .58, h * .72)], fill=white)
    elif shape == "vent-round":
        draw.ellipse((w * .08, h * .62, w * .92, h - 1), fill=white)
        draw.ellipse((w * .31, h * .68, w * .69, h * .92), fill=0)
        draw.polygon([(w * .36, h * .65), (w * .50, h * .04), (w * .64, h * .65)], fill=white)
    elif shape == "vent-wall":
        draw.rounded_rectangle((0, h * .08, w * .34, h * .92), radius=6, fill=white)
        draw.rectangle((w * .28, h * .34, w * .50, h * .66), fill=white)
        draw.polygon([(w * .49, h * .20), (w - 1, h * .50), (w * .49, h * .80)], fill=white)
    elif shape == "vent-pipe":
        draw.rounded_rectangle((0, h * .35, w * .62, h * .82), radius=max(4, h // 7), fill=white)
        draw.rectangle((w * .18, h * .70, w * .42, h - 1), fill=white)
        draw.polygon([(w * .58, h * .18), (w - 1, h * .51), (w * .58, h * .84)], fill=white)
    elif shape == "vent-twin":
        draw.rounded_rectangle((w * .08, h * .76, w * .92, h - 1), radius=7, fill=white)
        for center in (.34, .66):
            draw.polygon([(w * (center - .09), h * .76), (w * center, h * .10), (w * (center + .09), h * .76)], fill=white)
    elif shape == "vent-slit":
        draw.rounded_rectangle((w * .08, h * .78, w * .92, h - 1), radius=6, fill=white)
        draw.polygon([(w * .18, h * .78), (w * .34, h * .22), (w * .50, h * .68), (w * .66, h * .08), (w * .82, h * .78)], fill=white)
    elif shape.startswith("sign-"):
        draw.rounded_rectangle((1, 1, w - 2, h * .80), radius=max(5, h // 10), fill=white)
        if shape == "sign-caution":
            draw.polygon([(w * .50, h * .18), (w * .72, h * .63), (w * .28, h * .63)], fill=0)
        else:
            draw.rounded_rectangle((w * .18, h * .20, w * .82, h * .58), radius=4, fill=0)
        draw.rectangle((w * .43, h * .78, w * .57, h - 1), fill=white)
    else:
        raise ValueError(f"Unknown geometry: {shape}")
    return mask


def wrap(draw: ImageDraw.ImageDraw, text: str, selected_font, width: int, max_lines: int) -> list[str]:
    lines, current = [], ""
    for char in text:
        trial = current + char
        if current and draw.textlength(trial, font=selected_font) > width:
            lines.append(current)
            current = char
            if len(lines) == max_lines:
                break
        else:
            current = trial
    if len(lines) < max_lines and current:
        lines.append(current)
    consumed = sum(map(len, lines))
    if consumed < len(text) and lines:
        while lines[-1] and draw.textlength(lines[-1] + "…", font=selected_font) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def stage_counts(stage: dict, hooks: dict) -> Counter:
    counts: Counter = Counter()
    for key in ("platforms", "pickups", "objects"):
        counts.update(item["prefab"] for item in stage.get(key, []))
    counts.update(item["prefab"] for item in hooks.get("actorSpawnMarkers", []))
    for pattern in stage.get("pickupPatterns", []):
        counts[pattern.get("itemPrefab", "data-crystal-v1")] += int(pattern.get("count", 0))
    return counts


def representative_instance(prefab_id: str, stage: dict, hooks: dict) -> dict | None:
    instances = [
        *stage.get("platforms", []), *stage.get("pickups", []), *stage.get("objects", []),
        *hooks.get("actorSpawnMarkers", []),
    ]
    return next((item for item in instances if item.get("prefab") == prefab_id), None)


def effect_text(prefab: dict, prefab_id: str, count: int, instance: dict | None) -> str:
    collision = prefab.get("collision", {})
    factory = collision.get("factory")
    factory_text = {
        "oneWayRect": "上に乗れる",
        "hazardRect": "触れると常時ダメージ",
        "timedHazardRect": "周期作動中に触れるとダメージ",
        "sensorCircle": "近づくと取得",
        "enemyRect": "接触でダメージ・上から踏める",
        "sensorRect": "触れると作動",
    }.get(factory, "効果なし" if prefab.get("presentation", {}).get("gameplaySignal") == "none" else "表示・誘導")
    details: list[str] = []
    if collision.get("damage") is not None:
        details.append(f"{collision['damage']}ダメージ")
    if collision.get("width") and collision.get("height"):
        details.append(f"危険範囲 {collision['width']}×{collision['height']}")
    elif collision.get("radius"):
        details.append(f"取得半径 {collision['radius']}")
    effect = prefab.get("itemEffect")
    if effect:
        labels = {"score": "スコア", "heal": "回復", "fullHeal": "全回復", "extraLife": "最大ライフ増加"}
        detail = labels.get(effect.get("type"), effect.get("type", "取得効果"))
        if effect.get("value") is not None:
            detail += f" {effect['value']}"
        if effect.get("shieldSeconds"):
            detail += f"＋防護{effect['shieldSeconds']}秒"
        details.append(detail)
    behavior = prefab.get("behavior", {})
    if behavior.get("preset"):
        detail = {"patrol": "巡回", "jump": "跳躍巡回", "hover_laser": "浮遊・レーザー"}.get(behavior["preset"], behavior["preset"])
        if behavior.get("interval"):
            detail += f" {behavior['interval']}秒間隔"
        details.append(detail)
    if factory == "timedHazardRect":
        periods = sorted({item.get("period") for item in stage_data.get("objects", []) if item.get("prefab") == prefab_id and item.get("period")})
        if periods:
            details.insert(0, "周期" + "/".join(str(value) for value in periods) + "秒")
    if prefab.get("presentation", {}).get("gameplaySignal") == "warning":
        details.append("対象装置と状態同期")
    details.append(f"出現{count}")
    return "。".join([factory_text, *details])


def existing_specs(registry: dict, stage: dict, hooks: dict) -> list[dict]:
    counts = stage_counts(stage, hooks)
    specs = [
        ("lab-platform-v1", "規格床パネル（1モジュール代表）", "L", (376, 136), None, "platform-modular", "L"),
        ("lab-bridge-v1", "点検用の渡り板", "L", (420, 150), None, "platform-strip", "L"),
        ("lab-moving-platform-v1", "搬送台", "L", (420, 150), None, "platform-strip", "L"),
        ("lab-lift-v1", "出口昇降リフト", "L", (364, 140), "assets/stage01_normal_lab/runtime/props/lab-lift-idle.webp", None, "L"),
        ("exit-gate-v1", "旧出口ゲート", "L", (280, 300), "assets/stage01_normal_lab/runtime/props/exit-gate.webp", None, "L"),
        ("energy-spill-v1", "現行エネルギー液だまり", "M", (210, 94), "assets/stage01_normal_lab/runtime/props/energy-spill.webp", None, "S"),
        ("energy-vent-v1", "現行エネルギー噴出口", "M", (180, 200), "assets/stage01_normal_lab/runtime/props/vent-3.webp", None, "S"),
        ("lab-switch-v1", "手動起動スイッチ", "M", (140, 80), "assets/stage01_normal_lab/runtime/props/lab-switch-off.webp", None, "M"),
        ("checkpoint-v1", "記録チェックポイント", "M", (118, 186), "assets/stage01_normal_lab/runtime/props/checkpoint.webp", None, "M"),
        ("lab-warning-lamp-v1", "連動警告灯", "S", (90, 100), "assets/stage01_normal_lab/runtime/props/warning-wall.webp", None, "S"),
        ("data-crystal-v1", "データ結晶", "XS", (84, 84), "assets/objects/data_crystal/processed/pickup-1.png", None, "XS"),
        ("lab-coin-v1", "ラボコイン", "XS", (68, 68), "assets/items/korokoro/lab-coin.png", None, "XS"),
        ("cat-can-v1", "ネコ缶", "XS", (68, 68), "assets/items/korokoro/cat-can.png", None, "XS"),
        ("fish-drink-v1", "フィッシュドリンク", "XS", (76, 76), "assets/items/korokoro/fish-drink.png", None, "XS"),
        ("future-heart-v1", "未来ハート", "XS", (82, 82), "assets/items/korokoro/future-heart.png", None, "XS"),
        ("slime-robot-v1", "旧スライムロボ", "enemy", (172, 172), "assets/sprites/slime_robot/patrol/processed/patrol-1.png", None, "enemy"),
        ("nyabi-clean-v1", "ニャビクリーン", "enemy", (202, 202), "assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-1.png", None, "enemy"),
        ("neji-nyabi-v1", "ネジニャビ", "enemy", (176, 176), "assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-1.png", None, "enemy"),
        ("nyabi-drone-v1", "ニャビドローン", "enemy", (156, 156), "assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-1.png", None, "enemy"),
        ("lab-bottle-rack-v1", "試薬棚", "sign", (136, 104), "assets/stage01_normal_lab/runtime/props/decor-side-2.webp", None, "sign"),
        ("lab-wall-panel-v1", "壁面モニタ", "sign", (116, 100), "assets/stage01_normal_lab/runtime/props/decor-side-3.webp", None, "sign"),
        ("lab-cable-coil-v1", "配線束", "sign", (140, 120), "assets/stage01_normal_lab/runtime/props/decor-side-4.webp", None, "sign"),
        ("lab-area-guide-v1", "現行区画案内", "sign", (280, 180), "assets/stage01_normal_lab/runtime/props/lab-info-guide.webp", None, "sign"),
        ("lab-caution-sign-v1", "現行注意標識", "sign", (240, 170), "assets/stage01_normal_lab/runtime/props/lab-info-caution.webp", None, "sign"),
        ("lab-tutorial-panel-v1", "現行チュートリアル", "sign", (260, 180), "assets/stage01_normal_lab/runtime/props/lab-info-tutorial.webp", None, "sign"),
    ]
    result = []
    for prefab_id, name, size_class, draw_size, path, shape, role_class in specs:
        if prefab_id not in registry:
            continue
        prefab = registry[prefab_id]
        instance = representative_instance(prefab_id, stage, hooks)
        excluded = counts[prefab_id] == 0 or prefab.get("presentation", {}).get("gameplaySignal") == "none"
        state = "除外候補" if excluded else "使用中"
        if size_class != role_class and not excluded:
            state = f"作り直し候補（役割{role_class}／現状{size_class}）"
        if size_class == "sign" and max(draw_size) > 100:
            state = "作り直し候補（掲示100超）" if not excluded else "除外候補（掲示100超）"
        collision = prefab.get("collision", {})
        hazard = None
        if collision.get("width") and collision.get("height"):
            hazard = {
                "offsetX": collision.get("offsetX", 0), "offsetY": collision.get("offsetY", 0),
                "width": collision["width"], "height": collision["height"],
            }
        result.append({
            "id": prefab_id, "name": name, "sizeClass": size_class, "roleClass": role_class,
            "drawSize": draw_size, "path": path, "shape": shape, "hazard": hazard,
            "effect": effect_text(prefab, prefab_id, counts[prefab_id], instance),
            "lore": prefab["lore"], "count": counts[prefab_id], "state": state,
            "excluded": excluded, "proposal": False,
        })
    return result


def proposal_specs(registry: dict) -> list[dict]:
    vent = registry["energy-vent-v1"]
    proposals = [
        ("proposal-vent-short", "短い縦噴出口", "S", (72, 104), "vent-short", (18, 0, 36, 104)),
        ("proposal-vent-round", "床埋込円形口", "S", (86, 96), "vent-round", (26, 0, 34, 96)),
        ("proposal-vent-wall", "壁付き横噴出口", "S", (108, 82), "vent-wall", (34, 8, 74, 66)),
        ("proposal-vent-pipe", "低い破断パイプ", "S", (110, 62), "vent-pipe", (52, 6, 58, 52)),
        ("proposal-vent-twin", "小型二連噴出口", "S", (90, 104), "vent-twin", (12, 4, 66, 100)),
        ("proposal-vent-slit", "床スリット噴出口", "S", (86, 92), "vent-slit", (8, 4, 70, 88)),
    ]
    output = []
    for id_value, name, cls, draw_size, shape, hazard_tuple in proposals:
        ox, oy, hw, hh = hazard_tuple
        output.append({
            "id": id_value, "name": name, "sizeClass": cls, "roleClass": cls,
            "drawSize": draw_size, "path": None, "shape": shape,
            "hazard": {"offsetX": ox, "offsetY": oy, "width": hw, "height": hh},
            "effect": "周期作動中に触れるとダメージ。1ダメージ。危険範囲 " + f"{hw}×{hh}。案・未配置",
            "lore": vent["lore"], "count": 0, "state": "新規フォルム案", "excluded": False, "proposal": True,
        })
    sign_proposals = [
        ("proposal-sign-guide", "小型区画案内", "sign-guide", "lab-area-guide-v1"),
        ("proposal-sign-caution", "小型注意標識", "sign-caution", "lab-caution-sign-v1"),
        ("proposal-sign-tutorial", "小型操作標識", "sign-tutorial", "lab-tutorial-panel-v1"),
    ]
    for id_value, name, shape, source_id in sign_proposals:
        prefab = registry[source_id]
        output.append({
            "id": id_value, "name": name, "sizeClass": "sign", "roleClass": "sign",
            "drawSize": (96, 72), "path": None, "shape": shape, "hazard": None,
            "effect": "近づいた時だけ別UIで詳細表示する案。案・未配置",
            "lore": prefab["lore"], "count": 0, "state": "縮小フォルム案", "excluded": False, "proposal": True,
        })
    return output


def build_mask(spec: dict) -> Image.Image:
    size = tuple(spec["drawSize"])
    if spec["shape"] == "platform-modular":
        return platform_mask(False, size)
    if spec["shape"] == "platform-strip":
        return platform_mask(True, size)
    if spec["shape"]:
        return geometric_mask(spec["shape"], size)
    return alpha_mask(spec["path"], size)


def save_masks(specs: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for spec in specs:
        mask = build_mask(spec)
        canvas = Image.new("RGBA", mask.size, (0, 0, 0, 0))
        canvas.paste((18, 56, 76, 255), mask=mask)
        output = OUT_DIR / f"{spec['id']}.png"
        canvas.save(output)
        spec["silhouette"] = str(output.relative_to(ROOT)).replace("\\", "/")
    background = Image.new("RGBA", (360, 200), (18, 56, 76, 255))
    background.save(OUT_DIR / "environment-background.png")


def scaled_mask(spec: dict) -> Image.Image:
    mask = build_mask(spec)
    return mask.resize((max(1, round(mask.width * SCALE)), max(1, round(mask.height * SCALE))), Image.Resampling.LANCZOS)


def player_mask() -> Image.Image:
    return alpha_mask(str(PLAYER_PATH.relative_to(ROOT)), PLAYER_SIZE).resize(
        (round(PLAYER_SIZE[0] * SCALE), round(PLAYER_SIZE[1] * SCALE)), Image.Resampling.LANCZOS
    )


def paste_solid(sheet: Image.Image, mask: Image.Image, xy: tuple[int, int], color: tuple[int, int, int, int]) -> None:
    solid = Image.new("RGBA", mask.size, color)
    sheet.alpha_composite(Image.composite(solid, Image.new("RGBA", mask.size), mask), xy)


def draw_preview(sheet: Image.Image, spec: dict, box: tuple[int, int, int, int]) -> None:
    x, y, w, h = box
    draw = ImageDraw.Draw(sheet)
    floor_y = y + h - 18
    draw.line((x + 8, floor_y, x + w - 8, floor_y), fill=(111, 146, 157, 110), width=2)
    pmask = player_mask()
    paste_solid(sheet, pmask, (x + 15, floor_y - pmask.height), (92, 116, 126, 180))
    draw.text((x + 18, floor_y - pmask.height - 18), "Dr. 194", font=font(12, True), fill=(76, 102, 112, 255))
    mask = scaled_mask(spec)
    sx = x + w - mask.width - 22
    sy = floor_y - mask.height
    paste_solid(sheet, mask, (sx, sy), (17, 58, 80, 255))
    hazard = spec.get("hazard")
    if hazard:
        ox = round(hazard["offsetX"] * SCALE)
        oy = round(hazard["offsetY"] * SCALE)
        hw = round(hazard["width"] * SCALE)
        hh = round(hazard["height"] * SCALE)
        draw.rectangle((sx + ox, sy + oy, sx + ox + hw, sy + oy + hh), outline=(255, 103, 52, 255), width=2)
    size_color = (220, 76, 42, 255) if spec["sizeClass"] != spec["roleClass"] or (spec["sizeClass"] == "sign" and max(spec["drawSize"]) > 100) else (40, 103, 125, 255)
    draw.text((sx, floor_y + 2), f"{spec['drawSize'][0]}×{spec['drawSize'][1]}", font=font(12, True), fill=size_color)


def draw_silhouette_card(sheet: Image.Image, spec: dict, number: int, box: tuple[int, int, int, int]) -> None:
    x, y, w, h = box
    draw = ImageDraw.Draw(sheet)
    outline = (216, 83, 48, 255) if spec["excluded"] else (24, 101, 132, 230)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=16, fill=(249, 253, 252, 255), outline=outline, width=3 if spec["excluded"] else 2)
    draw.ellipse((x + 12, y + 12, x + 58, y + 58), fill=(241, 126, 42, 255))
    label = str(number)
    bb = draw.textbbox((0, 0), label, font=font(23, True))
    draw.text((x + 35 - (bb[2] - bb[0]) / 2, y + 34 - (bb[3] - bb[1]) / 2 - 2), label, font=font(23, True), fill="white")
    draw.text((x + 70, y + 16), spec["name"], font=font(17, True), fill=(9, 42, 62, 255))
    draw.text((x + 70, y + 42), spec["id"], font=font(11), fill=(80, 108, 119, 255))
    draw_preview(sheet, spec, (x + 8, y + 66, w - 16, h - 112))
    state_color = (210, 67, 42, 255) if "除外" in spec["state"] or "作り直し" in spec["state"] else (25, 132, 105, 255)
    draw.text((x + 14, y + h - 36), spec["state"], font=font(13, True), fill=state_color)


def build_silhouette_sheet(specs: list[dict], mobile: bool) -> Path:
    width = 390 if mobile else 1920
    margin, gap = (12, 10) if mobile else (24, 14)
    cols = 1 if mobile else 4
    card_w = width - margin * 2 if mobile else (width - margin * 2 - gap * (cols - 1)) // cols
    card_h = 300
    header_h = 132
    group_h = 54
    grouped = defaultdict(list)
    for spec in specs:
        grouped[spec["sizeClass"]].append(spec)
    height = margin + header_h
    for cls in CLASS_ORDER:
        if grouped[cls]:
            height += group_h + math.ceil(len(grouped[cls]) / cols) * (card_h + gap)
    sheet = Image.new("RGBA", (width, height + margin), (231, 244, 247, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 18), "1F FLOOR DEVICE SILHOUETTES", font=font(18, True), fill=(14, 110, 143, 255))
    draw.text((margin, 47), "フォルムと大きさを先に選ぶ", font=font(29 if not mobile else 24, True), fill=(7, 37, 58, 255))
    draw.text((margin, 89), "全カード同縮尺: ゲーム1px = シート0.72px / 灰色のDr.よこぼ = 描画194×194", font=font(13 if mobile else 15), fill=(67, 101, 114, 255))
    y = margin + header_h
    number_by_id = {spec["id"]: index + 1 for index, spec in enumerate(specs)}
    for cls in CLASS_ORDER:
        items = grouped[cls]
        if not items:
            continue
        draw.rounded_rectangle((margin, y, width - margin, y + 42), radius=10, fill=(14, 83, 116, 255))
        draw.text((margin + 14, y + 9), CLASS_LABELS[cls], font=font(18, True), fill="white")
        y += group_h
        for index, spec in enumerate(items):
            row, col = divmod(index, cols)
            x = margin + col * (card_w + gap)
            cy = y + row * (card_h + gap)
            draw_silhouette_card(sheet, spec, number_by_id[spec["id"]], (x, cy, card_w, card_h))
        y += math.ceil(len(items) / cols) * (card_h + gap)
    suffix = "-mobile" if mobile else ""
    output = SCREENSHOTS / f"silhouette-1f-all{suffix}.png"
    sheet.convert("RGB").save(output, quality=95)
    return output


def draw_script_row(sheet: Image.Image, spec: dict, number: int, y: int, mobile: bool) -> int:
    draw = ImageDraw.Draw(sheet)
    if mobile:
        x, width, height = 12, 366, 410
        outline = (218, 78, 44, 255) if spec["excluded"] else (26, 100, 128, 220)
        draw.rounded_rectangle((x, y, x + width, y + height), radius=14, fill=(249, 253, 252, 255), outline=outline, width=3 if spec["excluded"] else 2)
        draw.text((x + 14, y + 12), f"#{number}  {spec['name']}", font=font(18, True), fill=(8, 39, 61, 255))
        draw.text((x + 14, y + 42), f"{spec['sizeClass']} / {spec['drawSize'][0]}×{spec['drawSize'][1]} / 出現{spec['count']}", font=font(13, True), fill=(33, 106, 132, 255))
        draw_preview(sheet, spec, (x + 10, y + 68, width - 20, 160))
        draw.text((x + 14, y + 236), "効果", font=font(12, True), fill=(16, 112, 142, 255))
        for i, line in enumerate(wrap(draw, spec["effect"], font(13), width - 28, 3)):
            draw.text((x + 14, y + 258 + i * 20), line, font=font(13), fill=(20, 49, 65, 255))
        draw.text((x + 14, y + 323), "設定", font=font(12, True), fill=(16, 112, 142, 255))
        for i, line in enumerate(wrap(draw, spec["lore"], font(13), width - 28, 2)):
            draw.text((x + 14, y + 345 + i * 20), line, font=font(13), fill=(20, 49, 65, 255))
        state_color = (207, 63, 39, 255) if "除外" in spec["state"] or "作り直し" in spec["state"] else (21, 132, 102, 255)
        draw.text((x + 14, y + 386), spec["state"], font=font(13, True), fill=state_color)
        return height + 10
    x, width, height = 24, 2352, 214
    outline = (218, 78, 44, 255) if spec["excluded"] else (177, 206, 215, 255)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=10, fill=(249, 253, 252, 255), outline=outline, width=3 if spec["excluded"] else 1)
    columns = [70, 360, 300, 720, 680, 110, 260]
    cx = x
    draw.text((cx + 10, y + 86), f"#{number}", font=font(22, True), fill=(235, 119, 34, 255)); cx += columns[0]
    draw_preview(sheet, spec, (cx + 4, y + 8, columns[1] - 8, height - 16)); cx += columns[1]
    draw.text((cx + 10, y + 28), spec["name"], font=font(17, True), fill=(8, 39, 61, 255))
    draw.text((cx + 10, y + 58), spec["id"], font=font(11), fill=(80, 108, 119, 255))
    draw.text((cx + 10, y + 92), f"クラス {spec['sizeClass']} / {spec['drawSize'][0]}×{spec['drawSize'][1]}", font=font(13, True), fill=(33, 106, 132, 255)); cx += columns[2]
    for i, line in enumerate(wrap(draw, spec["effect"], font(14), columns[3] - 20, 5)):
        draw.text((cx + 10, y + 22 + i * 25), line, font=font(14), fill=(20, 49, 65, 255))
    cx += columns[3]
    for i, line in enumerate(wrap(draw, spec["lore"], font(14), columns[4] - 20, 5)):
        draw.text((cx + 10, y + 22 + i * 25), line, font=font(14), fill=(20, 49, 65, 255))
    cx += columns[4]
    draw.text((cx + 20, y + 86), str(spec["count"]), font=font(18, True), fill=(25, 83, 105, 255)); cx += columns[5]
    state_color = (207, 63, 39, 255) if "除外" in spec["state"] or "作り直し" in spec["state"] else (21, 132, 102, 255)
    for i, line in enumerate(wrap(draw, spec["state"], font(14, True), columns[6] - 20, 4)):
        draw.text((cx + 10, y + 55 + i * 24), line, font=font(14, True), fill=state_color)
    return height + 8


def build_script_sheet(specs: list[dict], mobile: bool) -> Path:
    width = 390 if mobile else 2400
    header = 154 if mobile else 176
    row_height = 420 if mobile else 222
    height = header + len(specs) * row_height + 24
    sheet = Image.new("RGBA", (width, height), (231, 244, 247, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((12 if mobile else 24, 18), "1F FLOOR SCRIPT", font=font(18, True), fill=(14, 110, 143, 255))
    draw.text((12 if mobile else 24, 48), "舞台装置の台本 — 形・効果・設定・出現数", font=font(24 if mobile else 31, True), fill=(7, 37, 58, 255))
    draw.text((12 if mobile else 24, 91), "効果と出現数はPrefab／配置データから自動生成。除外・作り直しは所長が番号で決定。", font=font(12 if mobile else 15), fill=(67, 101, 114, 255))
    if not mobile:
        labels = ["#", "シルエット（Dr.=194）", "名前・クラス", "効果（自動）", "設定", "数", "状態"]
        widths = [70, 360, 300, 720, 680, 110, 260]
        cx = 24
        for label, cell_width in zip(labels, widths, strict=True):
            draw.text((cx + 8, 140), label, font=font(13, True), fill=(15, 88, 116, 255))
            cx += cell_width
    y = header
    for number, spec in enumerate(specs, 1):
        y += draw_script_row(sheet, spec, number, y, mobile)
    suffix = "-mobile" if mobile else ""
    output = SCREENSHOTS / f"floor-script-1f{suffix}.png"
    sheet.crop((0, 0, width, y + 14)).convert("RGB").save(output, quality=95)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor", default="1f", choices=["1f"])
    args = parser.parse_args()
    del args
    global stage_data
    registry_doc = json.loads((DATA / "prefab-registry.json").read_text(encoding="utf-8"))
    registry = registry_doc["prefabs"]
    stage_data = json.loads((DATA / "crystal-lab-objects.json").read_text(encoding="utf-8"))
    hooks = json.loads((DATA / "crystal-lab-scene-hooks.json").read_text(encoding="utf-8"))
    visible = sorted({
        item["prefab"]
        for item in [*stage_data.get("platforms", []), *stage_data.get("pickups", []), *stage_data.get("objects", []), *hooks.get("actorSpawnMarkers", [])]
    })
    missing_lore = [key for key in visible if not registry[key].get("lore")]
    if missing_lore:
        raise ValueError("Missing lore: " + ", ".join(missing_lore))
    specs = [spec for spec in existing_specs(registry, stage_data, hooks) if spec["id"] in visible]
    specs.sort(key=lambda spec: CLASS_ORDER.index(spec["sizeClass"]))
    if {spec["id"] for spec in specs if not spec["proposal"]} != set(visible):
        raise ValueError("Silhouette spec does not cover all visible prefabs")
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    save_masks(specs)
    outputs = [
        build_silhouette_sheet(specs, False), build_silhouette_sheet(specs, True),
        build_script_sheet(specs, False), build_script_sheet(specs, True),
    ]
    prior = {}
    if DECISION_MANIFEST.is_file():
        prior_doc = json.loads(DECISION_MANIFEST.read_text(encoding="utf-8"))
        prior = {entry["id"]: entry for entry in prior_doc.get("entries", [])}
    decisions = []
    for number, spec in enumerate(specs, 1):
        old = prior.get(spec["id"], {})
        decisions.append({
            "number": number, "id": spec["id"], "name": spec["name"],
            "floor": old.get("floor", "1f"),
            "status": old.get("status", "review"),
            "reason": old.get("reason"), "decidedOn": old.get("decidedOn"),
        })
    active_ids = {entry["id"] for entry in decisions}
    decisions.extend(entry for entry in prior.values() if entry.get("floor") == "2f" and entry["id"] not in active_ids)
    DECISION_MANIFEST.write_text(json.dumps({
        "schemaVersion": 1, "floor": "multi", "kind": "silhouette", "entries": decisions,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "visiblePrefabs": len(visible), "proposals": sum(spec["proposal"] for spec in specs),
        "excludedCandidates": [spec["id"] for spec in specs if spec["excluded"]],
        "outputs": [str(path.relative_to(ROOT)).replace("\\", "/") for path in outputs],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
