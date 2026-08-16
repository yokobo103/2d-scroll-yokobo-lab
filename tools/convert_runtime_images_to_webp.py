"""Convert only shipped runtime images to WebP and update their references."""

import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src" / "asset-manifest.js"
CONTACT_SPEC = ROOT / "assets" / "sprites" / "dr_yokobo" / "runtime" / "contact-spec.json"


def current_webp(source: Path, destination: Path) -> bool:
    if not destination.exists() or destination.stat().st_mtime_ns < source.stat().st_mtime_ns:
        return False
    try:
        with Image.open(destination) as image:
            image.verify()
        return True
    except Exception:
        return False


def convert(relative: str) -> str:
    source = ROOT / relative.lstrip("/")
    if "${" in relative:
        pattern = re.sub(r"\$\{[^}]+\}", "*", relative.lstrip("/"))
        matches = list(ROOT.glob(pattern))
        if source.suffix.lower() == ".webp":
            for match in matches:
                try:
                    with Image.open(match) as image:
                        image.verify()
                except Exception:
                    fallback = match.with_suffix(".png")
                    if not fallback.exists():
                        raise
                    Image.open(fallback).convert("RGBA").save(match, "WEBP", quality=90, method=4, exact=True)
            return relative
        if not matches:
            raise FileNotFoundError(f"no runtime frames match {relative}")
        for match in matches:
            destination = match.with_suffix(".webp")
            if current_webp(match, destination):
                continue
            Image.open(match).convert("RGBA").save(destination, "WEBP", quality=90, method=4, exact=True)
        return str(Path(relative).with_suffix(".webp")).replace("\\", "/")
    if source.suffix.lower() == ".webp":
        try:
            with Image.open(source) as image:
                image.verify()
        except Exception:
            fallback = source.with_suffix(".png")
            if not fallback.exists():
                raise
            Image.open(fallback).convert("RGBA").save(source, "WEBP", quality=90, method=4, exact=True)
        return relative
    if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif"}:
        return relative
    if not source.exists():
        raise FileNotFoundError(source)
    destination = source.with_suffix(".webp")
    if current_webp(source, destination):
        return str(Path(relative).with_suffix(".webp")).replace("\\", "/")
    image = Image.open(source).convert("RGBA")
    image.save(destination, "WEBP", quality=90, method=4, exact=True)
    return str(Path(relative).with_suffix(".webp")).replace("\\", "/")


def update_manifest() -> int:
    source = MANIFEST.read_text(encoding="utf-8")
    converted = 0

    def replace(match: re.Match) -> str:
        nonlocal converted
        path = match.group(1)
        updated = convert(path)
        converted += updated != path
        return match.group(0).replace(path, updated)

    source = re.sub(r"(/assets/[^'\"`]+\.(?:png|jpe?g|gif|webp))", replace, source, flags=re.IGNORECASE)
    MANIFEST.write_text(source, encoding="utf-8")
    return converted


def update_contact_spec() -> int:
    spec = json.loads(CONTACT_SPEC.read_text(encoding="utf-8"))
    converted = 0
    for action in spec["actions"].values():
        for frame in action["frames"]:
            updated = convert(frame["runtime"])
            converted += updated != frame["runtime"]
            frame["runtime"] = updated
    CONTACT_SPEC.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return converted


if __name__ == "__main__":
    total = update_manifest() + update_contact_spec()
    print(f"Converted {total} runtime image references to WebP.")
