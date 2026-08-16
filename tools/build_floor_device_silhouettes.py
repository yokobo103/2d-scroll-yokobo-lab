"""Draw pre-sprite silhouettes for the six 1F laboratory obstacle families."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from build_floor_silhouette_sheet import ROOT, SCREENSHOTS, SCALE, font, paste_solid, player_mask, wrap


OUT_DIR = ROOT / "assets/prototypes/floor-silhouettes/1f/devices"
BODY = (18, 56, 76, 255)
MOVER = (75, 125, 143, 255)
RANGE = (255, 102, 52, 255)
ARROW = (18, 150, 168, 255)

SPECS = [
    {"id": "dust-blower-a", "name": "除塵ブロワー A", "family": "blower", "variant": "wall", "body": (180, 180), "mover": (88, 40), "direction": "right", "effect": "横風で押し戻す／ダメージなし", "lore": "入室時に埃を飛ばすエアシャワー。稼働が止まらない"},
    {"id": "dust-blower-b", "name": "除塵ブロワー B", "family": "blower", "variant": "arch", "body": (190, 180), "mover": (100, 34), "direction": "left", "effect": "低い横風。スライドで風下を抜ける", "lore": "通路一体型の除塵機。送風の間隔だけが崩れている"},
    {"id": "sample-arm-a", "name": "試料搬送アーム A", "family": "arm", "variant": "top", "body": (180, 190), "mover": (100, 36), "direction": "right", "effect": "腕が横へ伸びて通路を塞ぐ", "lore": "棚から試料を取り出すアーム。対象を見失って空振りを続ける"},
    {"id": "sample-arm-b", "name": "試料搬送アーム B", "family": "arm", "variant": "side", "body": (170, 190), "mover": (92, 34), "direction": "left", "effect": "低い腕が往復。引いた隙かスライドで通る", "lore": "側面レール式の搬送アーム。空の通路を確認し続けている"},
    {"id": "floor-roller-a", "name": "床磨きローラー A", "family": "roller", "variant": "single", "body": (160, 130), "mover": (92, 72), "direction": "rotate", "effect": "常時回転。触れると弾かれる", "lore": "床を磨く固定式の回転ブラシ"},
    {"id": "floor-roller-b", "name": "床磨きローラー B", "family": "roller", "variant": "low", "body": (190, 120), "mover": (108, 58), "direction": "rotate", "effect": "低い二連ブラシ。ジャンプで越す", "lore": "広い通路用の二連ブラシ。清掃範囲から戻らなくなった"},
    {"id": "sample-press-a", "name": "圧着プレス A", "family": "press", "variant": "column", "body": (180, 200), "mover": (92, 108), "direction": "down", "effect": "上から降下。可動部だけ1ダメージ", "lore": "標本を封入する圧着装置。空打ちを繰り返している"},
    {"id": "sample-press-b", "name": "圧着プレス B", "family": "press", "variant": "arch", "body": (200, 190), "mover": (100, 96), "direction": "down", "effect": "短いストロークで通路を周期的に押さえる", "lore": "通路をまたぐ封入プレス。試料がなくても工程を進めている"},
    {"id": "reverse-conveyor-a", "name": "逆走コンベア A", "family": "conveyor", "variant": "short", "body": (200, 100), "mover": (100, 32), "direction": "left", "effect": "乗ると押し戻す／ダメージなし", "lore": "試料を戻す搬送ライン。向きが逆のまま止まらない"},
    {"id": "reverse-conveyor-b", "name": "逆走コンベア B", "family": "conveyor", "variant": "raised", "body": (190, 120), "mover": (100, 30), "direction": "left", "effect": "高い搬送面。走り抜けるか跳んで越す", "lore": "検査台へ戻す短い搬送機。返送工程だけが残っている"},
    {"id": "auto-partition-a", "name": "自動隔壁 A", "family": "barrier", "variant": "split", "body": (180, 200), "mover": (90, 110), "direction": "inward", "effect": "左右から閉じて塞ぐ／ダメージなし", "lore": "区画を仕切る扉。開閉を繰り返している"},
    {"id": "auto-partition-b", "name": "自動隔壁 B", "family": "barrier", "variant": "shutter", "body": (190, 200), "mover": (100, 108), "direction": "down", "effect": "上から閉じる。開いている間だけ通れる", "lore": "防塵用の昇降隔壁。人の通過を待たずに閉じる"},
]


def device_layers(spec: dict) -> tuple[Image.Image, Image.Image, tuple[int, int, int, int]]:
    width, height = spec["body"]
    body = Image.new("L", (width, height))
    mover = Image.new("L", (width, height))
    bd, md = ImageDraw.Draw(body), ImageDraw.Draw(mover)
    mw, mh = spec["mover"]
    family, variant = spec["family"], spec["variant"]
    if family == "blower":
        if variant == "wall":
            bd.rounded_rectangle((0, 18, 58, height - 1), radius=14, fill=255)
            bd.rectangle((44, 58, 76, 126), fill=255)
            box = (72, 72, 72 + mw, 72 + mh)
        else:
            bd.rounded_rectangle((0, 0, width - 1, 34), radius=12, fill=255)
            bd.rectangle((0, 18, 28, height - 1), fill=255)
            bd.rectangle((width - 29, 18, width - 1, height - 1), fill=255)
            box = (44, 72, 44 + mw, 72 + mh)
        md.polygon([(box[0], box[1]), (box[2], (box[1] + box[3]) // 2), (box[0], box[3])], fill=255)
    elif family == "arm":
        if variant == "top":
            bd.rounded_rectangle((8, 0, width - 8, 34), radius=10, fill=255)
            bd.rectangle((width - 38, 20, width - 8, height - 1), fill=255)
            box = (18, 68, 18 + mw, 68 + mh)
        else:
            bd.rounded_rectangle((0, 20, 44, height - 1), radius=12, fill=255)
            bd.ellipse((8, 54, 66, 112), fill=255)
            box = (48, 76, 48 + mw, 76 + mh)
        md.rounded_rectangle(box, radius=mh // 3, fill=255)
        md.ellipse((box[2] - 18, box[1] - 8, box[2] + 8, box[3] + 8), fill=255)
    elif family == "roller":
        bd.rounded_rectangle((6, 10, width - 6, height - 28), radius=18, fill=255)
        bd.rectangle((22, height - 40, 40, height - 1), fill=255)
        bd.rectangle((width - 40, height - 40, width - 22, height - 1), fill=255)
        box = ((width - mw) // 2, height - mh, (width + mw) // 2, height)
        md.ellipse(box, fill=255)
        if variant == "low":
            md.rectangle((box[0] + 12, box[1] + mh // 2 - 5, box[2] - 12, box[1] + mh // 2 + 5), fill=0)
    elif family == "press":
        bd.rectangle((0, 0, 28, height - 1), fill=255)
        bd.rectangle((width - 29, 0, width - 1, height - 1), fill=255)
        bd.rounded_rectangle((0, 0, width - 1, 36), radius=12, fill=255)
        bd.rectangle((0, height - 22, width - 1, height - 1), fill=255)
        box = ((width - mw) // 2, 42, (width + mw) // 2, 42 + mh)
        md.rounded_rectangle(box, radius=10 if variant == "arch" else 4, fill=255)
    elif family == "conveyor":
        y = 34 if variant == "short" else 44
        bd.rounded_rectangle((0, y, width - 1, height - 24), radius=12, fill=255)
        bd.rectangle((20, height - 38, 38, height - 1), fill=255)
        bd.rectangle((width - 38, height - 38, width - 20, height - 1), fill=255)
        box = ((width - mw) // 2, y + 4, (width + mw) // 2, y + 4 + mh)
        md.rounded_rectangle(box, radius=mh // 3, fill=255)
        for x in range(box[0] + 12, box[2] - 6, 22):
            md.ellipse((x, box[1] + 6, x + 10, box[3] - 6), fill=0)
    elif family == "barrier":
        bd.rectangle((0, 0, 30, height - 1), fill=255)
        bd.rectangle((width - 31, 0, width - 1, height - 1), fill=255)
        bd.rectangle((0, 0, width - 1, 28), fill=255)
        if variant == "split":
            box = ((width - mw) // 2, 56, (width + mw) // 2, 56 + mh)
            md.rectangle((box[0], box[1], width // 2 - 4, box[3]), fill=255)
            md.rectangle((width // 2 + 4, box[1], box[2], box[3]), fill=255)
        else:
            box = ((width - mw) // 2, 32, (width + mw) // 2, 32 + mh)
            md.rectangle(box, fill=255)
            for y in range(box[1] + 12, box[3], 18):
                md.line((box[0], y, box[2], y), fill=0, width=4)
    else:
        raise ValueError(f"Unknown family {family}")
    assert 70 <= max(mw, mh) <= 110, f"{spec['id']}: moving part is not S class"
    return body, mover, box


def save_asset(spec: dict) -> Path:
    body, mover, _ = device_layers(spec)
    canvas = Image.new("RGBA", body.size)
    paste_solid(canvas, body, (0, 0), BODY)
    paste_solid(canvas, mover, (0, 0), MOVER)
    output = OUT_DIR / f"{spec['id']}.png"
    canvas.save(output)
    return output


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], direction: str) -> None:
    draw.line((*start, *end), fill=ARROW, width=4)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    for offset in (-.55, .55):
        point = (end[0] - 13 * math.cos(angle + offset), end[1] - 13 * math.sin(angle + offset))
        draw.line((*end, *point), fill=ARROW, width=4)
    if direction in {"rotate", "inward"}:
        draw.line((*end, *start), fill=ARROW, width=2)


def preview(sheet: Image.Image, spec: dict, box: tuple[int, int, int, int]) -> None:
    x, y, width, height = box
    draw = ImageDraw.Draw(sheet)
    floor_y = y + height - 18
    draw.line((x + 4, floor_y, x + width - 4, floor_y), fill=(115, 145, 154, 120), width=2)
    pmask = player_mask()
    paste_solid(sheet, pmask, (x + 8, floor_y - pmask.height), (100, 120, 128, 180))
    body, mover, mover_box = device_layers(spec)
    target_w, target_h = round(body.width * SCALE), round(body.height * SCALE)
    body = body.resize((target_w, target_h), Image.Resampling.LANCZOS)
    mover = mover.resize((target_w, target_h), Image.Resampling.LANCZOS)
    sx, sy = x + width - target_w - 12, floor_y - target_h
    paste_solid(sheet, body, (sx, sy), BODY)
    paste_solid(sheet, mover, (sx, sy), MOVER)
    mx0, my0, mx1, my1 = (round(value * SCALE) for value in mover_box)
    draw.rectangle((sx + mx0, sy + my0, sx + mx1, sy + my1), outline=RANGE, width=2)
    cx, cy = sx + (mx0 + mx1) // 2, sy + (my0 + my1) // 2
    direction = spec["direction"]
    if direction == "right": arrow(draw, (cx - 30, cy), (cx + 34, cy), direction)
    elif direction == "left": arrow(draw, (cx + 30, cy), (cx - 34, cy), direction)
    elif direction == "down": arrow(draw, (cx, cy - 30), (cx, cy + 34), direction)
    elif direction == "inward": arrow(draw, (cx - 42, cy), (cx - 6, cy), direction); arrow(draw, (cx + 42, cy), (cx + 6, cy), direction)
    else: arrow(draw, (cx - 26, cy - 20), (cx + 24, cy - 20), direction)
    draw.text((sx, floor_y + 2), f"本体 {spec['body'][0]}×{spec['body'][1]} / 可動S {spec['mover'][0]}×{spec['mover'][1]}", font=font(11, True), fill=(36, 102, 124, 255))


def card(sheet: Image.Image, spec: dict, number: int, box: tuple[int, int, int, int]) -> None:
    x, y, width, height = box
    draw = ImageDraw.Draw(sheet)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=16, fill=(249, 253, 252, 255), outline=(20, 96, 126, 240), width=2)
    draw.ellipse((x + 12, y + 12, x + 58, y + 58), fill=(241, 126, 42, 255))
    draw.text((x + 27, y + 19), str(number), font=font(22, True), fill="white")
    draw.text((x + 70, y + 14), spec["name"], font=font(18, True), fill=(8, 40, 60, 255))
    draw.text((x + 70, y + 42), spec["effect"], font=font(12, True), fill=(28, 112, 137, 255))
    preview(sheet, spec, (x + 8, y + 66, width - 16, 200))
    for index, line in enumerate(wrap(draw, spec["lore"], font(13), width - 28, 2)):
        draw.text((x + 14, y + 272 + index * 21), line, font=font(13), fill=(24, 54, 68, 255))


def build_sheet(mobile: bool) -> Path:
    width = 390 if mobile else 1920
    margin, gap, cols = (12, 10, 1) if mobile else (24, 14, 4)
    card_w = width - margin * 2 if mobile else (width - margin * 2 - gap * (cols - 1)) // cols
    card_h, header = 326, 130
    rows = math.ceil(len(SPECS) / cols)
    sheet = Image.new("RGBA", (width, header + rows * (card_h + gap) + 24), (231, 244, 247, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 18), "1F LAB DEVICE SILHOUETTES", font=font(18, True), fill=(14, 110, 143, 255))
    draw.text((margin, 48), "本体M＋可動部Sで避け方を読む", font=font(25 if mobile else 31, True), fill=(7, 37, 58, 255))
    draw.text((margin, 91), "灰: Dr.よこぼ194 / 濃: 本体 / 淡: 可動部 / 赤枠: 可動・危険範囲 / 矢印: 動く方向", font=font(11 if mobile else 14), fill=(67, 101, 114, 255))
    for index, spec in enumerate(SPECS):
        row, col = divmod(index, cols)
        x, y = margin + col * (card_w + gap), header + row * (card_h + gap)
        card(sheet, spec, index + 1, (x, y, card_w, card_h))
    suffix = "-mobile" if mobile else ""
    output = SCREENSHOTS / f"silhouette-1f-devices{suffix}.png"
    sheet.convert("RGB").save(output, quality=95)
    return output


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    assets = [save_asset(spec) for spec in SPECS]
    outputs = [build_sheet(False), build_sheet(True)]
    print(json.dumps({
        "candidates": len(SPECS),
        "movingPartsSClass": all(70 <= max(spec["mover"]) <= 110 for spec in SPECS),
        "assets": [str(path.relative_to(ROOT)).replace("\\", "/") for path in assets],
        "outputs": [str(path.relative_to(ROOT)).replace("\\", "/") for path in outputs],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
