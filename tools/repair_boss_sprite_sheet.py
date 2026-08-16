"""Repair the shared horizontal boss pose without rotating runtime parts.

Both laser sheets start from the same horizontal pose.  The down sheet's
generated first cell was cropped at its left/right cell edges, while the up
sheet contains the complete pose.  Keep one authoritative horizontal frame
by copying that complete cell into the down sheet before normal processing.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "sprites" / "bosses" / "nyabi_drone_core"
UP_SHEET = ASSET_ROOT / "arm_up" / "raw-sheet-safe.png"
DOWN_SHEET = ASSET_ROOT / "arm_down" / "raw-sheet-safe.png"
CELL_SIZE = 512


def main() -> None:
    up = Image.open(UP_SHEET).convert("RGBA")
    down = Image.open(DOWN_SHEET).convert("RGBA")
    if up.size != down.size or up.size != (CELL_SIZE * 3, CELL_SIZE * 2):
        raise SystemExit(f"unexpected boss sheet sizes: up={up.size}, down={down.size}")

    horizontal = up.crop((0, 0, CELL_SIZE, CELL_SIZE))
    down.paste(horizontal, (0, 0))
    down.save(DOWN_SHEET)
    print(f"repaired shared horizontal pose: {DOWN_SHEET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
