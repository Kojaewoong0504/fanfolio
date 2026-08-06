from pathlib import Path

from PIL import Image


def save_uploaded_bytes(storage_dir: str, asset_id: str, content: bytes) -> str:
    root = Path(storage_dir).resolve() / "assets"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{asset_id}.bin"
    path.write_bytes(content)
    return str(path)


def remove_light_background(storage_dir: str, asset_id: str, source_path: str) -> str:
    source = Image.open(source_path).convert("RGBA")
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, _alpha = source.getpixel((x, y))
            if red > 242 and green > 242 and blue > 242:
                source.putpixel((x, y), (red, green, blue, 0))
    output = Path(storage_dir).resolve() / "assets" / f"{asset_id}-transparent.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    source.save(output, "PNG")
    return str(output)


def compose_card_preview(
    storage_dir: str,
    card_id: str,
    base_path: str,
    handwriting_path: str | None,
    transform: dict[str, float] | None,
) -> str:
    base = Image.open(base_path).convert("RGBA")
    if handwriting_path:
        handwriting = Image.open(handwriting_path).convert("RGBA")
        options = transform or {}
        width = int(options.get("width", handwriting.width))
        height = int(options.get("height", handwriting.height * width / handwriting.width))
        handwriting = handwriting.resize((max(1, width), max(1, height)))
        rotation = float(options.get("rotation", 0))
        if rotation:
            handwriting = handwriting.rotate(
                rotation, expand=True, resample=Image.Resampling.BICUBIC
            )
        x = int(options.get("x", 0))
        y = int(options.get("y", 0))
        base.alpha_composite(handwriting, (x, y))
    output = Path(storage_dir).resolve() / "previews" / f"{card_id}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    base.save(output, "PNG")
    return str(output)
