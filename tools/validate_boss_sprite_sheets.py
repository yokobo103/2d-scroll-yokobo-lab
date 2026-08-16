"""Fail when a boss sprite frame is cropped or the shared pose diverges."""

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "sprites" / "bosses" / "nyabi_drone_core"
CELL_SIZE = 512
RAW_SAFE_MARGIN = 12
PROCESSED_MARGIN = 24


def magenta_content_bbox(cell: Image.Image):
    rgb = cell.convert("RGB")
    background = Image.new("RGB", cell.size, (255, 0, 255))
    return ImageChops.difference(rgb, background).getbbox()


def margins(size, bbox):
    width, height = size
    left, top, right, bottom = bbox
    return left, top, width - right, height - bottom


def require_margin(label, size, bbox, minimum):
    if bbox is None:
        raise AssertionError(f"{label}: empty frame")
    found = margins(size, bbox)
    if min(found) < minimum:
        raise AssertionError(f"{label}: cropped/unsafe margins {found}; need >= {minimum}px")


def main() -> None:
    raw_cells = {}
    for direction in ("arm_up", "arm_down"):
        raw_path = ASSET_ROOT / direction / "raw-sheet-safe.png"
        if raw_path.exists():
            sheet = Image.open(raw_path).convert("RGBA")
            if sheet.size != (CELL_SIZE * 3, CELL_SIZE * 2):
                raise AssertionError(f"{direction}: unexpected sheet size {sheet.size}")
            for index in range(6):
                col, row = index % 3, index // 3
                cell = sheet.crop((col * CELL_SIZE, row * CELL_SIZE, (col + 1) * CELL_SIZE, (row + 1) * CELL_SIZE))
                require_margin(f"{direction} raw frame {index + 1}", cell.size, magenta_content_bbox(cell), RAW_SAFE_MARGIN)
                raw_cells[(direction, index)] = cell

        for index in range(6):
            frame_path = ASSET_ROOT / direction / "processed" / f"nyabi-drone-core-{direction.replace('_', '-')}-{index + 1}.webp"
            frame = Image.open(frame_path).convert("RGBA")
            require_margin(f"{direction} processed frame {index + 1}", frame.size, frame.getchannel("A").getbbox(), PROCESSED_MARGIN)

    if raw_cells and ImageChops.difference(raw_cells[("arm_up", 0)], raw_cells[("arm_down", 0)]).getbbox() is not None:
        raise AssertionError("horizontal start pose must be identical in both source sheets")
    print("Boss sprite sheet QA passed: all frames have safe margins and the horizontal pose is shared.")


if __name__ == "__main__":
    main()
